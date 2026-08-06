/**
 * Works out which CRM lead an invoice belongs to, so commission can be attributed to
 * that lead's owner.
 *
 * Attribution deliberately does NOT use the `SALES REP:` printed on the invoice —
 * that field names whoever did the install. The commission follows the client
 * relationship, which is what the old workbook encoded by filing each client under a
 * rep's own sheet.
 *
 * Sage prints party names in capitals and often surname-first ("HOEFLING JOHN"),
 * while the CRM stores "John Hoefling", so matching has to survive word order.
 * Nothing here auto-commits: the caller shows the match and a human confirms it.
 */

export interface MatchableLead {
  id: string;
  clientName: string;
  company: string | null;
  assignedToId: string | null;
}

export interface ClientMatch {
  lead: MatchableLead;
  /** Which field matched, for display. */
  field: "company" | "client";
  /** 0–100. Anything below MIN_CONFIDENCE is discarded. */
  confidence: number;
  reason: string;
}

const MIN_CONFIDENCE = 60;

/** Company suffixes carry no identifying information and differ between systems. */
const NOISE = new Set([
  "PTY",
  "LTD",
  "PTY LTD",
  "EDMS",
  "BPK",
  "CC",
  "INC",
  "THE",
  "AND",
  "T/A",
]);

function normalise(value: string) {
  return value
    .toUpperCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalise(value)
    .split(" ")
    .filter((token) => token.length > 2 && !NOISE.has(token));
}

function score(invoiceName: string, candidate: string): { value: number; reason: string } | null {
  const a = normalise(invoiceName);
  const b = normalise(candidate);
  if (!a || !b) return null;

  if (a === b) return { value: 100, reason: "exact name match" };

  const aTokens = tokens(invoiceName);
  const bTokens = tokens(candidate);
  if (aTokens.length === 0 || bTokens.length === 0) return null;

  // "HOEFLING JOHN" vs "John Hoefling" — same words, different order.
  const aSorted = [...aTokens].sort().join(" ");
  const bSorted = [...bTokens].sort().join(" ");
  if (aSorted === bSorted) return { value: 95, reason: "same name, different word order" };

  const bSet = new Set(bTokens);
  const shared = aTokens.filter((token) => bSet.has(token));

  if (shared.length === aTokens.length) {
    return { value: 85, reason: `invoice name is contained in "${candidate}"` };
  }
  const aSet = new Set(aTokens);
  if (bTokens.every((token) => aSet.has(token))) {
    return { value: 80, reason: `"${candidate}" is contained in the invoice name` };
  }
  if (shared.length >= 2) {
    return { value: 70, reason: `shares ${shared.join(", ")}` };
  }
  // A single distinctive word is weak but often right for company names.
  if (shared.length === 1 && shared[0].length >= 5) {
    return { value: 60, reason: `shares "${shared[0]}"` };
  }
  return null;
}

/** Best lead for this invoice client, or null if nothing is convincing enough. */
export function matchClientToLead(
  invoiceClientName: string,
  leads: MatchableLead[]
): ClientMatch | null {
  let best: ClientMatch | null = null;

  for (const lead of leads) {
    const candidates: { field: ClientMatch["field"]; text: string }[] = [];
    if (lead.company) candidates.push({ field: "company", text: lead.company });
    if (lead.clientName) candidates.push({ field: "client", text: lead.clientName });

    for (const candidate of candidates) {
      const result = score(invoiceClientName, candidate.text);
      if (!result || result.value < MIN_CONFIDENCE) continue;
      // Prefer the stronger score; on a tie prefer a lead that has an owner, since an
      // unassigned lead can't attribute anything.
      const better =
        !best ||
        result.value > best.confidence ||
        (result.value === best.confidence && !best.lead.assignedToId && !!lead.assignedToId);
      if (better) {
        best = { lead, field: candidate.field, confidence: result.value, reason: result.reason };
      }
    }
  }

  return best;
}
