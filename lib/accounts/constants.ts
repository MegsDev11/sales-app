/**
 * Shared Accounts vocabulary and response shapes.
 *
 * Mirrors lib/commission/constants.ts: the generated Database types don't know about
 * the migration 051 tables, so the API talks to an untyped client and the shapes are
 * pinned here instead.
 *
 * BACKGROUND — where the client list comes from.
 *
 * The master client list lives in Sage and is exported as "Megs Kliente lys", one row
 * per customer. That export carries a column called `Staff` which, in practice, is
 * three different facts crammed into one free-text field:
 *
 *   "1ST DEBIT ORDER"  -> a billing arrangement (debit order runs on the 1st)
 *   "Leane"            -> the accounts clerk who owns the relationship
 *   "Cancelled"        -> an account status
 *
 * Nothing downstream can work while those are one string: you cannot bill "everyone
 * active" if `active` is only knowable by reading English, and you cannot sign an
 * invoice email "Leané van Deventer" if the clerk is buried in the same column as the
 * word "Cancelled". So the importer splits `Staff` into three real columns and keeps
 * the original verbatim in `staff_raw` — the split is a derivation, never a
 * replacement, and anything unrecognised is flagged for a human rather than guessed.
 */

export const VAT_RATE = 0.15;

/** Package prices are quoted inclusive; ÷1.15 converts back to the ex-VAT figure. */
export const VAT_DIVISOR = 1 + VAT_RATE;

export const round2 = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------------------------------------------ *
 * Billing status
 * ------------------------------------------------------------------ */

/**
 * What the account IS, independent of who handles it or when it is debited.
 *
 * `billable` is the only thing the monthly invoice run may touch. It is deliberately
 * narrow: an account has to be positively recognised as a live paying client to earn
 * an invoice. Everything unrecognised lands in `unclassified`, which bills nobody —
 * a client missed this month is a phone call, a client billed in error after they
 * cancelled is a refund and a reputation.
 */
export type BillingStatus =
  | "active"
  | "cancelled"
  | "temp_cancelled"
  | "quote_only"
  | "red_client"
  | "one_time"
  | "sponsored"
  | "duplicate"
  | "deceased"
  | "internal"
  | "unclassified";

export const BILLING_STATUSES: {
  value: BillingStatus;
  label: string;
  blurb: string;
  /** May the monthly invoice run raise an invoice for this client? */
  billable: boolean;
}[] = [
  {
    value: "active",
    label: "Active",
    blurb: "Live paying client. The monthly invoice run bills these.",
    billable: true,
  },
  {
    value: "cancelled",
    label: "Cancelled",
    blurb: "Service ended. Never billed, kept for history and outstanding balances.",
    billable: false,
  },
  {
    value: "temp_cancelled",
    label: "Temporarily cancelled",
    blurb: "Suspended, expected back. Not billed while suspended.",
    billable: false,
  },
  {
    value: "quote_only",
    label: "Quote only",
    blurb: "Quoted, never took service. Not a client yet.",
    billable: false,
  },
  {
    value: "red_client",
    label: "Red client",
    blurb: "Flagged for non-payment. Billing decisions are made by hand.",
    billable: false,
  },
  {
    value: "one_time",
    label: "One-time client",
    blurb: "Once-off job, no recurring subscription to bill.",
    billable: false,
  },
  {
    value: "sponsored",
    label: "Sponsored",
    blurb: "Service given free. Kept on the books, never invoiced.",
    billable: false,
  },
  {
    value: "duplicate",
    label: "Duplicate",
    blurb: "Same client already exists under another name. Never billed.",
    billable: false,
  },
  {
    value: "deceased",
    label: "Deceased",
    blurb: "Estate. Billing is a manual decision, never automatic.",
    billable: false,
  },
  {
    value: "internal",
    label: "Internal / non-client",
    blurb: "Sites, towers, technicians, head office. Not a customer.",
    billable: false,
  },
  {
    value: "unclassified",
    label: "Needs review",
    blurb: "The Sage 'Staff' value wasn't recognised. Never billed until someone says so.",
    billable: false,
  },
];

const STATUS_BY_VALUE = new Map(BILLING_STATUSES.map((s) => [s.value, s]));

export function statusLabel(status: BillingStatus): string {
  return STATUS_BY_VALUE.get(status)?.label ?? status;
}

/** The single source of truth for "may we invoice this client?". */
export function isBillable(status: BillingStatus): boolean {
  return STATUS_BY_VALUE.get(status)?.billable ?? false;
}

export const BILLABLE_STATUSES = BILLING_STATUSES.filter((s) => s.billable).map(
  (s) => s.value
);

/* ------------------------------------------------------------------ *
 * Payment method
 * ------------------------------------------------------------------ */

