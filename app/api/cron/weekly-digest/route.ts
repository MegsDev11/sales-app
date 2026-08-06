import { NextResponse } from "next/server";
import { adminClient, errorMessage } from "@/lib/api/route-helpers";
import { recipientsForModule, sendStaffMail } from "@/lib/mail/staff-mail";
import { anthropicConfigured, getAnthropic, CHAT_MODEL, CHAT_BETAS } from "@/lib/ai/client";

/**
 * The weekly price digest — both meanings of "stock prices".
 *
 * MATERIAL PRICES come from our own records: every supplier price that moved in
 * the last week, read out of supplier_price_history (written by a database
 * trigger, so it is complete regardless of which screen made the change), plus
 * anything whose price has gone unconfirmed long enough to be untrustworthy.
 *
 * SHARE PRICES come from the market_watch list. There is no market-data feed
 * wired into this platform, so the figures are gathered by Claude with web
 * search and are explicitly reported as indicative — good enough to notice a
 * move, not good enough to trade on. If nobody has added a ticker, that half of
 * the digest is simply omitted rather than padded.
 *
 * Sends to the owner and anyone holding financial at manage. Guarded by
 * CRON_SECRET like the other scheduled entry points.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const MIGRATION_HINT = "run supabase/migrations/071_todos_supplier_prices_market.sql in Supabase.";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n);

/** Supplier price movements over the window, in plain sentences. */
async function materialSection(db: ReturnType<typeof adminClient>): Promise<string[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: history, error } = await db
    .from("supplier_price_history")
    .select("supplier_product_id, unit_price, previous_price, changed_at")
    .gte("changed_at", since)
    .order("changed_at", { ascending: false });
  if (error) {
    return [
      /does not exist|schema cache/i.test(error.message)
        ? `Material prices unavailable — ${MIGRATION_HINT}`
        : `Material prices unavailable — ${error.message}`,
    ];
  }

  const rows = (history ?? []) as Record<string, unknown>[];
  const changed = rows.filter((r) => r.previous_price != null);
  if (changed.length === 0) {
    return ["No supplier prices changed this week."];
  }

  // Resolve the names once.
  const ids = [...new Set(changed.map((r) => String(r.supplier_product_id)))];
  const { data: links } = await db
    .from("supplier_products")
    .select("id, supplier_id, product_id, sundry_id")
    .in("id", ids);
  const linkById = new Map(
    ((links ?? []) as Record<string, unknown>[]).map((l) => [String(l.id), l])
  );

  const [suppliersRes, productsRes, sundriesRes] = await Promise.all([
    db.from("suppliers").select("id, name"),
    db.from("stock_products").select("id, name"),
    db.from("stock_sundries").select("id, name"),
  ]);
  const nameFrom = (rows2: unknown, id: unknown) =>
    ((rows2 ?? []) as Record<string, unknown>[]).find((r) => r.id === id)?.name;

  const lines: string[] = [];
  for (const change of changed.slice(0, 30)) {
    const link = linkById.get(String(change.supplier_product_id));
    if (!link) continue;
    const item =
      nameFrom(productsRes.data, link.product_id) ??
      nameFrom(sundriesRes.data, link.sundry_id) ??
      "an item";
    const supplier = nameFrom(suppliersRes.data, link.supplier_id) ?? "a supplier";
    const from = Number(change.previous_price);
    const to = Number(change.unit_price);
    const pct = from > 0 ? Math.round(((to - from) / from) * 100) : 0;
    const direction = to > from ? "up" : "down";
    lines.push(
      `• ${item} at ${supplier}: ${money(from)} → ${money(to)} (${direction} ${Math.abs(pct)}%)`
    );
  }

  // Prices nobody has re-confirmed in a quarter are worth chasing.
  const staleBefore = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { count: staleCount } = await db
    .from("supplier_products")
    .select("id", { count: "exact", head: true })
    .not("unit_price", "is", null)
    .lt("last_price_at", staleBefore);
  if ((staleCount ?? 0) > 0) {
    lines.push("");
    lines.push(
      `${staleCount} price${staleCount === 1 ? "" : "s"} on the list ${
        staleCount === 1 ? "has" : "have"
      } not been re-confirmed in over 90 days.`
    );
  }

  return lines;
}

/**
 * Share prices for whatever is on the watch list.
 *
 * Uses Claude with web search because there is no market-data provider wired
 * into this platform. Returns null when the list is empty or Claude is off, so
 * the digest omits the section instead of apologising for it.
 */
async function marketSection(db: ReturnType<typeof adminClient>): Promise<string[] | null> {
  const { data: watch, error } = await db
    .from("market_watch")
    .select("id, symbol, label, exchange, last_price, last_checked_at")
    .eq("active", true)
    .order("sort_order");
  if (error || !watch?.length) return null;
  if (!anthropicConfigured()) {
    return ["Share prices need ANTHROPIC_API_KEY — the watch list is set but nothing fetched it."];
  }

  const rows = watch as Record<string, unknown>[];
  const asked = rows
    .map((w) => `${String(w.symbol)}${w.exchange ? ` (${String(w.exchange)})` : ""}`)
    .join(", ");

  try {
    const anthropic = getAnthropic();
    const response = await anthropic.beta.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      betas: [...CHAT_BETAS],
      fallbacks: "default",
      output_config: { effort: "low" },
      system:
        "You look up current share prices using web search and report them plainly. " +
        "Give one line per symbol: the symbol, the latest price with its currency, and the change on the week if the source shows one. " +
        "Quote only figures you actually read in a search result — never estimate. " +
        "If you cannot find a symbol, say so on its line rather than guessing. " +
        "No preamble, no advice, no disclaimers beyond noting a figure is delayed if the source says so.",
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [
        {
          role: "user",
          content: `Latest share price for each of: ${asked}. One line each.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;

    const text = response.content
      .map((block: { type: string; text?: string }) =>
        block.type === "text" ? block.text ?? "" : ""
      )
      .join("")
      .trim();
    if (!text) return null;

    // Record that we checked, so the list shows its own freshness.
    const now = new Date().toISOString();
    for (const w of rows) {
      await db
        .from("market_watch")
        .update({ last_checked_at: now })
        .eq("id", String(w.id));
    }

    return [
      ...text.split("\n").filter((line) => line.trim()),
      "",
      "Figures gathered from public web sources and may be delayed — indicative only.",
    ];
  } catch {
    return null;
  }
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = adminClient();
    const [materials, market] = await Promise.all([
      materialSection(db),
      marketSection(db),
    ]);

    const week = new Date().toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const body = [
      `Weekly price update — ${week}`,
      "",
      "MATERIALS AND EQUIPMENT",
      ...materials,
      ...(market ? ["", "SHARE PRICES", ...market] : []),
      "",
      "Supplier prices live under Procurement → Supplier prices.",
    ].join("\n");

    // ?dry=1 renders the digest without sending — for checking the wording.
    if (new URL(request.url).searchParams.get("dry") === "1") {
      return NextResponse.json({ ok: true, preview: body, sent: 0 });
    }

    const people = await recipientsForModule(db, "financial", "manage");
    const { data: owners } = await db
      .from("team_members")
      .select("id, name, email")
      .eq("role", "owner")
      .eq("active", true);
    for (const owner of (owners ?? []) as Record<string, unknown>[]) {
      const email = String(owner.email ?? "");
      if (email.includes("@") && !people.some((p) => p.email === email)) {
        people.push({ id: String(owner.id), name: String(owner.name ?? ""), email });
      }
    }

    if (people.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, note: "Nobody to send to." });
    }

    const result = await sendStaffMail(people, `Weekly price update — ${week}`, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
