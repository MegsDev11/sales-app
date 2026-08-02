import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderInvoicePdf, type InvoiceCompany } from "./invoice-pdf";
import {
  renderStatementPdf,
  openingBalanceFor,
  type StatementTransaction,
} from "./statement-pdf";
import { buildSubscriptionLine, totalsFor, addDays } from "./invoicing";
import type { InvoiceLineInput } from "./invoice-pdf";

/**
 * Server-side document building, shared by the preview endpoint and the send job.
 *
 * Lives apart from either route because an invoice that is previewed and an invoice
 * that is emailed must be the SAME document. If the two were built by separate code
 * paths they would drift, and the drift would be discovered by a client holding a PDF
 * that does not match what the clerk approved on screen.
 */

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The letterhead, read once per process. Absent is not an error. */
let logoCache: Uint8Array | null | undefined;
export async function loadLogo(): Promise<Uint8Array | undefined> {
  if (logoCache !== undefined) return logoCache ?? undefined;
  try {
    logoCache = new Uint8Array(
      await readFile(path.join(process.cwd(), "public", "megs-logo.png"))
    );
  } catch {
    logoCache = null;
  }
  return logoCache ?? undefined;
}

/** Seeded defaults, used until migration 053 is applied. */
export const DEFAULT_COMPANY: InvoiceCompany = {
  companyName: "MEGS WATERBERG (PTY) LTD",
  vatNumber: "4730281922",
  postalAddress: "P O Box 57\nPostnet Modimolle\nModimolle",
  physicalAddress: "20 Dirk Van Den Berg Straat\nModimolle\nLimpopo\n0510",
  officePhone: "087 820 5290",
  bankAccountName: "MEGS WATERBERG",
  bankName: "STANDARDBANK",
  bankAccountNumber: "300063431",
  bankBranchCode: "051001",
  popEmail: "marily@megswb.co.za",
  invoiceNotice: "PLEASE NOTE THAT THIS INVOICE IS DUE FOR PAYMENT IMMEDIATELY",
  smsNotice:
    "** IF YOU WOULD LIKE TO RECEIVE AN SMS, STATING OF ANY SIGNAL LOSS OR TOWER PROBLEMS, " +
    "PLEASE SEND YOUR NAME, SURNAME AND LOCATION TO 060 418 6311 - PLEASE SAVE THIS NUMBER " +
    "IN ORDER TO RECEIVE ANY MESSAGES **",
};

export interface AccountsSettings {
  company: InvoiceCompany;
  termsDays: number;
  vatPct: number;
  invoicePrefix: string;
}

export async function loadSettings(db: SupabaseClient): Promise<AccountsSettings> {
  const { data } = await db
    .from("accounts_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) {
    return { company: DEFAULT_COMPANY, termsDays: 7, vatPct: 15, invoicePrefix: "INV" };
  }

  return {
    company: {
      companyName: String(row.company_name ?? DEFAULT_COMPANY.companyName),
      vatNumber: String(row.vat_number ?? DEFAULT_COMPANY.vatNumber),
      postalAddress: String(row.postal_address ?? DEFAULT_COMPANY.postalAddress),
      physicalAddress: String(row.physical_address ?? DEFAULT_COMPANY.physicalAddress),
      officePhone: String(row.office_phone ?? DEFAULT_COMPANY.officePhone),
      bankAccountName: String(row.bank_account_name ?? DEFAULT_COMPANY.bankAccountName),
      bankName: String(row.bank_name ?? DEFAULT_COMPANY.bankName),
      bankAccountNumber: String(row.bank_account_number ?? DEFAULT_COMPANY.bankAccountNumber),
      bankBranchCode: String(row.bank_branch_code ?? DEFAULT_COMPANY.bankBranchCode),
      popEmail: String(row.pop_email ?? DEFAULT_COMPANY.popEmail),
      invoiceNotice: String(row.invoice_notice ?? DEFAULT_COMPANY.invoiceNotice),
      smsNotice: String(row.sms_notice ?? DEFAULT_COMPANY.smsNotice),
    },
    termsDays: num(row.payment_terms_days, 7),
    vatPct: num(row.vat_rate, 0.15) * 100,
    invoicePrefix: String(row.invoice_prefix ?? "INV"),
  };
}

/* ------------------------------------------------------------------ *
 * Clients
 * ------------------------------------------------------------------ */

export interface ClientRow {
  id: string;
  name: string;
  email: string;
  contact_name: string;
  accounts_owner: string | null;
  payment_method: string | null;
  debit_order_day: number | null;
  billing_status: string;
  package_raw: string;
  package_speed_mbps: number | string | null;
  package_price_incl: number | string | null;
  service_description?: string | null;
  pppoe_username?: string | null;
  balance: number | string;
}

export async function loadClient(db: SupabaseClient, clientId: string): Promise<ClientRow | null> {
  const { data, error } = await db
    .from("accounts_clients")
    .select("*")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClientRow | null) ?? null;
}

