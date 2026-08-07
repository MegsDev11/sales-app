import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/portal-auth";
import {
  buildInvoiceDocument,
  buildStatementDocument,
  loadClient,
  loadSettings,
} from "@/lib/accounts/documents";
import { sendClientMail } from "@/lib/accounts/mailer";
import { deriveAreaStatus } from "@/lib/utils/tower-status";
import type { TowerStatus } from "@/lib/types";
import {
  generateOtp,
  hashOtp,
  makeId,
  markVerified,
  verifiedClientId,
  type ChatSession,
} from "./session";
import { createEscalation } from "./escalate";
import type { AiAgentSettings } from "./settings";

/**
 * The assistant's entire reach into the business.
 *
 * The model never sees a connection string, a table name, or a query. It sees the
 * eight functions below, each of which runs one specific query and returns one
 * specific shape. That is what makes a figure in the chat window trustworthy: it came
 * out of `accounts_clients.balance`, not out of a language model's sense of what a
 * balance usually looks like.
 *
 * Three tiers:
 *   public    — anyone may call: outages, banking details
 *   identity  — the two halves of the one-time-code check
 *   verified  — refuse unless THIS session has a confirmed client, re-read from the
 *               database on every single call rather than trusted from the caller
 */

export interface ToolContext {
  db: SupabaseClient;
  session: ChatSession;
  /** For "did this come in after hours" on an escalation. */
  now: Date;
  /** Owner-editable, from /ai. See lib/ai/settings.ts. */
  settings: AiAgentSettings;
}

export interface ToolOutcome {
  /** Serialised into the tool_result block the model reads. */
  result: unknown;
  isError?: boolean;
  /** Set when a tool changed session state the request loop needs to know about. */
  verifiedClientId?: string;
  escalationId?: string;
}

/* ------------------------------------------------------------------ *
 * Definitions
 * ------------------------------------------------------------------ */

