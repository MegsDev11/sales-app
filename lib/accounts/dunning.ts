import { renderTokens } from "./invoicing";
import { requestsPayment, type PaymentMethod } from "./constants";

/**
 * Deciding who gets chased, at what level, and who has been chased enough.
 *
 * Collections is the part of an accounts department where a mistake is expensive in
 * both directions. Chase too softly and the debt ages; chase wrongly and a paying
 * customer receives a final demand, which costs a phone call, goodwill, and sometimes
 * the customer. So the rules here are conservative and each one exists for a reason.
 *
 * ESCALATION IS EARNED, NOT ASSUMED. A client only reaches a level when their oldest
 * unpaid invoice is old enough for it AND the previous level has actually been sent.
 * Someone imported at 200 days overdue does not get a suspension notice as their first
 * ever contact — they get a reminder, then the ladder. This matters practically (it is
 * how the business shows it asked first) and commercially (a first-contact final
 * demand from a supplier you have never chased reads as an error, and gets treated as
 * one).
 *
 * THE COOLDOWN IS WHAT MAKES A RE-RUN SAFE. Runs get started twice; two clerks work
 * the same list. Without a cooldown the second pass is a second demand landing in the
 * same inbox on the same morning. With it, the second pass is a no-op.
 *
 * WHO IS CHASED IS NOT WHO IS INVOICED. A cancelled client is never invoiced again,
 * but if they left owing money they are exactly who to chase. Eligibility keys off the
 * balance and its age, never off billing status.
 */

export interface DunningLevel {
  id: string;
  levelOrder: number;
  name: string;
  minDays: number;
  cooldownDays: number;
  subject: string;
  body: string;
  bodyDebitOrder: string;
  isSuspension: boolean;
  active: boolean;
}

export interface DunningNotice {
  clientId: string;
  levelOrder: number;
  /** ISO timestamp. */
  sentAt: string;
}

/** The slice of an ageing row that collections needs. */
export interface DunningTarget {
  clientId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  accountsOwner: string | null;
  paymentMethod: PaymentMethod;
  billingStatus: string;
  /** What the client owes overall, net of credits. */
  total: number;
  /** Age of their oldest unpaid invoice. Null when they have none. */
  oldestDays: number | null;
  /** Sage opening balance — real money, age unknown. */
  broughtForward: number;
}

export type SkipReason =
  | "nothing_owed"
  | "not_old_enough"
  | "no_email"
  | "cooling_off"
  | "age_unknown";

export interface DunningCandidate {
  target: DunningTarget;
  level: DunningLevel;
  /** Days since this client was last sent anything, or null if never. */
  daysSinceLastNotice: number | null;
  /** True when the previous rung has been sent, so this level is a real escalation. */
  isEscalation: boolean;
}

export interface DunningSkip {
  target: DunningTarget;
  reason: SkipReason;
  detail: string;
}

export interface DunningSelection {
  candidates: DunningCandidate[];
  skipped: DunningSkip[];
}

