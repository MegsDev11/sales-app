"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertBanner } from "@/components/layout/page-shell";
import { Loader2, Upload } from "lucide-react";
import type { CatalogueImportRow } from "@/lib/commission/use-commission";

/**
 * Imports the Sage "Item Listing Report" as a price list snapshot.
 *
 * The spreadsheet export is used rather than the PDF: it is the same data, and a
 * ~1,200-row table is far more reliably read from a sheet than from a paginated PDF.
 *
 * Every import is kept as its own snapshot with an effective date, so an invoice is
 * always priced against the list that was live when it was raised. Re-importing next
 * month therefore cannot restate a month already approved.
 */
export function CatalogueDialog({
  open,
  onClose,
  onImported,
  imports,
  upload,
  post,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  imports: CatalogueImportRow[];
  upload: (
    kind: "catalogue",
    file: File,
    extra?: Record<string, string>
  ) => Promise<Record<string, unknown>>;
  post: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string[] | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSummary(null);
    setIsBusy(true);
    try {
      const body = (await upload("catalogue", file, { effectiveFrom })) as {
        itemCount: number;
        zeroPriceCount: number;
        nonPositiveGpCount: number;
        repairedCount: number;
        skippedCodes: string[];
        gpDerived: boolean;
        sheetName: string;
      };

      // Anything the importer had to work around is stated, never glossed over —
      // these are the numbers commission is calculated from.
      const facts = [`Loaded ${body.itemCount} items from “${body.sheetName}”.`];
      if (body.gpDerived) {
        facts.push(
          "This export has no GP column, so margin was worked out as price − average cost — the same way Sage derives it."
        );
      }
      if (body.repairedCount > 0) {
        facts.push(
          `${body.repairedCount} rows had unquoted commas in the description, which split them across extra columns. Those were realigned.`
        );
      }
      if (body.skippedCodes.length > 0) {
        facts.push(
          `${body.skippedCodes.length} rows were skipped because their price or cost wasn't a number: ${body.skippedCodes
            .slice(0, 6)
            .join(", ")}${body.skippedCodes.length > 6 ? "…" : ""}.`
        );
      }
      facts.push(
        `${body.zeroPriceCount} have no list price and ${body.nonPositiveGpCount} have a margin of zero or less — those flag on any invoice that uses them.`
      );
      setSummary(facts);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    setError(null);
    setIsBusy(true);
    try {
      await post({ action: "delete_catalogue_import", id });
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      {/* The `sm:` prefix is required: the base DialogContent pins sm:max-w-sm. */}
      <DialogContent className="max-h-[88vh] overflow-y-auto bg-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Price lists</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Export the Item Listing Report from Sage as Excel or CSV and drop it here.
            Commission margin comes from its <strong>GP Amount</strong> column.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Prices effective from
              </span>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="w-40"
              />
            </label>
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={isBusy}
              variant="outline"
            >
              {isBusy ? <Loader2 className="animate-spin" /> : <Upload />}
              Choose file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              className="hidden"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </div>

          {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
          {summary ? (
            <AlertBanner tone="info">
              <ul className="space-y-1">
                {summary.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </AlertBanner>
          ) : null}

          {/* overflow-x-auto, not overflow-hidden: five columns do not fit a narrow
              dialog, and hidden simply cut the last one — the delete button — off
              with no way to reach it. */}
          {imports.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-muted/40 text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Effective</th>
                    <th className="px-3 py-2 font-semibold">File</th>
                    <th className="px-3 py-2 text-right font-semibold">Items</th>
                    <th className="px-3 py-2 text-right font-semibold">Suspect</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {imports.map((row) => (
                    <tr key={row.id} className="border-b border-hairline/60 last:border-0">
                      <td className="px-3 py-2 tabular-nums">{row.effective_from}</td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-muted-foreground">
                        {row.source_filename}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.item_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.zero_price_count + row.non_positive_gp_count}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={isBusy}
                          onClick={() => void remove(row.id)}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <AlertBanner tone="warn">
              No price list imported yet. Invoices can&rsquo;t be priced until one is.
            </AlertBanner>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
