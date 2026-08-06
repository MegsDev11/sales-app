import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/supabase/server-auth";
import { adminClient, errorMessage, newId } from "@/lib/api/route-helpers";
import {
  anthropicConfigured,
  getAnthropic,
  CHAT_MODEL,
  CHAT_BETAS,
  costUsd,
} from "@/lib/ai/client";

/**
 * Buying advice — where to get something, and whether we are paying too much.
 *
 * Two sources, deliberately unequal:
 *
 *   OUR OWN NUMBERS come first and carry the weight. The supplier price list
 *   (migration 071) and what we have actually paid on purchase orders are
 *   facts about this business; a recommendation is made from them.
 *
 *   THE WEB is a sanity check, not a shopping trip. South African trade pricing
 *   sits behind login walls, so a search cannot produce a real trade quote —
 *   what it CAN do is show a retail benchmark, which is useful in exactly one
 *   way: if a retail shelf price is below our negotiated trade price, that is a
 *   negotiating lever worth knowing about. The model is told this explicitly so
 *   it does not present a retail listing as a quote.
 *
 * Guarded at procurement/view. Every run is logged to ai_interactions with its
 * own surface, so the owner's AI cost screen counts it.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM = `You advise a South African ISP (MEGS Waterberg, Limpopo) on buying materials and equipment.

You are given this company's OWN purchasing record: the prices its suppliers have quoted, and what it has actually paid on past purchase orders. Those figures are the ground truth. Lead with them.

You also have web search. Use it sparingly and for one purpose: to find a RETAIL benchmark price for the item in South Africa, so the company can tell whether its negotiated trade price is competitive. Trade pricing is behind login walls and is not findable — never present a retail listing as a trade quote, and never claim a supplier will sell at a price you have not been shown.

Rules:
- Quote figures only from the data given to you or from a search result you actually read. Never estimate a price.
- When you cite a web price, say the retailer and that it is retail.
- If the company has no price on record for an item, say so plainly and suggest getting quotes rather than guessing.
- Take lead time and reliability into account, not only unit price: the cheapest supplier who takes three weeks may be the wrong answer for an urgent job.
- Be brief and specific. A buyer wants "Supplier X at R412/unit, 5-day lead, and Takealot lists it at R398 retail — worth asking X to match" rather than an essay.`;

/** What we know about our own buying, handed to the model as facts. */
async function buildEvidence(db: ReturnType<typeof adminClient>, question: string) {
  const [pricesRes, suppliersRes, poLinesRes, productsRes, sundriesRes] = await Promise.all([
    db.from("supplier_products").select("*"),
    db.from("suppliers").select("id, name, lead_time_days, payment_terms, active"),
    db
      .from("purchase_order_lines")
      .select("product_id, sundry_id, description, qty_ordered, unit_price, po_id")
      .limit(500),
    db.from("stock_products").select("id, name, unit_cost, reorder_point"),
    db.from("stock_sundries").select("id, name, unit_cost"),
  ]);

  const supplierById = new Map(
    ((suppliersRes.data ?? []) as Record<string, unknown>[]).map((s) => [String(s.id), s])
  );
  const nameOf = (row: Record<string, unknown>) => {
    const products = (productsRes.data ?? []) as Record<string, unknown>[];
    const sundries = (sundriesRes.data ?? []) as Record<string, unknown>[];
    if (row.product_id) {
      return products.find((p) => p.id === row.product_id)?.name ?? "unknown product";
    }
    if (row.sundry_id) {
      return sundries.find((s) => s.id === row.sundry_id)?.name ?? "unknown sundry";
    }
    return "unnamed";
  };

  const quoted = ((pricesRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    item: nameOf(row),
    supplier: String(supplierById.get(String(row.supplier_id))?.name ?? "unknown"),
    unitPrice: row.unit_price == null ? null : Number(row.unit_price),
    leadTimeDays: Number(supplierById.get(String(row.supplier_id))?.lead_time_days ?? 0),
    supplierSku: String(row.supplier_sku ?? ""),
    lastConfirmed: (row.last_price_at as string | null) ?? null,
  }));

  const paid = ((poLinesRes.data ?? []) as Record<string, unknown>[])
    .filter((l) => Number(l.unit_price ?? 0) > 0)
    .slice(0, 200)
    .map((l) => ({
      item: nameOf(l) || String(l.description ?? ""),
      unitPrice: Number(l.unit_price),
      qty: Number(l.qty_ordered ?? 0),
    }));

  return {
    question,
    quotedPrices: quoted,
    pricesActuallyPaid: paid,
    suppliers: ((suppliersRes.data ?? []) as Record<string, unknown>[])
      .filter((s) => s.active !== false)
      .map((s) => ({
        name: String(s.name),
        leadTimeDays: Number(s.lead_time_days ?? 0),
        paymentTerms: String(s.payment_terms ?? ""),
      })),
    corpusSize: { quoted: quoted.length, paid: paid.length },
  };
}

