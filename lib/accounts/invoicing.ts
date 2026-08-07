import { VAT_DIVISOR, round2, requestsPayment, type PaymentMethod } from "./constants";
import type { InvoiceLineInput } from "./invoice-pdf";

/**
 * Turning a client into a month's invoice, and a template into a letter.
 *
 * The arithmetic here is the part that must never be casually changed: it decides
 * what a client is asked to pay. Two rules govern it.
 *
 * PRICES ARE INCLUSIVE, AND THE EX-VAT FIGURE IS DERIVED. A client is quoted
 * "50 Mbps @ R399" — that R399 is what leaves their bank account, so it is the
 * authoritative number and R346.96 is computed from it. Deriving in the other
 * direction (storing 346.96 and multiplying by 1.15) reintroduces a rounding error on
 * every invoice and the client is billed R398.99 or R399.01.
 *
 * VAT IS THE REMAINDER, NEVER ITS OWN ROUNDING. `vat = incl − excl` after `excl` has
 * been rounded, so the three printed figures always add up on the page. Rounding VAT
 * independently produces invoices that are out by a cent, which is exactly the kind of
 * thing a client photographs and emails to SARS.
 */

/* ------------------------------------------------------------------ *
 * Line items
 * ------------------------------------------------------------------ */

export interface BillableClient {
  name: string;
  packageRaw: string;
  packageSpeedMbps: number | null;
  packagePriceIncl: number | null;
  serviceDescription?: string;
  pppoeUsername?: string;
}

/**
 * The description printed on the invoice line.
 *
 * An explicit `serviceDescription` always wins. Otherwise it is derived from the
 * speed, and stays deliberately vague about the medium: the Sage export records
 * "50 Mbps @ R399.00" and never says whether that is fibre or wireless. Printing
 * "FIBRE" on a wireless client's tax invoice is a worse error than printing neither,
 * so the fallback says only what is known.
 */
export function lineDescription(client: BillableClient): { code: string; description: string } {
  const explicit = client.serviceDescription?.trim();
  if (explicit) {
    // Accept "CODE - Description", the shape Sage uses, and split on the first " - ".
    const split = explicit.indexOf(" - ");
    return split > 0
      ? { code: explicit.slice(0, split).trim(), description: explicit.slice(split + 3).trim() }
      : { code: "", description: explicit };
  }

  if (client.packageSpeedMbps) {
    const speed = Number.isInteger(client.packageSpeedMbps)
      ? String(client.packageSpeedMbps)
      : String(client.packageSpeedMbps);
    return {
      code: `${speed}M`,
      description: `${speed} MEG UNCAPPED - MONTHLY SUBSCRIPTION`,
    };
  }

  // No speed either: fall back to whatever Sage recorded, rather than inventing a
  // product. An odd-looking line beats a wrong one.
  return {
    code: "",
    description: client.packageRaw.trim() || "MONTHLY SUBSCRIPTION",
  };
}

/** One month of subscription as a printable line. Returns null when unpriced. */
export function buildSubscriptionLine(
  client: BillableClient,
  vatPct = 15
): InvoiceLineInput | null {
  if (client.packagePriceIncl === null || !Number.isFinite(client.packagePriceIncl)) {
    return null;
  }

  const { code, description } = lineDescription(client);
  const totalIncl = round2(client.packagePriceIncl);
  const totalExcl = round2(totalIncl / (1 + vatPct / 100));

  return {
    code,
    description,
    qty: 1,
    unitPriceIncl: totalIncl,
    discountPct: 0,
    vatPct,
    totalExcl,
    totalIncl,
  };
}

export interface InvoiceTotals {
  totalExcl: number;
  totalVat: number;
  totalIncl: number;
}

/** VAT is the remainder so the printed figures always reconcile. See the header. */
export function totalsFor(lines: InvoiceLineInput[]): InvoiceTotals {
  const totalExcl = round2(lines.reduce((sum, l) => sum + l.totalExcl, 0));
  const totalIncl = round2(lines.reduce((sum, l) => sum + l.totalIncl, 0));
  return { totalExcl, totalVat: round2(totalIncl - totalExcl), totalIncl };
}

/** Ex-VAT figure for an inclusive price, using the single shared divisor. */
export const exclOf = (incl: number) => round2(incl / VAT_DIVISOR);

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

/** The first day of the month being billed — how a period is always stored. */
export function periodStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** "July 2026" — how the period reads in a subject line. */
export function periodLabel(date: Date): string {
  return date.toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------ *
 * The covering letter
 * ------------------------------------------------------------------ */

export interface TemplateContext {
  clientName: string;
  contactName: string;
  accountsOwner: string;
  invoiceNumber: string;
  invoiceTotal: string;
  balanceDue: string;
  period: string;
  debitOrderDay: string;
  dueDate: string;
}

/** The fields a template may reference, shown in the editor's help text. */
export const MERGE_FIELDS: { token: string; blurb: string }[] = [
  { token: "client_name", blurb: "The client's account name" },
  { token: "contact_name", blurb: "The contact person, if one is recorded" },
  { token: "accounts_owner", blurb: "The clerk sending it — signs the letter" },
  { token: "invoice_number", blurb: "e.g. INV1000042" },
  { token: "invoice_total", blurb: "This month's invoice, incl VAT" },
  { token: "balance_due", blurb: "What the account owes overall" },
  { token: "period", blurb: "e.g. July 2026" },
  { token: "debit_order_day", blurb: "e.g. 1st — only meaningful for debit-order clients" },
  { token: "due_date", blurb: "e.g. 07/08/2026" },
];

/**
 * Fill `{{token}}` placeholders.
 *
 * An unknown token is left standing rather than blanked. A letter that reaches a
 * client saying "Dear ," reads as a broken mailshot; one saying "{{client_naem}}"
 * is obviously a typo in the template and gets fixed in seconds.
 */
export function renderTemplate(body: string, ctx: TemplateContext): string {
  return renderTokens(body, {
    client_name: ctx.clientName,
    contact_name: ctx.contactName || ctx.clientName,
    accounts_owner: ctx.accountsOwner,
    invoice_number: ctx.invoiceNumber,
    invoice_total: ctx.invoiceTotal,
    balance_due: ctx.balanceDue,
    period: ctx.period,
    debit_order_day: ctx.debitOrderDay,
    due_date: ctx.dueDate,
  });
}

/**
 * Fill `{{token}}` placeholders from an arbitrary field map.
 *
 * Shared by the invoice letter and the dunning letters so there is one substitution
 * rule in the codebase rather than two that drift.
 */
export function renderTokens(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, token: string) => {
    const value = values[token.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

/**
 * Choose the covering letter for a client.
 *
 * Debit-order clients get the variant that does NOT ask for payment — they are
 * debited automatically, and asking them to "revert payment and provide a POP" is how
 * a company gets paid twice and spends a week refunding it. When no variant has been
 * written the main body is used for everyone, which is the safe direction: asking a
 * debit-order client for a POP is an awkward email, whereas failing to ask an EFT
 * client for payment is an unpaid invoice.
 */
export function bodyForClient(
  template: { body: string; bodyDebitOrder: string },
  method: PaymentMethod
): string {
  if (!requestsPayment(method) && template.bodyDebitOrder.trim()) {
    return template.bodyDebitOrder;
  }
  return template.body;
}
