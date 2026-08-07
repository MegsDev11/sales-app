import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendClientMail } from "@/lib/accounts/mailer";
import { loadTranscript, makeId } from "./session";

/**
 * Handing a conversation to a person.
 *
 * The point of the whole feature is that this happens less often. When it does happen
 * it must happen well: a row in a queue somebody actually works, carrying the full
 * transcript so the client is not asked the same four questions again, plus — outside
 * office hours — an email to whoever is on call, because "we'll look at it in the
 * morning" is the answer this module exists to stop giving.
 */

/**
 * South Africa has not observed daylight saving since 1944, so SAST is UTC+2 all year
 * and a fixed offset is correct rather than merely convenient.
 */
const SAST_OFFSET_MINUTES = 120;
export const DEFAULT_OPENS_HOUR = 8;
export const DEFAULT_CLOSES_HOUR = 17;

/** Hours are owner-editable in /ai; the defaults are the historic office hours. */
export function isAfterHours(
  now: Date,
  opensHour: number = DEFAULT_OPENS_HOUR,
  closesHour: number = DEFAULT_CLOSES_HOUR
): boolean {
  const sast = new Date(now.getTime() + SAST_OFFSET_MINUTES * 60_000);
  const day = sast.getUTCDay();
  if (day === 0 || day === 6) return true;
  const hour = sast.getUTCHours();
  return hour < opensHour || hour >= closesHour;
}

/** Short, unambiguous when read aloud over the phone: no O/0 or I/1 confusion. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newReference(): string {
  const bytes = randomBytes(5);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `CHT-${out}`;
}

export interface EscalationInput {
  sessionId: string;
  category: string;
  urgency: string;
  summary: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  accountsClientId: string | null;
  now: Date;
  /** From ai_agent_settings, falling back to SUPPORT_ONCALL_EMAIL. */
  oncallEmail: string;
  opensHour: number;
  closesHour: number;
}

export interface EscalationResult {
  id: string;
  reference: string;
  afterHours: boolean;
  notified: boolean;
}

export async function createEscalation(
  db: SupabaseClient,
  input: EscalationInput
): Promise<EscalationResult> {
  const id = makeId("cesc");
  const reference = newReference();
  const afterHours = isAfterHours(input.now, input.opensHour, input.closesHour);

  const { error } = await db.from("support_chat_escalations").insert({
    id,
    reference,
    session_id: input.sessionId,
    category: input.category,
    urgency: input.urgency,
    summary: input.summary,
    contact_name: input.contactName,
    contact_phone: input.contactPhone,
    contact_email: input.contactEmail,
    accounts_client_id: input.accountsClientId,
    after_hours: afterHours,
    status: "new",
  });
  if (error) throw error;

  await db
    .from("support_chat_sessions")
    .update({ status: "escalated" })
    .eq("id", input.sessionId);

  const notified = await notifyOnCall(db, { ...input, id, reference, afterHours });

  return { id, reference, afterHours, notified };
}

/**
 * Email whoever is on call.
 *
 * Sent for every escalation, not only after-hours ones — during office hours it is
 * simply the queue notification. A failure here is recorded on the row and swallowed:
 * the escalation is already saved, and telling the client "I could not log that"
 * because an SMTP handshake failed would be a lie.
 */
async function notifyOnCall(
  db: SupabaseClient,
  input: EscalationInput & { id: string; reference: string; afterHours: boolean }
): Promise<boolean> {
  const to = input.oncallEmail.trim();
  if (!to) {
    await db
      .from("support_chat_escalations")
      .update({
        notify_error:
          "No on-call address is set. Add one in AI Agents, or set SUPPORT_ONCALL_EMAIL.",
      })
      .eq("id", input.id);
    return false;
  }

  let transcript = "";
  try {
    const messages = await loadTranscript(db, input.sessionId);
    transcript = messages
      .map((m) => `${m.role === "user" ? "Client" : "Assistant"}: ${m.body}`)
      .join("\n\n");
  } catch {
    transcript = "(the transcript could not be read)";
  }

  const when = new Date(input.now.getTime() + SAST_OFFSET_MINUTES * 60_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);

  const flag = input.urgency === "urgent" ? "URGENT" : "New";
  const hours = input.afterHours ? "after hours" : "during office hours";

  const body = [
    `${flag} ${input.category} escalation from the website assistant, ${hours}.`,
    "",
    `Reference:  ${input.reference}`,
    `Logged:     ${when} SAST`,
    `Contact:    ${input.contactName}`,
    `Phone:      ${input.contactPhone || "—"}`,
    `Email:      ${input.contactEmail || "—"}`,
    `Account:    ${input.accountsClientId ? "verified — linked in the queue" : "not verified"}`,
    "",
    "What the assistant established:",
    input.summary,
    "",
    "---- full conversation ----",
    "",
    transcript,
  ].join("\n");

  const sent = await sendClientMail({
    to,
    subject: `[${input.reference}] ${flag} ${input.category} — ${input.contactName}`,
    body,
    senderName: "MEGS Website Assistant",
    senderEmail: "",
    canSendAs: false,
    attachments: [],
  });

  await db
    .from("support_chat_escalations")
    .update(
      sent.ok
        ? { notified_at: new Date().toISOString(), notify_error: "" }
        : { notify_error: sent.error ?? "Send failed." }
    )
    .eq("id", input.id);

  return sent.ok;
}