export async function POST(request: Request) {
  const user = await requireAccess(request, "procurement", "view");
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized — procurement access required" },
      { status: 403 }
    );
  }

  if (!anthropicConfigured()) {
    return NextResponse.json(
      { error: "Claude is not switched on — set ANTHROPIC_API_KEY." },
      { status: 503 }
    );
  }
  const anthropic = getAnthropic();

  try {
    const body = (await request.json()) as { question?: string };
    const question = (body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "Ask a question first" }, { status: 400 });
    }

    const db = adminClient();
    const evidence = await buildEvidence(db, question);

    const response = await anthropic.beta.messages.create({
      model: CHAT_MODEL,
      max_tokens: 4000,
      betas: [...CHAT_BETAS],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium" },
      // Dynamic filtering is built into this tool version — a separate code
      // execution tool would give the model a second sandbox and confuse it.
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      messages: [
        {
          role: "user",
          content: `Our purchasing record:\n\n${JSON.stringify(evidence, null, 2)}\n\nQuestion: ${question}`,
        },
      ],
    });

    // Safety classifiers can decline; check before reading content.
    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Claude declined to answer that one. Try rephrasing." },
        { status: 502 }
      );
    }

    const answer = response.content
      .map((block: { type: string; text?: string }) =>
        block.type === "text" ? block.text ?? "" : ""
      )
      .join("")
      .trim();

    // What it actually looked at, so the answer can be checked.
    const sources: { title: string; url: string }[] = [];
    for (const block of response.content) {
      if (block.type !== "web_search_tool_result") continue;
      const content = (block as { content?: unknown }).content;
      // An error comes back as an object, a success as a list — branch first.
      if (!Array.isArray(content)) continue;
      for (const result of content as Record<string, unknown>[]) {
        if (result.type === "web_search_result") {
          sources.push({
            title: String(result.title ?? result.url ?? "source"),
            url: String(result.url ?? ""),
          });
        }
      }
    }

    if (!answer) {
      return NextResponse.json(
        { error: "The advisor came back empty. Try again." },
        { status: 502 }
      );
    }

    const usage = {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };

    void db
      .from("ai_interactions")
      .insert({
        id: newId("ai"),
        surface: "procurement_advisor",
        team_member_id: user.id,
        model: CHAT_MODEL,
        effort: "medium",
        prompt: question.slice(0, 4000),
        response: answer.slice(0, 4000),
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_read_tokens: usage.cacheReadTokens,
        cache_write_tokens: usage.cacheWriteTokens,
        cost_usd: costUsd(usage),
        stop_reason: response.stop_reason ?? "",
      })
      .then(undefined, () => undefined);

    return NextResponse.json({
      ok: true,
      answer,
      sources: sources.slice(0, 10),
      corpusSize: evidence.corpusSize,
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
