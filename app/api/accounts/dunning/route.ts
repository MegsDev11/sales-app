import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAnyAccess, requireAccess } from "@/lib/supabase/server-auth";
import { can } from "@/lib/access";
import { calculateAgeing, type AgeingInvoice } from "@/lib/financial/ageing";
import {
  selectDunning,
  renderDunningLetter,
  DUNNING_MERGE_FIELDS,
  type DunningLevel,
  type DunningTarget,
  type DunningNotice,
} from "@/lib/accounts/dunning";
import { mailerStatus, sendClientMail } from "@/lib/accounts/mailer";
import type { PaymentMethod } from "@/lib/accounts/constants";
import { adminClient, errorMessage, newId, withHint } from "@/lib/api/route-helpers";

/**
 * Collections — who to chase, and sending the letters.
 *
 * GET                     -> levels, the run list, skips, mailer status
 * GET ?view=suspension    -> accounts at suspension level
 * POST {action:"send"}    -> send one client's letter and log it
 * POST {action:"log"}     -> record a phone call or a posted letter, no email sent
 * POST {action:"levels"}  -> edit a level's wording or thresholds
 *
 * Reads are open to Accounts or Financial. SENDING requires accounts/edit: a demand
 * letter is an outward-facing act with commercial consequences, and it is logged
 * against the person who sent it.
 *
 * ONE CLIENT PER REQUEST. There is no "send all" endpoint. The run screen walks the
 * list, which keeps a failure attributable to one client, lets the operator stop
 * mid-way, and makes it impossible to fire a thousand demand letters with one
 * mis-click. The cooldown in lib/accounts/dunning.ts is the second guard: a repeated
 * run is a no-op rather than a second demand.
 */

export const runtime = "nodejs";

const MIGRATION_HINT =
  "run supabase/migrations/057_accounts_dunning.sql in Supabase (and 051–054 first).";

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

type PageResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

async function fetchAll(
  build: (from: number, to: number) => PromiseLike<PageResult>
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function loadLevels(db: SupabaseClient): Promise<DunningLevel[]> {
  const { data, error } = await db
    .from("accounts_dunning_levels")
    .select("*")
    .order("level_order");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    levelOrder: num(r.level_order),
    name: String(r.name ?? ""),
    minDays: num(r.min_days),
    cooldownDays: num(r.cooldown_days, 14),
    subject: String(r.subject ?? ""),
    body: String(r.body ?? ""),
    bodyDebitOrder: String(r.body_debit_order ?? ""),
    isSuspension: !!r.is_suspension,
    active: r.active !== false,
  }));
}

/**
 * Build the collections targets: the age analysis, joined to contact details.
 *
 * Deliberately re-derives ageing rather than caching it. Collections acts on today's
 * position, and a stale cache here means chasing somebody who paid yesterday — the
 * single fastest way to lose a customer's trust in the whole system.
 */
