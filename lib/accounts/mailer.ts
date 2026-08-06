import nodemailer, { type Transporter } from "nodemailer";

/**
 * Sending client mail through MEGS's own mailbox.
 *
 * The department chose to send from their own megswb.co.za mail rather than a
 * transactional service, so that sent mail lands in the clerk's Sent Items and client
 * replies come back to a person rather than a no-reply address.
 *
 * CREDENTIALS LIVE IN THE ENVIRONMENT, NEVER THE DATABASE. A mailbox password stored
 * in a row is a password in every backup, every CSV export and every screen-share.
 * `accounts_staff` holds only a clerk's identity — the name that signs the letter and
 * the address replies go to.
 *
 * TWO ARRANGEMENTS, ONE CODE PATH. Which one applies is a configuration choice, not a
 * build-time one:
 *
 *   - One shared mailbox authenticates (accounts@megswb.co.za) and each clerk's
 *     address goes in Reply-To. Works everywhere, no special permissions.
 *   - The same mailbox has Send-As rights over the clerks' addresses, so `From` can
 *     be the clerk too. Set `can_send_as` on the clerk once that is granted.
 *
 * Reply-To is always the clerk either way, so replies reach a human even before
 * Send-As is arranged. If Send-As is claimed but not actually granted, Microsoft 365
 * and Google both reject the message rather than silently rewriting the sender —
 * which is why `can_send_as` defaults to false.
 *
 * Required environment:
 *   ACCOUNTS_SMTP_HOST      smtp.office365.com | smtp.gmail.com
 *   ACCOUNTS_SMTP_PORT      587 (STARTTLS) or 465 (implicit TLS)
 *   ACCOUNTS_SMTP_USER      the authenticating mailbox
 *   ACCOUNTS_SMTP_PASS      an APP PASSWORD, not the account password — both
 *                           Microsoft and Google refuse basic auth otherwise
 *   ACCOUNTS_SMTP_FROM      optional; defaults to ACCOUNTS_SMTP_USER
 *   ACCOUNTS_SMTP_SECURE    optional "true" to force implicit TLS
 */

export interface MailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface MailerStatus {
  configured: boolean;
  /** Safe to show in the UI — host and user only, never the password. */
  host?: string;
  user?: string;
  from?: string;
  /** What is missing, when it isn't configured. */
  missing: string[];
}

/**
 * This transport was built for invoicing, so its variables carry an ACCOUNTS_
 * prefix. It now also carries overdue alerts and the weekly digest, which are
 * nothing to do with accounts — so a plain SMTP_ name is read as a fallback.
 * The ACCOUNTS_ names keep working and still win, so no existing deployment
 * has to change anything.
 */
const envValue = (suffix: string): string | undefined =>
  process.env[`ACCOUNTS_SMTP_${suffix}`]?.trim() || process.env[`SMTP_${suffix}`]?.trim();

const missingKeys = (): string[] =>
  (["HOST", "USER", "PASS"] as const)
    .filter((suffix) => !envValue(suffix))
    .map((suffix) => `ACCOUNTS_SMTP_${suffix} (or SMTP_${suffix})`);

export function readMailerConfig(): MailerConfig | null {
  if (missingKeys().length) return null;

  const port = Number(envValue("PORT") ?? 587);
  const user = String(envValue("USER"));

  return {
    host: String(envValue("HOST")),
    port: Number.isFinite(port) ? port : 587,
    // Port 465 is implicit TLS; 587 upgrades via STARTTLS. Getting this backwards is
    // the single most common cause of a hung connection.
    secure: envValue("SECURE") ? envValue("SECURE") === "true" : port === 465,
    user,
    pass: String(envValue("PASS")),
    from: (envValue("FROM") ?? user).trim(),
  };
}

export function mailerStatus(): MailerStatus {
  const missing = missingKeys();
  if (missing.length) return { configured: false, missing };
  const config = readMailerConfig()!;
  return {
    configured: true,
    host: `${config.host}:${config.port}`,
    user: config.user,
    from: config.from,
    missing: [],
  };
}

let transporter: Transporter | null = null;
let transporterKey = "";

/** One pooled transport per configuration, so a monthly run reuses the connection. */
function getTransport(config: MailerConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.user}:${config.secure}`;
  if (transporter && transporterKey === key) return transporter;
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    pool: true,
    maxConnections: 3,
    // Providers throttle bulk sending; a monthly run is thousands of messages.
    maxMessages: 100,
  });
  transporterKey = key;
  return transporter;
}

/** Prove the credentials work without sending anything to a client. */
export async function verifyMailer(): Promise<{ ok: boolean; error?: string }> {
  const config = readMailerConfig();
  if (!config) return { ok: false, error: "SMTP is not configured." };
  try {
    await getTransport(config).verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMTP verification failed" };
  }
}

export interface Attachment {
  filename: string;
  content: Uint8Array;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  /** Plain text, exactly as the clerk approved it. */
  body: string;
  /** The clerk: signs the letter, and receives the replies. */
  senderName: string;
  senderEmail: string;
  /** True only when the mailbox has been granted Send-As for `senderEmail`. */
  canSendAs: boolean;
  attachments: Attachment[];
  cc?: string;
  bcc?: string;
}

/**
 * Turn the plain-text letter into HTML without reformatting it.
 *
 * The department wrote this letter; it is not for the app to restyle. Line breaks
 * become <br>, HTML is escaped, and nothing else changes — so what the clerk approved
 * on screen is what the client reads.
 */
export function bodyToHtml(body: string): string {
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">' +
    escaped.replace(/\n/g, "<br>") +
    "</div>"
  );
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendClientMail(mail: OutgoingMail): Promise<SendResult> {
  const config = readMailerConfig();
  if (!config) {
    return {
      ok: false,
      error:
        "Email isn't configured yet. Set ACCOUNTS_SMTP_HOST, ACCOUNTS_SMTP_USER and " +
        "ACCOUNTS_SMTP_PASS (an app password) in the environment.",
    };
  }
  if (!mail.to.trim()) {
    return { ok: false, error: "This client has no email address." };
  }

  // From is the clerk only where Send-As has actually been granted; otherwise the
  // authenticated mailbox sends and the clerk is on Reply-To. Claiming an unpermitted
  // From gets the whole message rejected.
  const from = mail.canSendAs && mail.senderEmail
    ? { name: mail.senderName, address: mail.senderEmail }
    : { name: mail.senderName || "MEGS Waterberg", address: config.from };

  try {
    const info = await getTransport(config).sendMail({
      from,
      to: mail.to,
      cc: mail.cc || undefined,
      bcc: mail.bcc || undefined,
      replyTo: mail.senderEmail || config.from,
      subject: mail.subject,
      text: mail.body,
      html: bodyToHtml(mail.body),
      attachments: mail.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
        contentType: "application/pdf",
      })),
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