/* ------------------------------------------------------------------ *
 * Tax invoice
 * ------------------------------------------------------------------ */

export interface BuiltInvoice {
  pdf: Uint8Array;
  filename: string;
  line: InvoiceLineInput;
  totalExcl: number;
  totalVat: number;
  totalIncl: number;
  invoiceDate: Date;
  dueDate: Date;
}

/**
 * Build the month's invoice for a client.
 *
 * Throws when the client has no readable monthly price. That refusal is the whole
 * safety property: an invoice for R0.00 is worse than no invoice, because it looks
 * deliberate and a client may treat it as a credit.
 */
export async function buildInvoiceDocument(
  client: ClientRow,
  settings: AccountsSettings,
  options: { invoiceNumber: string; invoiceDate?: Date }
): Promise<BuiltInvoice> {
  const line = buildSubscriptionLine(
    {
      name: client.name,
      packageRaw: String(client.package_raw ?? ""),
      packageSpeedMbps:
        client.package_speed_mbps === null || client.package_speed_mbps === undefined
          ? null
          : num(client.package_speed_mbps),
      packagePriceIncl:
        client.package_price_incl === null || client.package_price_incl === undefined
          ? null
          : num(client.package_price_incl),
      serviceDescription: String(client.service_description ?? ""),
      pppoeUsername: String(client.pppoe_username ?? ""),
    },
    settings.vatPct
  );

  if (!line) {
    throw new Error(
      `${client.name} has no monthly price recorded, so an invoice can't be raised. ` +
        "Open the client and set the monthly price first."
    );
  }

  const totals = totalsFor([line]);
  const invoiceDate = options.invoiceDate ?? new Date();
  const dueDate = addDays(invoiceDate, settings.termsDays);

  const pdf = await renderInvoicePdf({
    invoiceNumber: options.invoiceNumber,
    reference: client.name.toUpperCase(),
    invoiceDate,
    dueDate,
    salesRep: String(client.accounts_owner ?? "").toUpperCase(),
    clientName: client.name.toUpperCase(),
    lines: [line],
    totalExcl: totals.totalExcl,
    totalVat: totals.totalVat,
    totalIncl: totals.totalIncl,
    balanceDue: num(client.balance),
    company: settings.company,
    logo: await loadLogo(),
  });

  return {
    pdf,
    filename: `Tax Invoice - ${options.invoiceNumber}.pdf`,
    line,
    ...totals,
    invoiceDate,
    dueDate,
  };
}

/* ------------------------------------------------------------------ *
 * Customer transactions report
 * ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  invoice: "Tax Invoice",
  payment: "Payment",
  credit_note: "Credit Note",
  journal: "Journal",
  opening: "Opening Balance",
};

export interface BuiltStatement {
  pdf: Uint8Array;
  filename: string;
  openingBalance: number;
  closingBalance: number;
}

export async function buildStatementDocument(
  db: SupabaseClient,
  client: ClientRow,
  settings: AccountsSettings,
  range: { from: Date; to: Date; printedAt?: Date }
): Promise<BuiltStatement> {
  const { data, error } = await db
    .from("accounts_transactions")
    .select("txn_date, reference, txn_type, description, debit, credit")
    .eq("client_id", client.id)
    .order("txn_date", { ascending: true });
  if (error) throw new Error(error.message);

  const all = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    date: new Date(`${String(r.txn_date)}T00:00:00Z`),
    reference: String(r.reference ?? ""),
    txnType: String(r.txn_type ?? "invoice"),
    description: String(r.description ?? ""),
    debit: num(r.debit),
    credit: num(r.credit),
  }));

  const openingBalance = openingBalanceFor(all, range.from);
  const inRange: StatementTransaction[] = all
    .filter((t) => t.date >= range.from && t.date <= range.to && t.txnType !== "opening")
    .map((t) => ({
      date: t.date,
      reference: t.reference,
      transactionType: TYPE_LABELS[t.txnType] ?? t.txnType,
      description: t.description || client.name,
      debit: t.debit,
      credit: t.credit,
    }));

  const earliest = all.length
    ? all.reduce((min, t) => (t.date < min ? t.date : min), all[0].date)
    : null;

  const closingBalance = inRange.reduce(
    (sum, t) => sum + t.debit - t.credit,
    openingBalance
  );

  const pdf = await renderStatementPdf({
    companyName: settings.company.companyName,
    clientName: client.name,
    rangeStart: range.from,
    rangeEnd: range.to,
    openingBalance,
    transactions: inRange,
    historyStartsAt: earliest,
    printedAt: range.printedAt ?? new Date(),
    logo: await loadLogo(),
  });

  return {
    pdf,
    filename: `Customer Transactions Report - ${client.name}.pdf`,
    openingBalance,
    closingBalance,
  };
}

/** Parse `yyyy-mm-dd` as UTC so a statement range never shifts by a timezone. */
export function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
