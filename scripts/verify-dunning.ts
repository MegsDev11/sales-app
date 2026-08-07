/**
 * Regression harness for collections / dunning.
 *
 * Run:  npx tsx scripts/verify-dunning.ts
 *
 * Dunning is the one place in the department where the software sends a customer a
 * threatening letter. Every failure mode is a real business cost:
 *
 *   - skipping the ladder sends a FINAL DEMAND as somebody's first ever contact;
 *   - a missing cooldown sends two demands to one inbox on one morning;
 *   - chasing a nil balance, or a debt whose age is unknown, chases the wrong people;
 *   - the wrong wording tells a debit-order client they "have not paid" when they were
 *     never asked to pay manually.
 *
 * Exits non-zero on any failed expectation.
 */

import {
  selectDunning,
  renderDunningLetter,
  type DunningLevel,
  type DunningTarget,
  type DunningNotice,
} from "../lib/accounts/dunning";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(
      `  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`
    );
    return false;
  }
  return true;
}

const AS_AT = new Date(Date.UTC(2026, 6, 31));

/** An ISO timestamp `days` before the as-at date. */
function daysAgo(days: number): string {
  const d = new Date(AS_AT);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

const LEVELS: DunningLevel[] = [
  {
    id: "adl-1", levelOrder: 1, name: "Payment reminder", minDays: 7, cooldownDays: 14,
    subject: "Your MEGS account — {{amount_due}} outstanding",
    body: "Dear {{contact_name}}, {{amount_due}} is outstanding ({{days_overdue}} days).\n{{accounts_owner}}",
    bodyDebitOrder:
      "Dear {{contact_name}}, {{amount_due}} is outstanding. Your account is paid by debit order, " +
      "so this usually means a debit was returned unpaid.\n{{accounts_owner}}",
    isSuspension: false, active: true,
  },
  {
    id: "adl-2", levelOrder: 2, name: "Second reminder", minDays: 30, cooldownDays: 14,
    subject: "Second reminder", body: "Second: {{amount_due}}", bodyDebitOrder: "",
    isSuspension: false, active: true,
  },
  {
    id: "adl-3", levelOrder: 3, name: "Final demand", minDays: 60, cooldownDays: 21,
    subject: "Final demand", body: "Final: {{amount_due}}", bodyDebitOrder: "",
    isSuspension: false, active: true,
  },
  {
    id: "adl-4", levelOrder: 4, name: "Suspension notice", minDays: 90, cooldownDays: 30,
    subject: "Suspension", body: "Suspension: {{amount_due}}", bodyDebitOrder: "",
    isSuspension: true, active: true,
  },
];

function target(over: Partial<DunningTarget> = {}): DunningTarget {
  return {
    clientId: "c1",
    name: "Abera Mulukena",
    contactName: "Mulukena Abera",
    email: "mulkonmuab@gmail.com",
    phone: "814 697 841",
    accountsOwner: "Leané van Deventer",
    paymentMethod: "eft",
    billingStatus: "active",
    total: 389,
    oldestDays: 45,
    broughtForward: 0,
    ...over,
  };
}

const run = (targets: DunningTarget[], history: DunningNotice[] = [], onlyLevelOrder?: number) =>
  selectDunning({ asAt: AS_AT, targets, levels: LEVELS, history, onlyLevelOrder });

/* ------------------------------------------------------------------ *
 * 1. Escalation is earned, never skipped
 * ------------------------------------------------------------------ */

console.log("Escalation ladder");

// 45 days old would justify level 2, but nothing has been sent — start at level 1.
check("first contact starts at level 1", run([target()]).candidates[0].level.levelOrder, 1);

// 200 days overdue with no history STILL starts at level 1. This is the one that
// matters: a first-ever contact must never be a suspension notice.
check(
  "a very old debt with no history still starts at level 1",
  run([target({ oldestDays: 200 })]).candidates[0].level.levelOrder,
  1
);

// Once level 1 has been sent and the cooldown has passed, level 2 is available.
const escalated = run([target({ oldestDays: 45 })], [
  { clientId: "c1", levelOrder: 1, sentAt: daysAgo(20) },
]);
check("escalates to level 2 after level 1", escalated.candidates[0].level.levelOrder, 2);
check("and is flagged as an escalation", escalated.candidates[0].isEscalation, true);

// Never more than one rung at a time.
check(
  "cannot jump two rungs",
  run([target({ oldestDays: 200 })], [
    { clientId: "c1", levelOrder: 1, sentAt: daysAgo(40) },
  ]).candidates[0].level.levelOrder,
  2
);

// Age still caps the level: level 1 sent, but only 10 days old — stay at 1.
check(
  "age caps the level even when history allows more",
  run([target({ oldestDays: 10 })], [
    { clientId: "c1", levelOrder: 1, sentAt: daysAgo(30) },
  ]).candidates[0].level.levelOrder,
  1
);

// The full ladder, one rung at a time.
check(
  "reaches suspension only after three prior levels",
  run([target({ oldestDays: 200 })], [
    { clientId: "c1", levelOrder: 1, sentAt: daysAgo(90) },
    { clientId: "c1", levelOrder: 2, sentAt: daysAgo(60) },
    { clientId: "c1", levelOrder: 3, sentAt: daysAgo(30) },
  ]).candidates[0].level.levelOrder,
  4
);

/* ------------------------------------------------------------------ *
 * 2. Cooldown — what makes a re-run safe
 * ------------------------------------------------------------------ */

console.log("Cooldown");

const cooling = run([target()], [{ clientId: "c1", levelOrder: 1, sentAt: daysAgo(3) }]);
check("a recent notice blocks a repeat", cooling.candidates.length, 0);
check("and says why", cooling.skipped[0].reason, "cooling_off");

check(
  "past the cooldown it sends again",
  run([target()], [{ clientId: "c1", levelOrder: 1, sentAt: daysAgo(15) }]).candidates.length,
  1
);

// A HIGHER level sent recently must also block a lower one — a client who got a final
// demand last week should not receive a gentle reminder today.
check(
  "a recent higher level blocks a lower one",
  run([target({ oldestDays: 10 })], [
    { clientId: "c1", levelOrder: 3, sentAt: daysAgo(2) },
  ]).candidates.length,
  0
);

/* ------------------------------------------------------------------ *
 * 3. Who is skipped, and why
 * ------------------------------------------------------------------ */

console.log("Skips");

check("nothing owed is skipped", run([target({ total: 0 })]).skipped[0].reason, "nothing_owed");
check("a credit balance is skipped", run([target({ total: -250 })]).skipped[0].reason, "nothing_owed");
check("too new is skipped", run([target({ oldestDays: 3 })]).skipped[0].reason, "not_old_enough");
check("no email is reported for a phone call", run([target({ email: "" })]).skipped[0].reason, "no_email");

// A debt made entirely of an un-aged Sage opening balance cannot be levelled.
check(
  "an un-aged opening balance is not chased",
  run([target({ oldestDays: null, broughtForward: 5000, total: 5000 })]).skipped[0].reason,
  "age_unknown"
);

// Cancelled clients who owe money ARE chased — that is exactly who to chase.
check(
  "a cancelled client who owes money is still chased",
  run([target({ billingStatus: "cancelled", oldestDays: 45 })]).candidates.length,
  1
);

// Every skip carries a reason; a silent drop is what makes a run untrustworthy.
check(
  "every skip has a detail",
  run([
    target({ clientId: "a", total: 0 }),
    target({ clientId: "b", oldestDays: 2 }),
    target({ clientId: "c", email: "" }),
  ]).skipped.every((s) => s.detail.length > 0),
  true
);

/* ------------------------------------------------------------------ *
 * 4. Ordering and level filtering
 * ------------------------------------------------------------------ */

console.log("Ordering");

const mixed = run(
  [
    target({ clientId: "small", total: 100, oldestDays: 45 }),
    target({ clientId: "big", total: 9000, oldestDays: 45 }),
    target({ clientId: "worst", total: 500, oldestDays: 200 }),
  ],
  [
    { clientId: "worst", levelOrder: 1, sentAt: daysAgo(60) },
    { clientId: "worst", levelOrder: 2, sentAt: daysAgo(40) },
    { clientId: "worst", levelOrder: 3, sentAt: daysAgo(30) },
  ]
);
check("highest level first", mixed.candidates[0].target.clientId, "worst");
check("then largest balance", mixed.candidates[1].target.clientId, "big");

check(
  "a run can be restricted to one level",
  run(
    [target({ clientId: "a", oldestDays: 45 }), target({ clientId: "b", oldestDays: 10 })],
    [],
    1
  ).candidates.length,
  2
);

/* ------------------------------------------------------------------ *
 * 5. The letter
 * ------------------------------------------------------------------ */

console.log("Letters");

// Built with the same formatter the renderer uses: en-ZA currency separates R from
// the figure with a NON-BREAKING space, so a hardcoded literal here would fail on an
// invisible difference and tell nobody anything useful.
const zar = (v: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(v);

const eft = renderDunningLetter(run([target()]).candidates[0], "Leané van Deventer");
check("subject merges the amount", eft.subject, `Your MEGS account — ${zar(389)} outstanding`);
check("body names the contact", eft.body.includes("Dear Mulukena Abera"), true);
check("body states the age", eft.body.includes("45 days"), true);
check("clerk signs it", eft.body.includes("Leané van Deventer"), true);
check("no unfilled tokens", /\{\{/.test(eft.body), false);

// A debit-order client is told a debit was returned, not that they failed to pay.
const debit = renderDunningLetter(
  run([target({ paymentMethod: "debit_order" })]).candidates[0],
  "Leané van Deventer"
);
check("debit-order variant is used", debit.body.includes("returned unpaid"), true);
check("and does not accuse them of not paying", debit.body.includes("is outstanding ("), false);

// A level with no variant written falls back to the standard body rather than sending
// an empty letter.
const noVariant = renderDunningLetter(
  run([target({ paymentMethod: "debit_order", oldestDays: 45 })], [
    { clientId: "c1", levelOrder: 1, sentAt: daysAgo(20) },
  ]).candidates[0],
  "Leané"
);
check("missing variant falls back to the standard body", noVariant.body.startsWith("Second:"), true);
check("and is never empty", noVariant.body.length > 0, true);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
