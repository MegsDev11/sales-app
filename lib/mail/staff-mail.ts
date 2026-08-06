import type { SupabaseClient } from "@supabase/supabase-js";
import { sendClientMail } from "@/lib/accounts/mailer";

/**
 * Mail to our own staff, as opposed to mail to clients.
 *
 * The transport is the same one invoicing uses; what differs is who it goes to
 * and why. A client letter is signed by the clerk who wrote it — an internal
 * alert is from the system, so there is no send-as identity to assume.
 *
 * Every function here is best-effort by design. An overdue digest that fails to
 * send must never take down the sweep that generated it: the notification rows
 * are already written, and the bell still works.
 */

export interface StaffMailResult {
  sent: number;
  failed: number;
  skipped: string[];
}

/** Who holds a module at the given level, and has an email address. */
export async function recipientsForModule(
  db: SupabaseClient,
  moduleKey: string,
  level: "view" | "edit" | "manage" = "manage"
): Promise<{ id: string; name: string; email: string }[]> {
  const { data: members } = await db
    .from("team_members")
    .select("id, name, email, active")
    .eq("active", true);

  const candidates = ((members ?? []) as Record<string, unknown>[]).filter((m) =>
    String(m.email ?? "").includes("@")
  );
  if (candidates.length === 0) return [];

  // effective_module_level() is the same function RLS uses, so this cannot
  // drift from what the person actually sees in the app.
  const out: { id: string; name: string; email: string }[] = [];
  const rank = { none: 0, view: 1, edit: 2, manage: 3 } as const;
  for (const m of candidates) {
    const { data: effective } = await db.rpc("effective_module_level", {
      p_module: moduleKey,
      p_user: String(m.id),
    });
    const held = String(effective ?? "none") as keyof typeof rank;
    if ((rank[held] ?? 0) >= rank[level]) {
      out.push({ id: String(m.id), name: String(m.name ?? ""), email: String(m.email) });
    }
  }
  return out;
}

export async function sendStaffMail(
  to: { name: string; email: string }[],
  subject: string,
  body: string
): Promise<StaffMailResult> {
  const result: StaffMailResult = { sent: 0, failed: 0, skipped: [] };
  for (const person of to) {
    try {
      const outcome = await sendClientMail({
        to: person.email,
        subject,
        body,
        // From the system, not from a colleague — there is nobody to reply to
        // personally, and pretending otherwise invites replies nobody reads.
        senderName: "MEGS Waterberg",
        senderEmail: "",
        canSendAs: false,
        attachments: [],
      });
      if (outcome.ok) result.sent += 1;
      else {
        result.failed += 1;
        result.skipped.push(`${person.email}: ${outcome.error ?? "send failed"}`);
      }
    } catch (error) {
      result.failed += 1;
      result.skipped.push(
        `${person.email}: ${error instanceof Error ? error.message : "send failed"}`
      );
    }
  }
  return result;
}
