/**
 * Works out which client a bank deposit came from.
 *
 * This is the piece that decides whether payments are a workable feature or a month
 * of typing. With ~2 000 paying clients, a statement carries hundreds of credits a
 * month, each identified only by whatever narration the payer typed into their
 * banking app. Those narrations are short, truncated by the bank, and inconsistent:
 *
 *     ACB CREDIT MEGSWB FTTHKOBUSPIENAAR
 *     FNB APP PAYMENT FROM ABERA MULUKENA
 *     IB PAYMENT FROM J PIENAAR
 *     EFT INV1000042
 *
 * SIGNALS, IN ORDER OF TRUST. An invoice number is conclusive — nobody types
 * INV1000042 by accident. A PPPoE username is nearly as good: it is unique, and it is
 * what MEGS puts on the invoice as the account reference. A client name is strong but
 * not conclusive, because names collide and banks truncate. An amount that matches an
 * outstanding invoice exactly is corroborating but never sufficient on its own —
 * hundreds of clients pay exactly R299.
 *
 * NOTHING BELOW `high` IS EVER POSTED AUTOMATICALLY. A wrongly allocated receipt
 * credits the wrong client, understates a real debtor, and is found weeks later when
 * somebody is chased for money they already paid. The cost of a false match is far
 * higher than the cost of a human glancing at a queue, so the bar to auto-post is
 * deliberately high and everything else is presented for confirmation with its
 * reasons shown.
 */

export type Confidence = "certain" | "high" | "medium" | "low";

export interface MatchableClient {
  id: string;
  name: string;
  pppoeUsername: string;
  email: string;
}

export interface OpenInvoice {
  id: string;
  clientId: string;
  invoiceNumber: string;
  /** What is still owed on this invoice. */
  outstanding: number;
  invoiceDate: string;
}

export interface MatchCandidate {
  clientId: string;
  clientName: string;
  /** Set when a specific invoice is implicated. */
  invoiceId?: string;
  invoiceNumber?: string;
  confidence: Confidence;
  score: number;
  /** Shown to whoever confirms the match. */
  reasons: string[];
}

export interface BankLineForMatching {
  description: string;
  reference: string;
  amount: number;
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

/** Uppercase, punctuation to spaces, collapsed. */
export function normText(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

/** Same, with spaces removed — for substring hunts in mangled narrations. */
const squash = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, "");

/**
 * Words that carry no identifying information in a South African company name.
 * Dropping them stops "MEGS TRUST" matching "SMITH TRUST" on the word TRUST.
 */
const NOISE = new Set([
  "PTY", "LTD", "LIMITED", "CC", "INC", "TRUST", "BK", "EDMS", "BPK",
  "TA", "THE", "AND", "EN", "VAN", "DER", "DE", "MNR", "MEV",
]);

export function nameTokens(name: string): string[] {
  return normText(name)
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE.has(t));
}

/** The identifying part of a PPPoE username: the bit before the @. */
export function pppoeKey(username: string): string {
  const local = username.split("@")[0] ?? "";
  return squash(local);
}

/* ------------------------------------------------------------------ *
 * Matching
 * ------------------------------------------------------------------ */

const CONFIDENCE_ORDER: Record<Confidence, number> = {
  certain: 3,
  high: 2,
  medium: 1,
  low: 0,
};

/** Only these are safe to post without a person looking. */
export function isAutoPostable(confidence: Confidence): boolean {
  return CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER.high;
}

/** Invoice numbers as they appear on MEGS documents: INV followed by digits. */
const INVOICE_RE = /\b(INV\s?0*\d{4,})\b/gi;

export function findInvoiceNumbers(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(INVOICE_RE)) {
    found.add(m[1].replace(/\s+/g, "").toUpperCase());
  }
  return [...found];
}

/**
 * Rank the clients a bank line might belong to.
 *
 * Only credits are considered: a debit is money leaving, which is a supplier payment
 * or a bank charge, not a client receipt. Returns at most `limit` candidates, best
 * first; an empty array means the line needs a human to say who it was.
 */