export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_network_status",
    description:
      "Check the live network for outages and per-area status. Call this FIRST for any " +
      "report of slow, intermittent or dead internet, before suggesting any " +
      "troubleshooting — if the client's area is already down, the fix is information, " +
      "not a router reboot. Needs no identity check.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          description:
            "Optional town, farm or area name to narrow to. Omit to get everything.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_payment_details",
    description:
      "MEGS's banking details, the proof-of-payment address, what reference a client " +
      "must use, and the payment terms. Use for any 'where do I pay / what are your " +
      "bank details / where do I send my POP / what reference' question. Needs no " +
      "identity check.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "request_account_verification",
    description:
      "Start the identity check needed before any account-specific answer. Requires " +
      "BOTH the account name and one contact detail already on the account (the email " +
      "address or the phone number). Sends a 6-digit code to the address on file and " +
      "returns only a masked hint of where it went. Never reveals whether an account " +
      "exists when the contact detail does not match.",
    input_schema: {
      type: "object",
      properties: {
        account_name: {
          type: "string",
          description: "The name the account is billed under, as the client gives it.",
        },
        contact: {
          type: "string",
          description:
            "An email address or phone number the client says is on the account. " +
            "Must match what is on file before any code is sent.",
        },
      },
      required: ["account_name", "contact"],
      additionalProperties: false,
    },
  },
  {
    name: "submit_verification_code",
    description:
      "Complete the identity check with the code the client received. On success the " +
      "account tools unlock for the rest of this conversation.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The 6-digit code the client was sent." },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
  {
    name: "get_account_summary",
    description:
      "The verified client's balance, when that balance was last updated, their debit " +
      "order day, billing status and monthly package price. Requires a completed " +
      "identity check.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_recent_transactions",
    description:
      "The verified client's recent ledger entries — invoices raised and payments " +
      "received, most recent first. Use to answer 'did you get my payment' and 'what " +
      "is this charge'. Requires a completed identity check.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "How many entries to return, 1 to 20. Defaults to 10.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "email_account_document",
    description:
      "Email the verified client their latest tax invoice or a statement of account. " +
      "It is always sent to the address already on the account — never to an address " +
      "given in this conversation. Requires a completed identity check.",
    input_schema: {
      type: "object",
      properties: {
        document: {
          type: "string",
          enum: ["invoice", "statement"],
          description: "Which document to send.",
        },
      },
      required: ["document"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_support",
    description:
      "Hand the conversation to a human. Use when troubleshooting has not fixed it, " +
      "when the client asks for a person, when the request needs a decision you must " +
      "not make (payment arrangements, credits, cancellations, refunds, contract " +
      "changes), or when anything is outside what your tools can answer. Collect a " +
      "name and a phone number or email first so somebody can call back.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["connectivity", "billing", "sales", "general"],
          description: "Which desk should pick this up.",
        },
        urgency: {
          type: "string",
          enum: ["normal", "urgent"],
          description:
            "'urgent' for a total loss of service or anything affecting a business's " +
            "ability to trade. Everything else is 'normal'.",
        },
        summary: {
          type: "string",
          description:
            "What the problem is AND what you already ruled out, so the person picking " +
            "this up does not repeat your steps.",
        },
        contact_name: { type: "string", description: "Who to ask for." },
        contact_phone: { type: "string", description: "Callback number, if given." },
        contact_email: { type: "string", description: "Email address, if given." },
      },
      required: ["category", "urgency", "summary", "contact_name"],
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function str(input: unknown, key: string): string {
  if (!input || typeof input !== "object") return "";
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Rands, as a South African reader expects to see them. */
function money(value: unknown): string {
  return `R ${num(value).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "the address on file";
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const head = name.slice(0, 1);
  return `${head}${"•".repeat(Math.max(3, name.length - 1))}${domain}`;
}

/** Last nine digits: enough to match 082…, +2782… and 082 111 2222 as one number. */
function phoneKey(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

function contactMatches(
  contact: string,
  row: { email?: string | null; emails?: string[] | null; tel?: string | null; mobile?: string | null }
): boolean {
  const wanted = contact.trim().toLowerCase();
  if (!wanted) return false;

  if (wanted.includes("@")) {
    const addresses = [row.email ?? "", ...(row.emails ?? [])]
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return addresses.includes(wanted);
  }

  const key = phoneKey(wanted);
  if (!key) return false;
  return [row.tel ?? "", row.mobile ?? ""].map(phoneKey).filter(Boolean).includes(key);
}

/**
 * The gate every account tool passes through.
 *
 * Reads verification from the database rather than from the session object handed in,
 * so that no amount of confusion in the request loop — or in the model — can produce
 * an answer about an account this conversation never proved it owns.
 */
async function requireVerified(
  ctx: ToolContext
): Promise<{ clientId: string } | { denied: ToolOutcome }> {
  const clientId = await verifiedClientId(ctx.db, ctx.session.id);
  if (!clientId) {
    return {
      denied: {
        result: {
          error: "not_verified",
          message:
            "This conversation has not completed the identity check, so no account " +
            "information can be read. Call request_account_verification first.",
        },
        isError: true,
      },
    };
  }
  return { clientId };
}

/* ------------------------------------------------------------------ *
 * Public tools
 * ------------------------------------------------------------------ */

async function getNetworkStatus(ctx: ToolContext, input: unknown): Promise<ToolOutcome> {
  const area = str(input, "area").toLowerCase();

  const { data: outages } = await ctx.db
    .from("tower_outages")
    .select("id, tower_id, title, message, affected_areas, started_at")
    .is("resolved_at", null)
    .eq("is_public", true)
    .order("started_at", { ascending: false });

  const { data: towers } = await ctx.db.from("towers").select("id, name, status");
  const { data: sites } = await ctx.db.from("tower_sites").select("area_id, status");

  const towerRows = (towers ?? []) as Array<{ id: string; name: string; status: string }>;
  const outageRows = (outages ?? []) as Array<{
    id: string;
    tower_id: string;
    title: string;
    message: string;
    affected_areas: string[] | null;
    started_at: string;
  }>;

  // Mirrors /api/network-status so the chat and the banner on the page can never
  // disagree about whether an area is down.
  const sitesByArea = new Map<string, TowerStatus[]>();
  for (const row of (sites ?? []) as Array<{ area_id: string; status: string }>) {
    const list = sitesByArea.get(row.area_id) ?? [];
    list.push(row.status as TowerStatus);
    sitesByArea.set(row.area_id, list);
  }

  const towerNames = new Map(towerRows.map((t) => [t.id, t.name]));
  const offlineTowerIds = new Set(outageRows.map((o) => o.tower_id));

  const matches = (name: string, areas: string[]) =>
    !area || name.toLowerCase().includes(area) ||
    areas.some((a) => a.toLowerCase().includes(area));

  const activeOutages = outageRows
    .map((row) => ({
      area: towerNames.get(row.tower_id) ?? "Unknown area",
      title: row.title,
      message: row.message,
      affectedAreas: row.affected_areas ?? [],
      startedAt: row.started_at,
    }))
    .filter((o) => matches(o.area, o.affectedAreas));

  const areas = towerRows
    .map((row) => ({
      area: row.name,
      status: deriveAreaStatus(
        row.status as TowerStatus,
        sitesByArea.get(row.id) ?? [],
        offlineTowerIds.has(row.id)
      ),
    }))
    .filter((a) => matches(a.area, []));

  return {
    result: {
      checkedAt: ctx.now.toISOString(),
      activeOutages,
      areas,
      note:
        activeOutages.length === 0
          ? "No public outage is currently logged for this area. Troubleshoot the client's own equipment."
          : "There is a known outage. Tell the client what is affected and when it started; do not ask them to reboot anything.",
    },
  };
}

async function getPaymentDetails(ctx: ToolContext): Promise<ToolOutcome> {
  const settings = await loadSettings(ctx.db);
  const c = settings.company;

  return {
    result: {
      accountName: c.bankAccountName,
      bank: c.bankName,
      accountNumber: c.bankAccountNumber,
      branchCode: c.bankBranchCode,
      proofOfPaymentEmail: c.popEmail,
      officePhone: c.officePhone,
      paymentTermsDays: settings.termsDays,
      reference:
        "The client must use the name their account is billed under as the payment " +
        "reference. Without it a payment cannot be matched to an account.",
      vatNumber: c.vatNumber,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Identity
 * ------------------------------------------------------------------ */

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

async function requestAccountVerification(
  ctx: ToolContext,
  input: unknown
): Promise<ToolOutcome> {
  const accountName = str(input, "account_name");
  const contact = str(input, "contact");

  if (!accountName || !contact) {
    return {
      result: { error: "missing_input", message: "Both an account name and a contact detail are required." },
      isError: true,
    };
  }

  // Two limits: one stops a single visitor grinding through names, the other stops a
  // pool of sessions being pointed at one victim's account.
  if (!checkRateLimit(`chat-otp-send:${ctx.session.id}`, 5, 15 * 60 * 1000)) {
    return {
      result: {
        error: "rate_limited",
        message:
          "Too many verification attempts on this conversation. Ask the client to " +
          "phone the office instead, or escalate.",
      },
      isError: true,
    };
  }

  const { data } = await ctx.db
    .from("accounts_clients")
    .select("id, name, email, emails, tel, mobile")
    .ilike("name", accountName)
    .limit(5);

  const candidates = (data ?? []) as Array<{
    id: string;
    name: string;
    email: string | null;
    emails: string[] | null;
    tel: string | null;
    mobile: string | null;
  }>;

  const match = candidates.find((row) => contactMatches(contact, row));

  // One answer for "no such account", "wrong contact detail" and "no address on
  // file". Distinguishing them would turn this tool into a customer-list oracle:
  // a different reply for a real name is all an enumerator needs.
  const noMatch: ToolOutcome = {
    result: {
      status: "no_match",
      message:
        "Those details do not match an account. Tell the client the name and contact " +
        "detail must match what MEGS has on file, and offer to put them through to a " +
        "person instead. Do not say whether the account name exists.",
    },
  };

  if (!match) return noMatch;

  const destination = (match.email ?? "").trim() ||
    (match.emails ?? []).map((e) => e.trim()).find(Boolean) || "";
  if (!destination) return noMatch;

  if (!checkRateLimit(`chat-otp-client:${match.id}`, 5, 15 * 60 * 1000)) {
    return noMatch;
  }

  const code = generateOtp();
  const expiresAt = new Date(ctx.now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  const { error } = await ctx.db.from("support_chat_verifications").insert({
    id: makeId("cver"),
    session_id: ctx.session.id,
    client_id: match.id,
    channel: "email",
    destination_masked: maskEmail(destination),
    code_hash: hashOtp(code),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;

  const sent = await sendClientMail({
    to: destination,
    subject: `Your MEGS verification code: ${code}`,
    body:
      `Hi${match.name ? ` ${match.name}` : ""},\n\n` +
      `Your verification code is ${code}.\n\n` +
      `It lets the assistant on our website read your account details, and expires in ` +
      `${OTP_TTL_MINUTES} minutes.\n\n` +
      `If you did not ask for this code, ignore this email and no one will see your ` +
      `account. Nothing has changed.\n\n` +
      `MEGS Waterberg`,
    senderName: "MEGS Waterberg",
    senderEmail: "",
    canSendAs: false,
    attachments: [],
  });

  if (!sent.ok) {
    return {
      result: {
        error: "send_failed",
        message:
          "The code could not be emailed. Apologise, and offer to have somebody call " +
          "the client back instead — escalate with their number.",
      },
      isError: true,
    };
  }

  return {
    result: {
      status: "code_sent",
      sentTo: maskEmail(destination),
      expiresInMinutes: OTP_TTL_MINUTES,
      message:
        "Tell the client a 6-digit code has been emailed to the masked address, and " +
        "ask them to type it here.",
    },
  };
}

async function submitVerificationCode(
  ctx: ToolContext,
  input: unknown
): Promise<ToolOutcome> {
  const code = str(input, "code").replace(/\D/g, "");
  if (!code) {
    return { result: { error: "missing_code", message: "No code was given." }, isError: true };
  }

  if (!checkRateLimit(`chat-otp-check:${ctx.session.id}`, 10, 15 * 60 * 1000)) {
    return {
      result: {
        error: "rate_limited",
        message: "Too many code attempts. Offer to have somebody phone the client instead.",
      },
      isError: true,
    };
  }

  const { data } = await ctx.db
    .from("support_chat_verifications")
    .select("id, client_id, code_hash, attempts, expires_at, consumed_at")
    .eq("session_id", ctx.session.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const challenge = data as {
    id: string;
    client_id: string;
    code_hash: string;
    attempts: number | null;
    expires_at: string;
  } | null;

  if (!challenge) {
    return {
      result: {
        status: "no_pending_code",
        message: "No code is outstanding. Start the check again with request_account_verification.",
      },
    };
  }

  if (new Date(challenge.expires_at).getTime() < ctx.now.getTime()) {
    return {
      result: { status: "expired", message: "That code has expired. Offer to send a new one." },
    };
  }

  const attempts = (challenge.attempts ?? 0) + 1;
  await ctx.db
    .from("support_chat_verifications")
    .update({ attempts })
    .eq("id", challenge.id);

  if (attempts > OTP_MAX_ATTEMPTS) {
    // Burn the challenge rather than let it be guessed at indefinitely.
    await ctx.db
      .from("support_chat_verifications")
      .update({ consumed_at: ctx.now.toISOString() })
      .eq("id", challenge.id);
    return {
      result: {
        status: "too_many_attempts",
        message: "Too many wrong codes. This code is now dead — offer to escalate to a person.",
      },
    };
  }

  if (hashOtp(code) !== challenge.code_hash) {
    return {
      result: {
        status: "incorrect",
        attemptsRemaining: Math.max(0, OTP_MAX_ATTEMPTS - attempts),
        message: "That code is wrong. Ask them to check the email and try again.",
      },
    };
  }

  await ctx.db
    .from("support_chat_verifications")
    .update({ consumed_at: ctx.now.toISOString() })
    .eq("id", challenge.id);
  await markVerified(ctx.db, ctx.session.id, challenge.client_id, "email");

  return {
    result: {
      status: "verified",
      message: "Identity confirmed. The account tools are now available for this conversation.",
    },
    verifiedClientId: challenge.client_id,
  };
}

/* ------------------------------------------------------------------ *
 * Verified-only tools
 * ------------------------------------------------------------------ */

async function getAccountSummary(ctx: ToolContext): Promise<ToolOutcome> {
  const gate = await requireVerified(ctx);
  if ("denied" in gate) return gate.denied;

  const { data } = await ctx.db
    .from("accounts_clients")
    .select(
      "name, balance, balance_as_at, debit_order_day, billing_status, package_raw, " +
        "package_price_incl, package_speed_mbps, accounts_owner"
    )
    .eq("id", gate.clientId)
    .maybeSingle();

  const row = data as Record<string, unknown> | null;
  if (!row) {
    return { result: { error: "not_found", message: "The account could not be read." }, isError: true };
  }

  const balance = num(row.balance);

  return {
    result: {
      accountName: String(row.name ?? ""),
      // Sage's sign convention: positive means the client owes MEGS.
      balance: money(balance),
      balanceMeaning:
        balance > 0
          ? "This amount is owing to MEGS."
          : balance < 0
            ? "The account is in credit — nothing is owing."
            : "The account is settled.",
      balanceAsAt: row.balance_as_at ?? null,
      balanceCaveat:
        "This is the balance as at the date above. A payment made after that date may " +
        "not be reflected yet — say so if the client mentions a recent payment.",
      debitOrderDay: row.debit_order_day ?? null,
      billingStatus: String(row.billing_status ?? ""),
      monthlyPrice:
        row.package_price_incl === null || row.package_price_incl === undefined
          ? null
          : money(row.package_price_incl),
      package: String(row.package_raw ?? ""),
      accountsContact: String(row.accounts_owner ?? ""),
    },
  };
}

async function getRecentTransactions(ctx: ToolContext, input: unknown): Promise<ToolOutcome> {
  const gate = await requireVerified(ctx);
  if ("denied" in gate) return gate.denied;

  const raw = input && typeof input === "object" ? (input as Record<string, unknown>).limit : null;
  const limit = Math.min(20, Math.max(1, Math.trunc(num(raw, 10)) || 10));

  const { data } = await ctx.db
    .from("accounts_transactions")
    .select("txn_date, reference, txn_type, description, debit, credit")
    .eq("client_id", gate.clientId)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as Array<{
    txn_date: string;
    reference: string | null;
    txn_type: string | null;
    description: string | null;
    debit: number | string;
    credit: number | string;
  }>;

  return {
    result: {
      count: rows.length,
      transactions: rows.map((r) => ({
        date: r.txn_date,
        reference: r.reference ?? "",
        type: r.txn_type ?? "",
        description: r.description ?? "",
        charged: num(r.debit) ? money(r.debit) : null,
        paid: num(r.credit) ? money(r.credit) : null,
      })),
      note:
        rows.length === 0
          ? "No transactions are recorded for this account."
          : "'charged' is money billed to the client; 'paid' is money received from them.",
    },
  };
}

async function emailAccountDocument(ctx: ToolContext, input: unknown): Promise<ToolOutcome> {
  const gate = await requireVerified(ctx);
  if ("denied" in gate) return gate.denied;

  const kind = str(input, "document");
  if (kind !== "invoice" && kind !== "statement") {
    return {
      result: { error: "bad_document", message: "document must be 'invoice' or 'statement'." },
      isError: true,
    };
  }

  // One document per conversation per few minutes: this sends real mail.
  if (!checkRateLimit(`chat-doc:${ctx.session.id}`, 4, 15 * 60 * 1000)) {
    return {
      result: {
        error: "rate_limited",
        message: "Several documents have already been sent. Offer to escalate instead.",
      },
      isError: true,
    };
  }

  const client = await loadClient(ctx.db, gate.clientId);
  if (!client) {
    return { result: { error: "not_found", message: "The account could not be read." }, isError: true };
  }

  // Always the address on file. An address typed into a public chat window is exactly
  // what an attacker who got past verification would supply.
  const to = (client.email ?? "").trim();
  if (!to) {
    return {
      result: {
        error: "no_email",
        message:
          "There is no email address on this account, so nothing can be sent. Offer to " +
          "escalate so accounts can add one.",
      },
      isError: true,
    };
  }

  const settings = await loadSettings(ctx.db);

  try {
    let filename: string;
    let pdf: Uint8Array;
    let subject: string;
    let body: string;

    if (kind === "invoice") {
      // Rebuild an invoice that was actually issued. Never generate a fresh one: the
      // number is a legal sequence and burning one to answer a chat question would
      // leave a gap in the books to explain.
      const { data } = await ctx.db
        .from("accounts_invoices")
        .select("invoice_number, invoice_date, billing_period, status")
        .eq("client_id", gate.clientId)
        .in("status", ["issued", "sent"])
        .order("billing_period", { ascending: false })
        .limit(1)
        .maybeSingle();

      const invoice = data as {
        invoice_number: string;
        invoice_date: string;
        billing_period: string;
      } | null;

      if (!invoice) {
        return {
          result: {
            status: "no_invoice",
            message:
              "No invoice has been issued on this account yet. Offer to send a statement " +
              "of account instead.",
          },
        };
      }

      const built = await buildInvoiceDocument(client, settings, {
        invoiceNumber: invoice.invoice_number,
        invoiceDate: new Date(invoice.invoice_date),
      });
      pdf = built.pdf;
      filename = built.filename;
      subject = `Tax Invoice ${invoice.invoice_number} — ${client.name}`;
      body =
        `Hi${client.contact_name ? ` ${client.contact_name}` : ""},\n\n` +
        `Your tax invoice ${invoice.invoice_number} is attached, as requested through ` +
        `the assistant on our website.\n\nMEGS Waterberg`;
    } else {
      const to_ = ctx.now;
      const from = new Date(Date.UTC(to_.getUTCFullYear(), to_.getUTCMonth() - 2, 1));
      const built = await buildStatementDocument(ctx.db, client, settings, { from, to: to_ });
      pdf = built.pdf;
      filename = built.filename;
      subject = `Statement of account — ${client.name}`;
      body =
        `Hi${client.contact_name ? ` ${client.contact_name}` : ""},\n\n` +
        `Your statement of account is attached, as requested through the assistant on ` +
        `our website.\n\nMEGS Waterberg`;
    }

    const sent = await sendClientMail({
      to,
      subject,
      body,
      senderName: "MEGS Waterberg",
      senderEmail: "",
      canSendAs: false,
      attachments: [{ filename, content: pdf }],
    });

    if (!sent.ok) {
      return {
        result: {
          error: "send_failed",
          message: `The document could not be emailed (${sent.error ?? "unknown error"}). Offer to escalate.`,
        },
        isError: true,
      };
    }

    return {
      result: {
        status: "sent",
        document: kind,
        sentTo: maskEmail(to),
        message: "Confirm to the client that it is on its way to the address on their account.",
      },
    };
  } catch (e) {
    // buildInvoiceDocument refuses when the client has no monthly price on record.
    return {
      result: {
        error: "build_failed",
        message: `${e instanceof Error ? e.message : "The document could not be built."} Offer to escalate.`,
      },
      isError: true,
    };
  }
}

/* ------------------------------------------------------------------ *
 * Escalation
 * ------------------------------------------------------------------ */

async function escalateToSupport(ctx: ToolContext, input: unknown): Promise<ToolOutcome> {
  const category = str(input, "category") || "general";
  const urgency = str(input, "urgency") === "urgent" ? "urgent" : "normal";
  const summary = str(input, "summary");
  const contactName = str(input, "contact_name");
  const contactPhone = str(input, "contact_phone");
  const contactEmail = str(input, "contact_email");

  if (!summary || !contactName) {
    return {
      result: {
        error: "missing_input",
        message: "A summary and a contact name are needed before this can be logged.",
      },
      isError: true,
    };
  }

  const allowed = ["connectivity", "billing", "sales", "general"];
  const escalation = await createEscalation(ctx.db, {
    sessionId: ctx.session.id,
    category: allowed.includes(category) ? category : "general",
    urgency,
    summary,
    contactName,
    contactPhone,
    contactEmail,
    // Only attaches an account when this conversation actually proved one.
    accountsClientId: await verifiedClientId(ctx.db, ctx.session.id),
    now: ctx.now,
    oncallEmail: ctx.settings.oncallEmail,
    opensHour: ctx.settings.officeOpensHour,
    closesHour: ctx.settings.officeClosesHour,
  });

  return {
    result: {
      status: "logged",
      reference: escalation.reference,
      afterHours: escalation.afterHours,
      notified: escalation.notified,
      message: escalation.afterHours
        ? "Logged and the on-call address has been emailed. Tell the client the office " +
          "opens at 08:00 and give them the reference."
        : "Logged for the support desk. Give the client the reference.",
    },
    escalationId: escalation.id,
  };
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

type Handler = (ctx: ToolContext, input: unknown) => Promise<ToolOutcome>;

const HANDLERS: Record<string, Handler> = {
  get_network_status: getNetworkStatus,
  get_payment_details: (ctx) => getPaymentDetails(ctx),
  request_account_verification: requestAccountVerification,
  submit_verification_code: submitVerificationCode,
  get_account_summary: (ctx) => getAccountSummary(ctx),
  get_recent_transactions: getRecentTransactions,
  email_account_document: emailAccountDocument,
  escalate_to_support: escalateToSupport,
};

export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext
): Promise<ToolOutcome> {
  const handler = HANDLERS[name];
  if (!handler) {
    return { result: { error: "unknown_tool", message: `No such tool: ${name}` }, isError: true };
  }
  try {
    return await handler(ctx, input);
  } catch (e) {
    // A tool that throws must not take the conversation down with it — the model is
    // told the tool failed and can apologise or escalate.
    return {
      result: {
        error: "tool_failed",
        message: e instanceof Error ? e.message : "The lookup failed.",
      },
      isError: true,
    };
  }
}
