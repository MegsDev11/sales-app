"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/charts/primitives";
import { InvoiceDetail } from "@/components/commission/invoice-detail";
import { CatalogueDialog } from "@/components/commission/catalogue-dialog";
import { RatesDialog } from "@/components/commission/rates-dialog";
import { useCommission, type UploadOutcome } from "@/lib/commission/use-commission";
import {
  fmtMoney,
  needsReview,
  type CommissionLine,
  type CommissionResult,
  type LineFlag,
  type MarkupBasis,
} from "@/lib/commission/constants";
import {
  ArrowLeft,
  BookOpen,
  Calculator,
  FileUp,
  Loader2,
  Settings2,
  TriangleAlert,
} from "lucide-react";

/**
 * Commission calculator.
 *
 * Drop an invoice or quote PDF in, and it says who earns the commission and how much.
 *
 * This replaces a workbook where every line's margin was typed in by hand from a Sage
 * item listing. Two things about that process are deliberately not reproduced: margin
 * is taken from what the item actually sold for rather than from the catalogue price,
 * and anything the calculation cannot resolve is shown rather than silently treated
 * as zero.
 */
export default function CommissionPage() {
  const { can } = useAuth();
  const {
    invoices,
    catalogueImports,
    aliases,
    excludedCodes,
    rules,
    reps,
    isLoading,
    error,
    reload,
    post,
    upload,
    loadInvoice,
  } = useCommission();

  const inputRef = useRef<HTMLInputElement>(null);
  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [showRates, setShowRates] = useState(false);

  const isManager = can("crm", "manage");
  const hasCatalogue = catalogueImports.length > 0;

  const openInvoiceStatus = useMemo(() => {
    if (!outcome) return "draft" as const;
    return (invoices.find((i) => i.id === outcome.invoiceId)?.status ?? "draft") as
      | "draft"
      | "approved";
  }, [outcome, invoices]);

  const totals = useMemo(() => {
    const approved = invoices.filter((i) => i.status === "approved");
    return {
      draftCount: invoices.length - approved.length,
      approvedCount: approved.length,
      approvedValue: approved.reduce((sum, i) => sum + Number(i.commission ?? 0), 0),
      needsReview: invoices.reduce((sum, i) => sum + Number(i.review_count ?? 0), 0),
    };
  }, [invoices]);

  const pickInvoice = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploadError(null);
      setBusy(true);
      try {
        const body = (await upload("invoice", file)) as UploadOutcome;
        setOutcome(body);
        await reload();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Could not read that file");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [upload, reload]
  );

  /** Replace the open result's calculation after a server-side reprice. */
  const applyResult = useCallback(
    (result: CommissionResult | undefined) => {
      if (!result || !outcome) return;
      setOutcome({ ...outcome, result });
    },
    [outcome]
  );

  const reprice = useCallback(
    async (changes: { basis?: MarkupBasis; repId?: string | null }) => {
      if (!outcome) return;
      setBusy(true);
      setUploadError(null);
      try {
        const body = await post({ action: "reprice", id: outcome.invoiceId, ...changes });
        applyResult(body.result);
        await reload();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Reprice failed");
      } finally {
        setBusy(false);
      }
    },
    [outcome, post, reload, applyResult]
  );

  const addAlias = useCallback(
    async (invoiceCode: string, catalogueCode: string) => {
      if (!outcome) return;
      setBusy(true);
      setUploadError(null);
      try {
        const body = await post({
          action: "add_alias",
          invoiceCode,
          catalogueCode,
          repriceId: outcome.invoiceId,
        });
        applyResult(body.result);
        // The mapping saved, but an approved invoice can't be repriced under it.
        if (body.note) setUploadError(body.note);
        await reload();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Could not map that code");
      } finally {
        setBusy(false);
      }
    },
    [outcome, post, reload, applyResult]
  );

  /**
   * Reopen an imported invoice from its stored lines. Those figures were frozen when
   * the invoice was priced, so this shows exactly what was approved rather than
   * re-deriving it against today's price list.
   */
  const openInvoice = useCallback(
    async (id: string) => {
      setBusy(true);
      setUploadError(null);
      try {
        const { invoice, lines } = await loadInvoice(id);
        const mapped: CommissionLine[] = lines.map((row, index) => {
          const num = (key: string) =>
            row[key] === null || row[key] === undefined ? null : Number(row[key]);
          return {
            lineIndex: Number(row.line_index ?? index),
            code: String(row.code ?? ""),
            description: String(row.description ?? ""),
            qty: Number(row.qty ?? 0),
            unitPrice: Number(row.unit_price ?? 0),
            discountPct: Number(row.discount_pct ?? 0),
            vatPct: 15,
            exclTotal: Number(row.excl_total ?? 0),
            inclTotal: 0,
            matchedCode: (row.matched_code as string | null) ?? null,
            suggestedCode: null,
            avgCost: num("avg_cost"),
            catalogueGpUnit: num("catalogue_gp_unit"),
            netUnitPrice: Number(row.net_unit_price ?? 0),
            catalogueMarkup: num("catalogue_markup"),
            asInvoicedMarkup: num("as_invoiced_markup"),
            commissionableMarkup: num("commissionable_markup"),
            commission: Number(row.commission ?? 0),
            excluded: !!row.is_excluded,
            flags: (row.flags as LineFlag[] | null) ?? [],
          };
        });

        const commission = Number(invoice.commission);
        const other =
          invoice.basis === "catalogue"
            ? Number(invoice.as_invoiced_commission)
            : Number(invoice.catalogue_commission);

        setOutcome({
          invoiceId: invoice.id,
          parsed: {
            invoiceNumber: invoice.invoice_number,
            invoiceDate: invoice.invoice_date,
            reference: "",
            clientName: invoice.client_name,
            installerName: invoice.installer_name,
            lines: mapped,
            statedExclTotal: invoice.stated_excl_total ?? null,
            parsedExclTotal: Number(invoice.revenue_excl),
            reconciles: !!invoice.reconciled,
          },
          result: {
            basis: invoice.basis,
            installRate: Number(invoice.install_rate),
            lines: mapped,
            totals: {
              revenueExcl: Number(invoice.revenue_excl),
              catalogueMarkup: Number(invoice.catalogue_markup),
              asInvoicedMarkup: Number(invoice.as_invoiced_markup),
              catalogueCommission: Number(invoice.catalogue_commission),
              asInvoicedCommission: Number(invoice.as_invoiced_commission),
              commission,
              variance: Math.round((commission - other) * 100) / 100,
            },
            needsReview: mapped.filter((line) => needsReview(line.flags)),
          },
          // Attribution already settled when it was imported; show the stored rep.
          match: null,
          savedRepId: invoice.rep_id,
        });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Could not open that invoice");
      } finally {
        setBusy(false);
      }
    },
    [loadInvoice]
  );

  const invoiceAction = useCallback(
    async (action: "approve" | "reopen" | "delete_invoice") => {
      if (!outcome) return;
      setBusy(true);
      setUploadError(null);
      try {
        await post({ action, id: outcome.invoiceId });
        await reload();
        if (action === "delete_invoice") setOutcome(null);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setBusy(false);
      }
    },
    [outcome, post, reload]
  );

  if (!isManager) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Sales"
          title="Commission"
          description="Work out what a quote or invoice earns."
        />
        <AlertBanner tone="danger">
          Commission is pay data, so it needs sales management access.
        </AlertBanner>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Sales"
        title="Commission calculator"
        description="Import a quote or invoice. It prices every line against the Sage price list and tells you who earns what."
        meta={
          hasCatalogue ? (
            <span>
              Price list from {catalogueImports[0].effective_from} ·{" "}
              {catalogueImports[0].item_count} items
            </span>
          ) : (
            <span className="text-destructive">No price list imported yet</span>
          )
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowCatalogue(true)}>
              <BookOpen />
              Price lists
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowRates(true)}>
              <Settings2 />
              Settings
            </Button>
            <Button
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy || !hasCatalogue}
              title={hasCatalogue ? undefined : "Import a price list first"}
            >
              {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
              Import invoice
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => void pickInvoice(e.target.files?.[0])}
            />
          </>
        }
      />

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}
      {uploadError ? <AlertBanner tone="danger">{uploadError}</AlertBanner> : null}

      {!hasCatalogue && !isLoading ? (
        <AlertBanner tone="warn">
          Import the Sage Item Listing Report before pricing anything — margin comes
          from its GP Amount column.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => setShowCatalogue(true)}
          >
            Import one now
          </button>
        </AlertBanner>
      ) : null}

      {outcome ? (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOutcome(null)}>
              <ArrowLeft />
              All invoices
            </Button>
            <span className="text-sm text-muted-foreground">
              {outcome.parsed.invoiceNumber} · {outcome.parsed.clientName}
              {outcome.parsed.invoiceDate ? ` · ${outcome.parsed.invoiceDate}` : ""}
            </span>
          </div>
          {outcome.catalogueWarning ? (
            <AlertBanner tone="warn">{outcome.catalogueWarning}</AlertBanner>
          ) : null}
          <InvoiceDetail
            key={outcome.invoiceId}
            outcome={outcome}
            reps={reps}
            status={openInvoiceStatus}
            busy={busy}
            onReprice={reprice}
            onAlias={addAlias}
            onApprove={() => invoiceAction("approve")}
            onReopen={() => invoiceAction("reopen")}
            onDelete={() => invoiceAction("delete_invoice")}
          />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Approved commission"
              value={totals.approvedValue}
              currency
              raw={fmtMoney(totals.approvedValue)}
              icon={Calculator}
            />
            <StatTile label="Approved invoices" value={totals.approvedCount} />
            <StatTile label="Drafts" value={totals.draftCount} />
            <StatTile
              label="Lines needing review"
              value={totals.needsReview}
              icon={TriangleAlert}
              higherIsBetter={false}
              status={totals.needsReview > 0 ? "warning" : "good"}
            />
          </div>

          <Panel
            padded={false}
            title="Priced invoices"
            description={
              isLoading ? "Loading…" : `${invoices.length} imported`
            }
          >
            {invoices.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Nothing imported yet. Drop a quote or invoice PDF in to get started.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Invoice</th>
                      <th className="px-3 py-2 font-semibold">Client</th>
                      <th className="px-3 py-2 font-semibold">Earned by</th>
                      <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                      <th className="px-3 py-2 text-right font-semibold">Commission</th>
                      <th className="px-4 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => {
                      const rep = reps.find((r) => r.id === invoice.rep_id);
                      return (
                        <tr
                          key={invoice.id}
                          className="cursor-pointer border-b border-hairline/60 last:border-0 hover:bg-muted/40"
                          onClick={() => void openInvoice(invoice.id)}
                        >
                          <td className="px-4 py-2">
                            <span className="font-medium text-foreground">
                              {invoice.invoice_number}
                            </span>
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {invoice.ref}
                            </span>
                          </td>
                          <td className="max-w-[14rem] truncate px-3 py-2 text-muted-foreground">
                            {invoice.client_name}
                          </td>
                          <td className="px-3 py-2">
                            {rep ? (
                              rep.name
                            ) : (
                              <span className="text-destructive">Unassigned</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {fmtMoney(Number(invoice.revenue_excl))}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {fmtMoney(Number(invoice.commission))}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={
                                  invoice.status === "approved" ? "default" : "secondary"
                                }
                              >
                                {invoice.status === "approved" ? "Approved" : "Draft"}
                              </Badge>
                              {Number(invoice.review_count) > 0 ? (
                                <Badge variant="destructive">
                                  {invoice.review_count} to review
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      <CatalogueDialog
        open={showCatalogue}
        onClose={() => setShowCatalogue(false)}
        onImported={reload}
        imports={catalogueImports}
        upload={upload}
        post={post}
      />
      <RatesDialog
        open={showRates}
        onClose={() => setShowRates(false)}
        onSaved={reload}
        rules={rules}
        reps={reps}
        aliases={aliases}
        excludedCodes={excludedCodes}
        post={post}
      />
    </PageShell>
  );
}
