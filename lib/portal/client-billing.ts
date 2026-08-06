import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What a client may see about their own account, and nothing more.
 *
 * Every field here is deliberately chosen and copied by name — never spread
 * from a row — because these payloads leave the building. The precedent is the
 * client_directory view (migration 055) and the support-chat tools, which take
 * the same line: the projection IS the permission.
 */

export interface ClientBillingSummary {
  accountName: string;
  balance: number;
  /** Positive means the client owes MEGS. */
  balanceMeaning: string;
  balanceAsAt: string | null;
  /** The balance is a Sage snapshot, not a live ledger — say so. */
  balanceCaveat: string;
  monthlyPrice: number | null;
  package: string;
  billingStatus: string;
  debitOrderDay: number | null;
  paymentMethod: string;
  lastInvoice: {
    invoiceNumber: string;
    invoiceDate: string | null;
    totalIncl: number;
    status: string;
  } | null;
  /** Computed, not stored — there is no next-invoice column anywhere. */
  nextInvoiceOn: string | null;
}

/**
 * The next date this client is billed.
 *
 * Invoices are raised per calendar month, and debit_order_day is a plain
 * day-of-month with no rollover rule anywhere in the schema — so a client on
 * day 31 has to be clamped to the last day of a short month rather than
 * silently rolling into the next one. Returns null when the client is not on a
 * debit order, because then there is no date to promise.
 */
export function nextInvoiceDate(
  debitOrderDay: number | null,
  now: Date = new Date()
): string | null {
  if (!debitOrderDay || debitOrderDay < 1 || debitOrderDay > 31) return null;

  const clampToMonth = (year: number, monthIndex: number) => {
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, monthIndex, Math.min(debitOrderDay, lastDay)));
  };

  const thisMonth = clampToMonth(now.getUTCFullYear(), now.getUTCMonth());
  // Today still counts as upcoming; yesterday means next month.
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const target =
    thisMonth >= today ? thisMonth : clampToMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
  return target.toISOString().slice(0, 10);
}

const BALANCE_CAVEAT =
  "This is the balance as it stood when the accounts book was last updated. " +
  "A payment made since then may not be reflected yet.";

export async function loadClientBilling(
  db: SupabaseClient,
  clientId: string
): Promise<ClientBillingSummary | null> {
  const { data: client, error } = await db
    .from("accounts_clients")
    .select(
      "id, name, balance, balance_as_at, debit_order_day, billing_status, package_raw, package_price_incl, payment_method"
    )
    .eq("id", clientId)
    .maybeSingle();
  if (error || !client) return null;

  // Order by invoice_date, NOT billing_period: migration 068 made
  // billing_period nullable for project invoices, so it no longer sorts.
  const { data: invoice } = await db
    .from("accounts_invoices")
    .select("invoice_number, invoice_date, total_incl, status")
    .eq("client_id", clientId)
    .in("status", ["issued", "sent"])
    .order("invoice_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const price = client.package_price_incl;

  return {
    accountName: String(client.name ?? ""),
    balance: Number(client.balance ?? 0),
    balanceMeaning:
      Number(client.balance ?? 0) > 0
        ? "You owe MEGS this amount"
        : Number(client.balance ?? 0) < 0
          ? "Your account is in credit"
          : "Your account is settled",
    balanceAsAt: (client.balance_as_at as string | null) ?? null,
    balanceCaveat: BALANCE_CAVEAT,
    // null is meaningful: "we do not know what this client pays" must never
    // render as R0.00 (see migration 051).
    monthlyPrice: price == null ? null : Number(price),
    package: String(client.package_raw ?? ""),
    billingStatus: String(client.billing_status ?? ""),
    debitOrderDay: (client.debit_order_day as number | null) ?? null,
    paymentMethod: String(client.payment_method ?? "unknown"),
    lastInvoice: invoice
      ? {
          invoiceNumber: String(invoice.invoice_number),
          invoiceDate: (invoice.invoice_date as string | null) ?? null,
          totalIncl: Number(invoice.total_incl ?? 0),
          status: String(invoice.status ?? ""),
        }
      : null,
    nextInvoiceOn: nextInvoiceDate((client.debit_order_day as number | null) ?? null),
  };
}

/**
 * A technician's view of the client's recent job cards.
 *
 * The stored payload carries the internal risk assessment, approval flags and
 * stock serial numbers; none of that belongs in a scanned page, so this picks
 * the handful of fields that describe what was done on site.
 */
export interface PortalJobCard {
  id: string;
  cardNumber: string | null;
  jobTitle: string;
  submittedAt: string | null;
  technicianName: string;
  workDone: string;
  hoursOnSite: string;
}

export async function loadClientJobCards(
  db: SupabaseClient,
  clientId: string,
  limit = 10
): Promise<PortalJobCard[]> {
  const { data: jobs } = await db
    .from("jobs")
    .select("id, title")
    .eq("accounts_client_id", clientId)
    .limit(200);
  const jobIds = (jobs ?? []).map((j) => j.id as string);
  if (jobIds.length === 0) return [];

  const jobTitle = new Map(
    (jobs ?? []).map((j) => [j.id as string, (j.title as string) ?? "Job"])
  );

  const { data: cards } = await db
    .from("job_card_submissions")
    .select("id, job_id, card_number, technician_id, submitted_at, payload")
    .in("job_id", jobIds)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (!cards?.length) return [];

  const techIds = [...new Set(cards.map((c) => c.technician_id as string))];
  const { data: techs } = await db
    .from("team_members")
    .select("id, name")
    .in("id", techIds.length ? techIds : ["__none__"]);
  const techName = new Map(
    ((techs ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  return cards.map((c) => {
    const payload = (c.payload ?? {}) as Record<string, unknown>;
    return {
      id: c.id as string,
      cardNumber: (c.card_number as string | null) ?? null,
      jobTitle: jobTitle.get(c.job_id as string) ?? "Job",
      submittedAt: (c.submitted_at as string | null) ?? null,
      technicianName: techName.get(c.technician_id as string) ?? "Technician",
      workDone: String(payload.workDone ?? ""),
      hoursOnSite: String(payload.hoursOnSite ?? ""),
    };
  });
}