const daysSince = (iso: string, asAt: Date): number => {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(asAt.getUTCFullYear(), asAt.getUTCMonth(), asAt.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
};

/**
 * Work out who should be chased today, and at what level.
 *
 * Returns both the candidates and the skips, with a reason on every skip — a run that
 * silently drops two thirds of the list is impossible to trust, and "why isn't this
 * client here?" is the first question anybody asks.
 */
export function selectDunning(input: {
  asAt: Date;
  targets: DunningTarget[];
  levels: DunningLevel[];
  history: DunningNotice[];
  /** Restrict the run to one level. Omitted means "whatever each client is due". */
  onlyLevelOrder?: number;
}): DunningSelection {
  const levels = input.levels
    .filter((l) => l.active)
    .sort((a, b) => a.levelOrder - b.levelOrder);

  const historyByClient = new Map<string, DunningNotice[]>();
  for (const notice of input.history) {
    const list = historyByClient.get(notice.clientId) ?? [];
    list.push(notice);
    historyByClient.set(notice.clientId, list);
  }

  const candidates: DunningCandidate[] = [];
  const skipped: DunningSkip[] = [];

  for (const target of input.targets) {
    if (target.total <= 0.005) {
      skipped.push({
        target,
        reason: "nothing_owed",
        detail: "Nothing outstanding.",
      });
      continue;
    }

    // A client whose entire debt is an un-aged Sage opening balance has no known age,
    // so no level can be justified. Chasing them needs the Sage age analysis first —
    // guessing would mean sending a final demand on a balance that might be current.
    if (target.oldestDays === null) {
      skipped.push({
        target,
        reason: "age_unknown",
        detail:
          target.broughtForward > 0
            ? "Only a Sage opening balance, whose age isn't known."
            : "No invoice to age this debt against.",
      });
      continue;
    }

    const sent = (historyByClient.get(target.clientId) ?? []).sort((a, b) =>
      b.sentAt.localeCompare(a.sentAt)
    );
    const highestSent = sent.reduce((max, n) => Math.max(max, n.levelOrder), 0);

    // The highest rung the age justifies…
    const byAge = levels.filter((l) => target.oldestDays! >= l.minDays);
    if (!byAge.length) {
      skipped.push({
        target,
        reason: "not_old_enough",
        detail: `Oldest item is ${target.oldestDays} days; the first reminder starts at ${
          levels[0]?.minDays ?? 0
        }.`,
      });
      continue;
    }
    const earnedByAge = byAge[byAge.length - 1];

    // …capped at one rung above whatever has actually been sent, so nobody's first
    // contact is a final demand. See the module header.
    const maxAllowed = highestSent + 1;
    const level =
      levels.find((l) => l.levelOrder === Math.min(earnedByAge.levelOrder, maxAllowed)) ??
      levels[0];

    if (input.onlyLevelOrder !== undefined && level.levelOrder !== input.onlyLevelOrder) {
      continue;
    }

    // Cooling off, measured from the last notice of ANY level.
    //
    // Deliberately not "any notice at or above this level". That weaker rule let an
    // escalation skip the cooldown entirely: a client sent a reminder on Monday
    // became eligible for the second reminder on Thursday, because no level-2 notice
    // existed yet to block it. Two letters in one week reads as a system fault and
    // gets treated as one. The gap is what the client experiences, so the gap is what
    // is measured — regardless of which rung is next.
    const lastNotice = sent[0];
    const daysSinceLast = lastNotice ? daysSince(lastNotice.sentAt, input.asAt) : null;
    if (lastNotice && daysSinceLast !== null && daysSinceLast < level.cooldownDays) {
      skipped.push({
        target,
        reason: "cooling_off",
        detail:
          `Last chased ${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago; ` +
          `"${level.name}" needs a gap of ${level.cooldownDays}.`,
      });
      continue;
    }

    if (!target.email.trim()) {
      // Reported rather than dropped: these are the clients who need a phone call,
      // and they are usually the ones furthest behind.
      skipped.push({
        target,
        reason: "no_email",
        detail: "No email address — this one needs a phone call.",
      });
      continue;
    }

    candidates.push({
      target,
      level,
      daysSinceLastNotice: daysSinceLast,
      isEscalation: highestSent > 0 && level.levelOrder > highestSent,
    });
  }

  // Worst first — the same order the collections list is worked in.
  candidates.sort((a, b) => {
    if (b.level.levelOrder !== a.level.levelOrder) {
      return b.level.levelOrder - a.level.levelOrder;
    }
    return b.target.total - a.target.total;
  });

  return { candidates, skipped };
}

/* ------------------------------------------------------------------ *
 * The letter
 * ------------------------------------------------------------------ */

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

export const DUNNING_MERGE_FIELDS: { token: string; blurb: string }[] = [
  { token: "client_name", blurb: "The client's account name" },
  { token: "contact_name", blurb: "The contact person, falling back to the account name" },
  { token: "accounts_owner", blurb: "The clerk sending it — signs the letter" },
  { token: "amount_due", blurb: "What the account owes in total" },
  { token: "days_overdue", blurb: "Age of the oldest unpaid invoice" },
  { token: "level_name", blurb: 'e.g. "Final demand"' },
];

/**
 * Render one client's letter.
 *
 * Debit-order clients get the variant that treats the debt as a returned debit rather
 * than an unpaid invoice — for them "you have not paid" is factually wrong, since they
 * never had to pay manually, and it invites a reply saying so. When a level has no
 * variant written, the standard body is used.
 */
export function renderDunningLetter(
  candidate: DunningCandidate,
  clerkName: string
): { subject: string; body: string } {
  const { target, level } = candidate;

  const values: Record<string, string> = {
    client_name: target.name,
    contact_name: target.contactName || target.name,
    accounts_owner: clerkName || target.accountsOwner || "MEGS Waterberg",
    amount_due: money(target.total),
    days_overdue: String(target.oldestDays ?? 0),
    level_name: level.name,
  };

  const useDebitVariant =
    !requestsPayment(target.paymentMethod) && level.bodyDebitOrder.trim().length > 0;

  return {
    subject: renderTokens(level.subject, values),
    body: renderTokens(useDebitVariant ? level.bodyDebitOrder : level.body, values),
  };
}
