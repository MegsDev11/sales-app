"use client";

import { useState } from "react";
import { Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  LockOpen,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  FLAG_LABELS,
  MARKUP_BASES,
  fmtMoney,
  type CommissionLine,
  type MarkupBasis,
} from "@/lib/commission/constants";
import type { RepRow, UploadOutcome } from "@/lib/commission/use-commission";

/**
 * The answer screen: who earns this invoice and how much.
 *
 * Structure follows the question the user actually asked — the earner and the amount
 * come first at display size, the working is underneath, and anything the calculation
 * could not resolve is called out rather than buried in a table of zeros.
 */
export function InvoiceDetail({
  outcome,
  reps,
  status,
  onReprice,
  onAlias,
  onApprove,
  onReopen,
  onDelete,
  busy,
}: {
  outcome: UploadOutcome;
  reps: RepRow[];
  status: "draft" | "approved";
  onReprice: (changes: { basis?: MarkupBasis; repId?: string | null }) => Promise<void>;
  onAlias: (invoiceCode: string, catalogueCode: string) => Promise<void>;
  onApprove: () => Promise<void>;
  onReopen: () => Promise<void>;
  onDelete: () => Promise<void>;
  busy: boolean;
}) {
  const { parsed, result, match } = outcome;
  const [showAll, setShowAll] = useState(false);
  const locked = status === "approved";

  // A saved invoice already has an earner; a fresh import only has the client match.
  // Mounted with key={invoiceId} by the page, so this initial value is never stale.
  const [selectedRep, setSelectedRep] = useState<string>(
    outcome.savedRepId ?? match?.repId ?? ""
  );

  const rep = reps.find((r) => r.id === selectedRep);
  const otherBasis: MarkupBasis =
    result.basis === "catalogue" ? "as_invoiced" : "catalogue";
  const otherCommission =
    result.basis === "catalogue"
      ? result.totals.asInvoicedCommission
      : result.totals.catalogueCommission;

  const visibleLines = showAll
    ? result.lines
    : result.lines.filter((line) => !line.excluded);

  return (
    <div className="space-y-4">
      {/* ---------- headline ---------- */}
      <Panel padded={false}>
        <div className="grid gap-px bg-hairline sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="bg-surface-elevated p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Commission earned by
            </p>
            {locked ? (
              <p className="mt-2 text-lg font-semibold text-foreground">
                {rep?.name ?? "Nobody assigned"}
              </p>
            ) : (
              <div className="mt-2">
                <Select
                  value={selectedRep}
                  onValueChange={(value) => {
                    const next = String(value ?? "");
                    setSelectedRep(next);
                    void onReprice({ repId: next || null });
                  }}
                >
                  <SelectTrigger className="w-full">
                    {/* base-ui prints the raw value unless given a formatter, which
                        would show a team_members UUID instead of a name. */}
                    <SelectValue placeholder="Choose who earns this…">
                      {(value) =>
                        value
                          ? (reps.find((r) => r.id === String(value))?.name ?? String(value))
                          : "Choose who earns this…"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {reps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                        {r.title ? ` — ${r.title}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {match ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Matched client <span className="font-medium text-foreground">{match.leadName}</span>{" "}
                ({match.confidence}% — {match.reason})
                {match.repId ? " and used that lead's owner." : ", which has no owner yet."}
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                No CRM client matched &ldquo;{parsed.clientName}&rdquo; — pick the earner yourself.
              </p>
            )}

            {parsed.installerName ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Installed by {parsed.installerName} — not used in this calculation.
              </p>
            ) : null}
          </div>

          <div className="bg-surface-elevated p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Commission payable
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.02em] text-foreground">
              {fmtMoney(result.totals.commission)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(result.installRate * 100).toFixed(1)}% of{" "}
              {fmtMoney(
                result.basis === "catalogue"
                  ? result.totals.catalogueMarkup
                  : result.totals.asInvoicedMarkup
              )}{" "}
              margin
            </p>
          </div>

          <div className="bg-surface-elevated p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Basis
            </p>
            <div className="mt-2">
              {locked ? (
                <p className="text-sm font-medium text-foreground">
                  {MARKUP_BASES.find((b) => b.value === result.basis)?.label}
                </p>
              ) : (
                <Select
                  value={result.basis}
                  onValueChange={(value) =>
                    void onReprice({ basis: String(value) as MarkupBasis })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value) =>
                        MARKUP_BASES.find((b) => b.value === value)?.label ?? String(value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MARKUP_BASES.map((basis) => (
                      <SelectItem key={basis.value} value={basis.value}>
                        {basis.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {MARKUP_BASES.find((b) => b.value === otherBasis)?.label} would pay{" "}
              <span className="font-medium text-foreground">{fmtMoney(otherCommission)}</span>
              {Math.abs(result.totals.variance) >= 0.01 ? (
                <>
                  {" "}
                  — a {fmtMoney(Math.abs(result.totals.variance))}{" "}
                  {result.totals.variance > 0 ? "saving" : "shortfall"} against this one.
                </>
              ) : (
                " — the same."
              )}
            </p>
          </div>
        </div>
      </Panel>

      {/* ---------- needs review ---------- */}
      {result.needsReview.length > 0 ? (
        <Panel
          title={`${result.needsReview.length} line${result.needsReview.length === 1 ? "" : "s"} need a look`}
          description="These earn nothing, or earn the wrong thing, until they're resolved."
        >
          <ul className="space-y-2">
            {result.needsReview.map((line) => (
              <ReviewRow
                key={line.lineIndex}
                line={line}
                locked={locked}
                busy={busy}
                onAlias={onAlias}
              />
            ))}
          </ul>
        </Panel>
      ) : (
        <AlertBanner tone="info">
          Every line priced cleanly against the catalogue.
        </AlertBanner>
      )}

      {/* ---------- lines ---------- */}
      <Panel
        padded={false}
        title="Working"
        description={`${parsed.lines.length} lines, ${fmtMoney(result.totals.revenueExcl)} excl VAT`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? <ChevronUp /> : <ChevronDown />}
            {showAll ? "Hide non-earning lines" : "Show all lines"}
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                <th className="px-4 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Sold @</th>
                <th className="px-3 py-2 text-right font-semibold">Cost</th>
                <th className="px-3 py-2 text-right font-semibold">GP Amount</th>
                <th className="px-3 py-2 text-right font-semibold">As invoiced</th>
                <th className="px-4 py-2 text-right font-semibold">Commission</th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.map((line) => (
                <tr
                  key={line.lineIndex}
                  className="border-b border-hairline/60 last:border-0"
                >
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-foreground">{line.code}</span>
                      {line.matchedCode && line.matchedCode !== line.code ? (
                        <Badge variant="outline" className="gap-1">
                          <Link2 />
                          {line.matchedCode}
                        </Badge>
                      ) : null}
                      {line.excluded ? (
                        <Badge variant="secondary">Not commissionable</Badge>
                      ) : null}
                      {line.flags.map((flag) => (
                        <Badge
                          key={flag}
                          variant={flag === "off_list_price" ? "outline" : "destructive"}
                        >
                          {FLAG_LABELS[flag]}
                        </Badge>
                      ))}
                    </div>
                    {line.description ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {line.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {line.qty}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(line.netUnitPrice)}
                    {line.discountPct > 0 ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        −{line.discountPct}%
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {line.avgCost === null ? "—" : fmtMoney(line.avgCost)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      result.basis === "catalogue"
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {line.catalogueMarkup === null ? "—" : fmtMoney(line.catalogueMarkup)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      result.basis === "as_invoiced"
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {line.asInvoicedMarkup === null ? "—" : fmtMoney(line.asInvoicedMarkup)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {line.commission === 0 ? "—" : fmtMoney(line.commission)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className="px-4 py-2.5" colSpan={4}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtMoney(result.totals.catalogueMarkup)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {fmtMoney(result.totals.asInvoicedMarkup)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {fmtMoney(result.totals.commission)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {/* ---------- actions ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        {locked ? (
          <>
            <Badge variant="default" className="gap-1">
              <CheckCircle2 />
              Approved
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void onReopen()} disabled={busy}>
              <LockOpen />
              Reopen
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => void onApprove()}
              disabled={busy || !selectedRep}
              title={selectedRep ? undefined : "Choose who earns this first"}
            >
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              Approve {fmtMoney(result.totals.commission)}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void onDelete()}
              disabled={busy}
            >
              <Trash2 />
              Discard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** One flagged line, with a one-click fix when the fix is a code mapping. */
function ReviewRow({
  line,
  locked,
  busy,
  onAlias,
}: {
  line: CommissionLine;
  locked: boolean;
  busy: boolean;
  onAlias: (invoiceCode: string, catalogueCode: string) => Promise<void>;
}) {
  const [target, setTarget] = useState(line.suggestedCode ?? "");
  const canMap = line.flags.includes("unmatched_code") && !locked;

  return (
    <li className="rounded-lg border border-hairline bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <TriangleAlert className="size-3.5 text-amber-500" aria-hidden />
            <span className="font-medium text-foreground">{line.code}</span>
            {line.flags.map((flag) => (
              <Badge key={flag} variant="destructive">
                {FLAG_LABELS[flag]}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {explain(line)}
          </p>
        </div>

        {canMap ? (
          <div className="flex shrink-0 items-center gap-2">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Price list code"
              className="h-7 w-40 text-xs"
            />
            <Button
              size="xs"
              variant="outline"
              disabled={busy || !target.trim()}
              onClick={() => void onAlias(line.code, target.trim())}
            >
              <Link2 />
              Map
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function explain(line: CommissionLine): string {
  if (line.flags.includes("unmatched_code")) {
    return line.suggestedCode
      ? `Not in the price list. "${line.suggestedCode}" has a matching description — map it to earn on this line.`
      : "Not in the price list, so it earns nothing. Map it to a price list code.";
  }
  if (line.flags.includes("stale_catalogue")) {
    return (
      `Sold at ${fmtMoney(line.netUnitPrice)}, but the price list records a GP Amount of ` +
      `${fmtMoney(line.catalogueGpUnit ?? 0)} for ${line.matchedCode} — that row needs ` +
      `re-pricing in Sage. The as-invoiced basis works around it; the GP Amount basis ` +
      `would carry the bad figure through to the payout.`
    );
  }
  if (line.flags.includes("below_cost")) {
    return `Sold at ${fmtMoney(line.netUnitPrice)} against a ${fmtMoney(
      line.avgCost ?? 0
    )} cost — this line loses money.`;
  }
  return "Worth a second look.";
}