/**
 * HOW a client pays — a separate axis from `billing_status`, which is WHETHER the
 * account is live. A cash client is still Active; "cash" is not a kind of cancelled.
 *
 * This drives the wording of the monthly invoice email. The standard letter asks the
 * client to revert payment and send a proof of payment, which is right for `eft` and
 * `cash` and wrong for `debit_order` — those clients are debited automatically and
 * must not be asked to pay a second time.
 */
export type PaymentMethod = "debit_order" | "eft" | "cash" | "unknown";

export const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  blurb: string;
  /** Does the covering letter ask this client to pay and send a POP? */
  requestsPayment: boolean;
}[] = [
  {
    value: "debit_order",
    label: "Debit order",
    blurb: "Debited automatically. The letter tells them the amount, it does not ask for payment.",
    requestsPayment: false,
  },
  {
    value: "eft",
    label: "EFT on invoice",
    blurb: "Pays on receipt of invoice. Asked to revert payment and send a POP.",
    requestsPayment: true,
  },
  {
    value: "cash",
    label: "Cash",
    blurb: "Pays cash at the office. Asked to settle and send a POP.",
    requestsPayment: true,
  },
  {
    value: "unknown",
    label: "Not set",
    blurb: "Sage doesn't record a payment method. Treated as EFT until someone says otherwise.",
    requestsPayment: true,
  },
];

const PAYMENT_BY_VALUE = new Map(PAYMENT_METHODS.map((p) => [p.value, p]));

export function paymentLabel(method: PaymentMethod): string {
  return PAYMENT_BY_VALUE.get(method)?.label ?? method;
}

/** Whether the covering letter should ask this client for payment and a POP. */
export function requestsPayment(method: PaymentMethod): boolean {
  return PAYMENT_BY_VALUE.get(method)?.requestsPayment ?? true;
}

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** One client as the importer understands it, before it reaches the database. */
export interface ParsedClient {
  /** Sage customer name. Unique across the export, so it is the natural key. */
  name: string;
  /** The `Staff` column exactly as exported — never discarded. */
  staffRaw: string;
  billingStatus: BillingStatus;
  /** Day of month the debit order runs, when the account is on one. */
  debitOrderDay: number | null;
  /** Accounts clerk who owns this client, normalised to a canonical spelling. */
  accountsOwner: string | null;
  /** True when the client is seasonal — billed only part of the year. */
  seasonal: boolean;

  contactName: string;
  tel: string;
  mobile: string;
  /** First deliverable address. Empty when absent or unusable. */
  email: string;
  /** Every address found, for clients who are billed to more than one inbox. */
  emails: string[];
  /** The Email cell verbatim when it held something that is not an address. */
  emailRaw: string;

  salesRep: string;
  pppoeUsername: string;

  packageRaw: string;
  packageSpeedMbps: number | null;
  /** Monthly price as quoted to the client — VAT inclusive. */
  packagePriceIncl: number | null;
  /** Sage's balance at the moment of export. Positive = the client owes us. */
  balance: number;

  /** Per-row problems a human should look at. Empty for a clean row. */
  issues: ClientIssue[];
}

export type ClientIssueKind =
  | "unknown_staff"
  | "no_email"
  | "invalid_email"
  | "package_unparsed"
  | "no_package"
  | "bad_balance";

export interface ClientIssue {
  kind: ClientIssueKind;
  detail: string;
}

export const ISSUE_LABELS: Record<ClientIssueKind, string> = {
  unknown_staff: "Unrecognised Staff value",
  no_email: "No email address",
  invalid_email: "Email column isn't an address",
  package_unparsed: "Package text couldn't be priced",
  no_package: "No package recorded",
  bad_balance: "Balance couldn't be read",
};

export interface ClientImportSummary {
  /** Data rows read from the file. */
  rowsRead: number;
  /** Rows that produced a client. */
  parsed: number;
  /** Rows skipped for having no name at all. */
  skippedNoName: number;
  /** Names appearing more than once in the file; the last row wins. */
  duplicateNames: string[];
  byStatus: Record<string, number>;
  billable: number;
  withEmail: number;
  withPricedPackage: number;
  issueCounts: Record<string, number>;
  /** Sum of positive balances — what the book says is owed. */
  totalOwing: number;
  totalCredit: number;
  /** Column headings as found, for error messages. */
  headings: string[];
}

/** A client row as the API returns it. */
export interface ClientRecord {
  id: string;
  name: string;
  staffRaw: string;
  billingStatus: BillingStatus;
  debitOrderDay: number | null;
  accountsOwner: string | null;
  seasonal: boolean;
  contactName: string;
  tel: string;
  mobile: string;
  email: string;
  emails: string[];
  salesRep: string;
  pppoeUsername: string;
  packageRaw: string;
  packageSpeedMbps: number | null;
  packagePriceIncl: number | null;
  packagePriceExcl: number | null;
  paymentMethod: PaymentMethod;
  billingNote: string;
  balance: number;
  leadId: string | null;
  needsReview: boolean;
  updatedAt: string;
}