async function loadTargets(db: SupabaseClient): Promise<DunningTarget[]> {
  const invoiceRows = await fetchAll((from, to) =>
    db
      .from("accounts_invoices")
      .select("id, client_id, invoice_number, invoice_date, total_incl")
      .in("status", ["issued", "sent"])
      .order("id")
      .range(from, to)
  );

  const allocated = new Map<string, number>();
  const credits = new Map<string, number>();
  try {
    for (const a of await fetchAll((from, to) =>
      db
        .from("financial_receipt_allocations")
        .select("id, invoice_id, receipt_id, amount")
        .order("id")
        .range(from, to)
    )) {
      allocated.set(
        String(a.invoice_id),
        (allocated.get(String(a.invoice_id)) ?? 0) + num(a.amount)
      );
    }
    const receipts = await fetchAll((from, to) =>
      db.from("financial_receipts").select("id, client_id, amount").order("id").range(from, to)
    );
    const allocByReceipt = new Map<string, number>();
    for (const a of await fetchAll((from, to) =>
      db
        .from("financial_receipt_allocations")
        .select("id, receipt_id, amount")
        .order("id")
        .range(from, to)
    )) {
      allocByReceipt.set(
        String(a.receipt_id),
        (allocByReceipt.get(String(a.receipt_id)) ?? 0) + num(a.amount)
      );
    }
    for (const r of receipts) {
      const remainder = num(r.amount) - (allocByReceipt.get(String(r.id)) ?? 0);
      if (remainder > 0.005) {
        credits.set(String(r.client_id), (credits.get(String(r.client_id)) ?? 0) + remainder);
      }
    }
  } catch {
    // Payments (056) not applied yet — nothing is allocated, which is correct.
  }

  const openingRows = await fetchAll((from, to) =>
    db
      .from("accounts_transactions")
      .select("id, client_id, debit, credit, txn_type")
      .eq("txn_type", "opening")
      .order("id")
      .range(from, to)
  );

  const invoices: AgeingInvoice[] = invoiceRows.map((r) => ({
    id: String(r.id),
    clientId: String(r.client_id),
    invoiceNumber: String(r.invoice_number ?? ""),
    invoiceDate: String(r.invoice_date ?? ""),
    totalIncl: num(r.total_incl),
    allocated: allocated.get(String(r.id)) ?? 0,
  }));

  const { clients } = calculateAgeing({
    asAt: new Date(),
    invoices,
    openingBalances: openingRows.map((r) => ({
      clientId: String(r.client_id),
      amount: num(r.debit) - num(r.credit),
    })),
    unallocatedCredits: [...credits.entries()].map(([clientId, amount]) => ({
      clientId,
      amount,
    })),
  });

  const ids = clients.map((c) => c.clientId);
  const details = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db
      .from("accounts_clients")
      .select(
        "id, name, contact_name, email, mobile, tel, accounts_owner, billing_status, payment_method"
      )
      .in("id", ids.slice(i, i + 500));
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      details.set(String(row.id), row);
    }
  }

  return clients.map((c) => {
    const d = details.get(c.clientId);
    return {
      clientId: c.clientId,
      name: String(d?.name ?? "Unknown client"),
      contactName: String(d?.contact_name ?? ""),
      email: String(d?.email ?? ""),
      phone: String(d?.mobile ?? "") || String(d?.tel ?? ""),
      accountsOwner: (d?.accounts_owner as string | null) ?? null,
      paymentMethod: (String(d?.payment_method ?? "unknown") || "unknown") as PaymentMethod,
      billingStatus: String(d?.billing_status ?? "unclassified"),
      total: c.total,
      oldestDays: c.oldestDays,
      broughtForward: c.broughtForward,
    };
  });
}

async function loadHistory(db: SupabaseClient): Promise<DunningNotice[]> {
  const rows = await fetchAll((from, to) =>
    db
      .from("accounts_dunning_notices")
      .select("id, client_id, level_order, sent_at, status")
      .eq("status", "sent")
      .order("id")
      .range(from, to)
  );
  return rows.map((r) => ({
    clientId: String(r.client_id),
    levelOrder: num(r.level_order),
    sentAt: String(r.sent_at),
  }));
}

/** The clerk who signs this client's letter. */
async function clerkNameFor(db: SupabaseClient, owner: string | null): Promise<string> {
  if (!owner) return "MEGS Waterberg";
  const { data } = await db
    .from("accounts_staff")
    .select("display_name")
    .ilike("owner_key", owner)
    .maybeSingle();
  return String((data as Record<string, unknown> | null)?.display_name ?? owner);
}

/* ------------------------------------------------------------------ *
 * GET
 * ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const user = await requireAnyAccess(request, ["accounts", "financial"], "view");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(request.url);
  const onlyLevel = url.searchParams.get("level");
  const owner = (url.searchParams.get("owner") ?? "").trim();
  const db = adminClient();

  try {
    const [levels, targets, history] = await Promise.all([
      loadLevels(db),
      loadTargets(db),
      loadHistory(db),
    ]);

    const filtered =
      owner && owner !== "all"
        ? targets.filter((t) =>
            owner === "none" ? !t.accountsOwner : t.accountsOwner === owner
          )
        : targets;

    const { candidates, skipped } = selectDunning({
      asAt: new Date(),
      targets: filtered,
      levels,
      history,
      onlyLevelOrder: onlyLevel ? Number(onlyLevel) : undefined,
    });

    if (url.searchParams.get("view") === "suspension") {
      const suspensionOrders = new Set(
        levels.filter((l) => l.isSuspension).map((l) => l.levelOrder)
      );
      const flagged = history.filter((h) => suspensionOrders.has(h.levelOrder));
      const flaggedIds = new Set(flagged.map((f) => f.clientId));
      return NextResponse.json(
        {
          // Already sent a suspension notice and still owing — the disconnect list.
          suspend: targets.filter((t) => flaggedIds.has(t.clientId) && t.total > 0.005),
          canEdit: can(user, "accounts", "edit"),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    // Group the skips so the screen can say "12 have no email" rather than listing
    // two thousand rows nobody reads.
    const skipCounts: Record<string, number> = {};
    for (const s of skipped) skipCounts[s.reason] = (skipCounts[s.reason] ?? 0) + 1;

    return NextResponse.json(
      {
        levels,
        candidates: candidates.slice(0, 300).map((c) => ({
          clientId: c.target.clientId,
          name: c.target.name,
          contactName: c.target.contactName,
          email: c.target.email,
          phone: c.target.phone,
          accountsOwner: c.target.accountsOwner,
          paymentMethod: c.target.paymentMethod,
          billingStatus: c.target.billingStatus,
          total: c.target.total,
          oldestDays: c.target.oldestDays,
          levelId: c.level.id,
          levelOrder: c.level.levelOrder,
          levelName: c.level.name,
          isSuspension: c.level.isSuspension,
          isEscalation: c.isEscalation,
          daysSinceLastNotice: c.daysSinceLastNotice,
        })),
        totalCandidates: candidates.length,
        totalOwed: Math.round(candidates.reduce((s, c) => s + c.target.total, 0) * 100) / 100,
        skipCounts,
        // The clients with no email are a phone list, not a failure.
        needsCall: skipped
          .filter((s) => s.reason === "no_email")
          .slice(0, 100)
          .map((s) => ({
            clientId: s.target.clientId,
            name: s.target.name,
            phone: s.target.phone,
            total: s.target.total,
            oldestDays: s.target.oldestDays,
          })),
        mailer: mailerStatus(),
        mergeFields: DUNNING_MERGE_FIELDS,
        canEdit: can(user, "accounts", "edit"),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (e) {
    return NextResponse.json({ error: withHint(errorMessage(e), MIGRATION_HINT) }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ *
 * POST
 * ------------------------------------------------------------------ */