export function matchBankLine(
  line: BankLineForMatching,
  clients: MatchableClient[],
  openInvoices: OpenInvoice[],
  limit = 5
): MatchCandidate[] {
  if (line.amount <= 0) return [];

  const haystack = `${line.description} ${line.reference}`;
  const norm = normText(haystack);
  const squashed = squash(haystack);

  const byClient = new Map<string, MatchCandidate>();

  const consider = (
    clientId: string,
    clientName: string,
    score: number,
    confidence: Confidence,
    reason: string,
    invoice?: OpenInvoice
  ) => {
    const existing = byClient.get(clientId);
    if (existing) {
      existing.score += score;
      existing.reasons.push(reason);
      if (CONFIDENCE_ORDER[confidence] > CONFIDENCE_ORDER[existing.confidence]) {
        existing.confidence = confidence;
      }
      if (invoice && !existing.invoiceId) {
        existing.invoiceId = invoice.id;
        existing.invoiceNumber = invoice.invoiceNumber;
      }
      return;
    }
    byClient.set(clientId, {
      clientId,
      clientName,
      invoiceId: invoice?.id,
      invoiceNumber: invoice?.invoiceNumber,
      confidence,
      score,
      reasons: [reason],
    });
  };

  const clientById = new Map(clients.map((c) => [c.id, c]));

  // --- 1. an invoice number in the narration: conclusive ---
  const quoted = findInvoiceNumbers(haystack);
  for (const number of quoted) {
    const invoice = openInvoices.find(
      (i) => i.invoiceNumber.toUpperCase() === number
    );
    if (!invoice) continue;
    const client = clientById.get(invoice.clientId);
    if (!client) continue;
    consider(
      client.id,
      client.name,
      100,
      "certain",
      `Quotes invoice ${invoice.invoiceNumber}`,
      invoice
    );
  }

  // --- 2. PPPoE username: unique, and it is the reference we ask them to use ---
  //
  // Collected before scoring, because usernames are not independent of each other.
  // The real book contains `ajmotorspares` and `ajmotorspares2` for two different
  // branches, so a narration quoting the SECOND also literally contains the first.
  // Scoring both would tie the wrong client with the right one and — via the
  // ambiguity rule — demote the correct match. A key that is a strict substring of
  // another matching key is a coincidence of prefixes, not evidence, so it is dropped.
  const pppoeHits: { client: MatchableClient; key: string }[] = [];
  for (const client of clients) {
    const key = pppoeKey(client.pppoeUsername);
    // Short keys produce accidental substring hits inside longer words.
    if (key.length < 6) continue;
    if (squashed.includes(key)) pppoeHits.push({ client, key });
  }

  for (const hit of pppoeHits) {
    const shadowed = pppoeHits.some((o) => o.key !== hit.key && o.key.includes(hit.key));
    if (shadowed) continue;

    // Some clients' usernames are bare first names — the book contains `martin`.
    // Those identify a person about as well as "PAYMENT FROM MARTIN" does, so they
    // are suggestive rather than conclusive and must not auto-post on their own.
    const distinctive = hit.key.length >= 8;
    consider(
      hit.client.id,
      hit.client.name,
      distinctive ? 60 : 35,
      distinctive ? "high" : "medium",
      `Reference contains ${hit.key}${distinctive ? "" : " (short username — worth checking)"}`
    );
  }

  // --- 3. the client's name ---
  for (const client of clients) {
    const tokens = nameTokens(client.name);
    if (!tokens.length) continue;

    const full = tokens.join(" ");

    // A multi-word name is distinctive enough to match even where the bank has run
    // the words together ("MEGSWB ABERAMULUKENA"), so that compares squashed.
    // A SINGLE-word name must match on a word boundary: "PIENAAR" appearing inside
    // "FTTHKOBUSPIENAAR" is the PPPoE signal above doing its job, not independent
    // evidence, and counting it twice would push a guess over the auto-post line.
    const matchedFullName =
      tokens.length > 1
        ? squashed.includes(squash(full))
        : full.length >= 6 && new RegExp(`(^| )${full}( |$)`).test(norm);

    if (matchedFullName) {
      consider(client.id, client.name, 50, "high", `Narration contains "${client.name}"`);
      continue;
    }

    // Every distinctive word present, in any order — covers "PAYMENT FROM MULUKENA
    // ABERA" against "Abera Mulukena".
    const present = tokens.filter((t) => t.length >= 4 && norm.includes(t));
    if (tokens.length >= 2 && present.length === tokens.length) {
      consider(
        client.id,
        client.name,
        40,
        "high",
        `Narration contains every part of "${client.name}"`
      );
      continue;
    }
    // A single distinctive word is suggestive, never decisive.
    if (present.length === 1 && present[0].length >= 6) {
      consider(client.id, client.name, 15, "medium", `Narration mentions "${present[0]}"`);
    }
  }

  // --- 4. amount corroboration ---
  // Never promotes a line to a match by itself: hundreds of clients pay R299. It
  // strengthens a candidate that another signal already found, and only breaks a tie
  // when exactly one open invoice in the whole book has that value.
  const exact = openInvoices.filter(
    (i) => Math.abs(i.outstanding - line.amount) < 0.01
  );
  for (const invoice of exact) {
    const candidate = byClient.get(invoice.clientId);
    if (candidate) {
      candidate.score += 25;
      candidate.reasons.push(
        `Amount matches invoice ${invoice.invoiceNumber} exactly`
      );
      if (!candidate.invoiceId) {
        candidate.invoiceId = invoice.id;
        candidate.invoiceNumber = invoice.invoiceNumber;
      }
    }
  }
  if (!byClient.size && exact.length === 1) {
    const invoice = exact[0];
    const client = clientById.get(invoice.clientId);
    if (client) {
      consider(
        client.id,
        client.name,
        20,
        "medium",
        `Only one open invoice in the book is exactly this amount (${invoice.invoiceNumber})`,
        invoice
      );
    }
  }

  const ranked = [...byClient.values()].sort((a, b) => b.score - a.score);

  // A "high" that isn't clearly ahead of the runner-up is not high. Two clients whose
  // names both appear in one narration is precisely the case that must reach a human.
  if (ranked.length > 1 && isAutoPostable(ranked[0].confidence)) {
    const [first, second] = ranked;
    if (first.score - second.score < 20 && isAutoPostable(second.confidence)) {
      first.confidence = "medium";
      first.reasons.push(`Ambiguous — also matches ${second.clientName}`);
    }
  }

  return ranked.slice(0, limit);
}

/**
 * Spread a receipt across a client's open invoices, oldest first.
 *
 * Oldest-first is the convention every accounting package uses and the one clients
 * expect: money settles the debt that has been outstanding longest. Any remainder is
 * returned rather than forced onto an invoice — an overpayment is a credit on the
 * account, which is a real state the books must express.
 */
export function allocateOldestFirst(
  amount: number,
  invoices: OpenInvoice[]
): { allocations: { invoiceId: string; amount: number }[]; unallocated: number } {
  const ordered = [...invoices].sort((a, b) =>
    a.invoiceDate === b.invoiceDate
      ? a.invoiceNumber.localeCompare(b.invoiceNumber)
      : a.invoiceDate.localeCompare(b.invoiceDate)
  );

  const allocations: { invoiceId: string; amount: number }[] = [];
  let left = Math.round(amount * 100);

  for (const invoice of ordered) {
    if (left <= 0) break;
    const owing = Math.round(invoice.outstanding * 100);
    if (owing <= 0) continue;
    const take = Math.min(owing, left);
    allocations.push({ invoiceId: invoice.id, amount: take / 100 });
    left -= take;
  }

  return { allocations, unallocated: left / 100 };
}
