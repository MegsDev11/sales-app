"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertBanner } from "@/components/layout/page-shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import {
  MARKUP_BASES,
  type CommissionRule,
  type MarkupBasis,
} from "@/lib/commission/constants";
import type { AliasRow, ExcludedRow, RepRow } from "@/lib/commission/use-commission";

/**
 * Rates, targets, non-commissionable codes and code mappings.
 *
 * Rules are effective-dated and a rep's own rule overrides the company default, so
 * changing a target next month cannot restate a month already approved.
 *
 * Laid out as a table rather than a stack of labelled field groups: five fields per
 * rule repeated per rep is unreadable when every one carries its own caption, and the
 * columns only need naming once.
 */
export function RatesDialog({
  open,
  onClose,
  onSaved,
  rules,
  reps,
  aliases,
  excludedCodes,
  post,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  rules: CommissionRule[];
  reps: RepRow[];
  aliases: AliasRow[];
  excludedCodes: ExcludedRow[];
  post: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(false);

  const repNames = useMemo(
    () => new Map(reps.map((rep) => [rep.id, rep.name])),
    [reps]
  );

  const run = async (payload: Record<string, unknown>) => {
    setError(null);
    setIsBusy(true);
    try {
      await post(payload);
      onSaved();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* The base DialogContent pins width at sm:max-w-sm, so the override has to
          carry the same breakpoint prefix to win. */}
      <DialogContent className="max-h-[88vh] overflow-y-auto bg-white sm:max-w-[64rem]">
        <DialogHeader>
          <DialogTitle>Commission settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-7">
          {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

          {/* ---------- rates ---------- */}
          <section className="space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-foreground">
                  Rates and targets
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  A rule naming a rep overrides the company default. Monthly target and
                  fixed monthly belong to the recurring half of commission — they don&rsquo;t
                  affect what an invoice earns.
                </p>
              </div>
              {!showDraft ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDraft(true)}
                  disabled={isBusy}
                >
                  <Plus />
                  Add rule
                </Button>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-muted/40 text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Applies to</th>
                    <th className="w-[6.5rem] px-3 py-2 text-right font-semibold">Rate %</th>
                    <th className="w-[9rem] px-3 py-2 text-right font-semibold">
                      Monthly target
                    </th>
                    <th className="w-[9rem] px-3 py-2 text-right font-semibold">
                      Fixed monthly
                    </th>
                    <th className="w-[11rem] px-3 py-2 font-semibold">Default basis</th>
                    <th className="w-[5.5rem] px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <RuleRow
                      key={rule.id}
                      rule={rule}
                      reps={reps}
                      repNames={repNames}
                      busy={isBusy}
                      onSave={(next) => run({ action: "save_rule", ...next })}
                    />
                  ))}
                  {showDraft ? (
                    <RuleRow
                      key="draft"
                      rule={null}
                      reps={reps}
                      repNames={repNames}
                      busy={isBusy}
                      onCancel={() => setShowDraft(false)}
                      onSave={async (next) => {
                        const ok = await run({ action: "save_rule", ...next });
                        if (ok) setShowDraft(false);
                        return ok;
                      }}
                    />
                  ) : null}
                  {rules.length === 0 && !showDraft ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        No rules yet — add one to set the rate.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- codes ---------- */}
          <div className="grid gap-7 lg:grid-cols-2">
            <section className="space-y-2.5">
              <div>
                <h3 className="text-[13px] font-semibold text-foreground">
                  Codes that never earn commission
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Time, travel and consumables carry no product margin.
                </p>
              </div>
              <CodeList
                items={excludedCodes.map((row) => ({
                  key: row.code,
                  label: row.code,
                  hint: row.reason,
                }))}
                placeholder="e.g. CALLOUT"
                busy={isBusy}
                onAdd={(code) => run({ action: "set_excluded", code })}
                onRemove={(code) => run({ action: "remove_excluded", code })}
              />
            </section>

            <section className="space-y-2.5">
              <div>
                <h3 className="text-[13px] font-semibold text-foreground">Code mappings</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Where an invoice and the price list name the same product differently.
                  Usually added straight from a flagged line.
                </p>
              </div>
              {aliases.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {aliases.map((alias) => (
                    <li key={alias.id}>
                      <Badge variant="outline" className="gap-1.5" title={alias.note}>
                        {alias.invoice_code} → {alias.catalogue_code}
                        <button
                          type="button"
                          aria-label={`Remove mapping ${alias.invoice_code}`}
                          className="text-muted-foreground hover:text-destructive"
                          disabled={isBusy}
                          onClick={() => void run({ action: "remove_alias", id: alias.id })}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  reps,
  repNames,
  busy,
  onSave,
  onCancel,
}: {
  rule: CommissionRule | null;
  reps: RepRow[];
  repNames: Map<string, string>;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [repId, setRepId] = useState(rule?.rep_id ?? "");
  const [rate, setRate] = useState(String(((rule?.install_rate ?? 0.1) * 100).toFixed(2)));
  const [threshold, setThreshold] = useState(String(rule?.monthly_threshold ?? 0));
  const [addition, setAddition] = useState(String(rule?.fixed_addition ?? 0));
  const [basis, setBasis] = useState<MarkupBasis>(rule?.markup_basis ?? "as_invoiced");

  const isNew = !rule;
  const numberCell = "h-8 w-full text-right tabular-nums";

  return (
    <tr className="border-b border-hairline/60 last:border-0 align-middle">
      <td className="px-3 py-2">
        <Select value={repId} onValueChange={(v) => setRepId(String(v ?? ""))}>
          <SelectTrigger className="w-full">
            {/* base-ui renders the raw value unless given a formatter, which would
                print a team_members UUID here. */}
            <SelectValue placeholder="Company default">
              {(value) =>
                value ? (repNames.get(String(value)) ?? String(value)) : "Company default"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {reps.map((rep) => (
              <SelectItem key={rep.id} value={rep.id}>
                {rep.name}
                {rep.title ? ` — ${rep.title}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rule ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground" title={rule.note}>
            from {rule.effective_from}
            {rule.note ? ` · ${rule.note}` : ""}
          </p>
        ) : null}
      </td>

      <td className="px-3 py-2">
        <Input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          inputMode="decimal"
          className={numberCell}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          inputMode="decimal"
          className={numberCell}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={addition}
          onChange={(e) => setAddition(e.target.value)}
          inputMode="decimal"
          className={numberCell}
        />
      </td>

      <td className="px-3 py-2">
        <Select value={basis} onValueChange={(v) => setBasis(String(v) as MarkupBasis)}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value) =>
                MARKUP_BASES.find((b) => b.value === value)?.label ?? String(value)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MARKUP_BASES.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant={isNew ? "default" : "outline"}
            disabled={busy}
            onClick={() =>
              void onSave({
                id: rule?.id,
                repId: repId || null,
                installRate: (Number(rate) || 0) / 100,
                monthlyThreshold: Number(threshold) || 0,
                fixedAddition: Number(addition) || 0,
                markupBasis: basis,
                effectiveFrom: rule?.effective_from,
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {isNew ? "Add" : "Save"}
          </Button>
          {onCancel ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Discard new rule"
              disabled={busy}
              onClick={onCancel}
            >
              <X />
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function CodeList({
  items,
  placeholder,
  busy,
  onAdd,
  onRemove,
}: {
  items: { key: string; label: string; hint?: string }[];
  placeholder: string;
  busy: boolean;
  onAdd: (code: string) => Promise<boolean>;
  onRemove: (code: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li key={item.key}>
              <Badge variant="secondary" className="gap-1.5" title={item.hint}>
                {item.label}
                <button
                  type="button"
                  aria-label={`Remove ${item.label}`}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => void onRemove(item.key)}
                >
                  <Trash2 className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-8 w-48"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !draft.trim()}
          onClick={async () => {
            if (await onAdd(draft.trim())) setDraft("");
          }}
        >
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}