export async function POST(request: Request) {
  const user = await requireAccess(request, "accounts", "edit");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = adminClient();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "levels") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const patch: Record<string, unknown> = {};
      for (const [field, column] of Object.entries({
        name: "name",
        minDays: "min_days",
        cooldownDays: "cooldown_days",
        subject: "subject",
        body: "body",
        bodyDebitOrder: "body_debit_order",
        active: "active",
      })) {
        if (field in body) patch[column] = body[field];
      }
      if (!Object.keys(patch).length) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
      }
      const { error } = await db.from("accounts_dunning_levels").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const clientId = String(body.clientId ?? "");
    const levelId = String(body.levelId ?? "");
    if (!clientId || !levelId) {
      return NextResponse.json({ error: "clientId and levelId required" }, { status: 400 });
    }

    const levels = await loadLevels(db);
    const level = levels.find((l) => l.id === levelId);
    if (!level) return NextResponse.json({ error: "Unknown level" }, { status: 400 });

    const targets = await loadTargets(db);
    const target = targets.find((t) => t.clientId === clientId);
    if (!target) {
      return NextResponse.json(
        { error: "That client has nothing outstanding." },
        { status: 400 }
      );
    }

    const clerk = await clerkNameFor(db, target.accountsOwner);
    const letter = renderDunningLetter(
      { target, level, daysSinceLastNotice: null, isEscalation: false },
      clerk
    );

    /** Record what happened, whether or not it went out. */
    const log = async (status: "sent" | "failed", error: string, sentTo: string) => {
      await db.from("accounts_dunning_notices").insert({
        id: newId("adn"),
        client_id: clientId,
        level_id: level.id,
        level_order: level.levelOrder,
        sent_to: sentTo,
        amount_at_send: target.total,
        oldest_days_at_send: target.oldestDays ?? 0,
        status,
        error,
        sent_by: user.id,
      });
    };

    // A call or a posted letter still counts as having chased them — logging it keeps
    // the escalation ladder honest for clients who have no email.
    if (action === "log") {
      await log("sent", "", String(body.note ?? "recorded manually"));
      return NextResponse.json({ ok: true, logged: true, level: level.name });
    }

    if (action === "send") {
      if (!target.email.trim()) {
        return NextResponse.json(
          { error: `${target.name} has no email address — record a call instead.` },
          { status: 400 }
        );
      }

      const result = await sendClientMail({
        to: target.email,
        subject: body.subject ? String(body.subject) : letter.subject,
        body: body.body ? String(body.body) : letter.body,
        senderName: clerk,
        senderEmail: "",
        canSendAs: false,
        attachments: [],
      });

      await log(result.ok ? "sent" : "failed", result.error ?? "", target.email);

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 });
      }

      // A suspension-level notice flags the account for a human to action. Nothing is
      // disconnected by the app — cutting off a paying customer by mistake costs far
      // more than a day's delay.
      if (level.isSuspension) {
        await db
          .from("accounts_clients")
          .update({ suspension_flagged_at: new Date().toISOString() })
          .eq("id", clientId);
      }

      return NextResponse.json({
        ok: true,
        sentTo: target.email,
        level: level.name,
        flaggedForSuspension: level.isSuspension,
      });
    }

    if (action === "preview") {
      return NextResponse.json({ ...letter, clerk, to: target.email });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: withHint(errorMessage(e), MIGRATION_HINT) }, { status: 500 });
  }
}
