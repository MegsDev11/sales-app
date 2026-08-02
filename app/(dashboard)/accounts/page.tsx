"use client";

import { useCallback, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader, PageShell, Panel, AlertBanner } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientImportDialog } from "@/components/accounts/client-import-dialog";
import { ClientEditDialog } from "@/components/accounts/client-edit-dialog";
import { SendInvoiceDialog } from "@/components/accounts/send-invoice-dialog";
import { ACCOUNTS_OWNERS } from "@/lib/accounts/parse-clients";
import {
  BILLING_STATUSES,
  PAYMENT_METHODS,
  isBillable,
  paymentLabel,
  statusLabel,
  type BillingStatus,
  type ClientRecord,
  type PaymentMethod,
} from "@/lib/accounts/constants";
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  useClients,
  type ClientFilters,
} from "@/lib/accounts/use-clients";
import {
  invoiceBlockedReason,
  useClientDocuments,
} from "@/lib/accounts/use-client-documents";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  Phone,
  Receipt,
  Search,
  Send,
  Upload,
  Users,
} from "lucide-react";

/**
 * The Accounts client book.
 *
 * This is the department's answer to "who are our clients, what do they pay, and who
 * looks after them" — the list that used to exist only as a Sage export.
 *
 * The page is built around one number that matters more than the rest: how many
 * clients are actually ready to be invoiced. A client is only ready when they are
 * Active, have a deliverable email address, and have a monthly price we can read.
 * Everything else on the page exists to close the gap between the total and that
 * number, which is why the filter bar leads with the review queue rather than hiding
 * it behind a tab.
 */

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

const DEBIT_DAYS = ["1", "8", "20"];

export default function AccountsPage() {
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [sendingTo, setSendingTo] = useState<ClientRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const { clients, total, facets, canEdit, isLoading, error, reload, post } = useClients(
    filters,
    offset
  );
  const {
    openDocument,
    isBusy: docBusy,
    error: docError,
    clearError: clearDocError,
  } = useClientDocuments();

  // Filters reset paging AND the selection: page 4 of "all clients" is not page 4 of
  // "needs review", and a selection made under one filter must not silently survive
  // into another where the user can no longer see what they are about to change.
  const setFilter = useCallback(<K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOffset(0);
    setSelected(new Set());
  }, []);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allOnPageSelected = clients.length > 0 && clients.every((c) => selected.has(c.id));

  const togglePage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const every = clients.length > 0 && clients.every((c) => next.has(c.id));
      for (const c of clients) {
        if (every) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }, [clients]);

  /** Apply a status and/or payment method to the current selection. */
  const bulkSet = useCallback(
    async (patch: { billingStatus?: BillingStatus; paymentMethod?: PaymentMethod }) => {
      if (!selected.size) return;
      setBulkBusy(true);
      try {
        await post({ action: "bulk_status", ids: [...selected], ...patch });
        setSelected(new Set());
        await reload();
      } finally {
        setBulkBusy(false);
      }
    },
    [selected, post, reload]
  );

  const applySearch = useCallback(() => {
    setFilter("q", search);
  }, [search, setFilter]);

  const empty = !isLoading && clients.length === 0;
  const filtered =
    !!filters.q.trim() ||
    filters.status !== "all" ||
    filters.owner !== "all" ||
    filters.debitDay !== "all" ||
    filters.review;
  // "No clients yet" is only true when the book is empty AND nothing is filtering it.
  // The facet counts arrive on their own request, so keying this off `facets.total`
  // alone would flash the first-run empty state over a book that is merely still
  // counting itself.
  const neverImported = empty && !filtered && facets.total === 0;

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeCount = facets.byStatus.active ?? 0;
  const notReady = Math.max(0, activeCount - facets.readyToInvoice);

  const statusOptions = useMemo(
    () => BILLING_STATUSES.filter((s) => (facets.byStatus[s.value] ?? 0) > 0),
    [facets.byStatus]
  );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Accounts"
        title="Client book"
        description="Every MEGS client, who owns the relationship, and what they pay each month."
        meta={
          facets.total ? (
            <>
              <span>
                <span className="font-medium text-foreground">
                  {facets.total.toLocaleString("en-ZA")}
                </span>{" "}
                clients
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {activeCount.toLocaleString("en-ZA")}
                </span>{" "}
                active
              </span>
              <span>
                <span className="font-medium text-emerald-700">
                  {facets.readyToInvoice.toLocaleString("en-ZA")}
                </span>{" "}
                ready to invoice
              </span>
              {facets.needsReview ? (
                <span>
                  <span className="font-medium text-amber-700">
                    {facets.needsReview.toLocaleString("en-ZA")}
                  </span>{" "}
                  need review
                </span>
              ) : null}
            </>
          ) : null
        }
        actions={
          canEdit ? (
            <Button
              onClick={() => setImportOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Upload className="mr-1.5 h-4 w-4" /> Import from Sage
            </Button>
          ) : null
        }
      >
        {/* --- filter rail --- */}
        <div className="relative min-w-[200px] flex-1 basis-[16rem]">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySearch();
            }}
            onBlur={applySearch}
            placeholder="Search name, contact, email or PPPoE username…"
            className="bg-surface-elevated pl-8"
          />
        </div>

        <Select
          value={filters.status}
          onValueChange={(v) => setFilter("status", v as BillingStatus | "all")}
        >
          <SelectTrigger className="w-[168px] bg-surface-elevated">
            {/* This Select prints the raw value unless given a mapper. */}
            <SelectValue>
              {(v) => (v === "all" ? "All statuses" : statusLabel(String(v) as BillingStatus))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {statusLabel(s.value)} ({(facets.byStatus[s.value] ?? 0).toLocaleString("en-ZA")})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.owner} onValueChange={(v) => setFilter("owner", v ?? "all")}>
          <SelectTrigger className="w-[168px] bg-surface-elevated">
            <SelectValue>
              {(v) =>
                v === "all" ? "All owners" : v === "none" ? "Unassigned" : String(v)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {ACCOUNTS_OWNERS.map((owner) => (
              <SelectItem key={owner} value={owner}>
                {owner}
              </SelectItem>
            ))}
            <SelectItem value="none">Unassigned</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.debitDay} onValueChange={(v) => setFilter("debitDay", v ?? "all")}>
          <SelectTrigger className="w-[150px] bg-surface-elevated">
            <SelectValue>
              {(v) =>
                v === "all"
                  ? "Any billing"
                  : v === "none"
                    ? "Not on debit order"
                    : `Debit order — ${v}${v === "1" ? "st" : "th"}`
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any billing</SelectItem>
            {DEBIT_DAYS.map((d) => (
              <SelectItem key={d} value={d}>
                Debit order — {d}
                {d === "1" ? "st" : "th"}
              </SelectItem>
            ))}
            <SelectItem value="none">Not on debit order</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.payment} onValueChange={(v) => setFilter("payment", v ?? "all")}>
          <SelectTrigger className="w-[150px] bg-surface-elevated">
            <SelectValue>
              {(v) => (v === "all" ? "Any payment" : paymentLabel(String(v) as PaymentMethod))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any payment</SelectItem>
            {PAYMENT_METHODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={filters.review ? "default" : "outline"}
          onClick={() => setFilter("review", !filters.review)}
          className={filters.review ? "" : "bg-surface-elevated"}
        >
          <AlertTriangle className="mr-1.5 h-4 w-4" />
          Needs review
          {facets.needsReview ? ` (${facets.needsReview.toLocaleString("en-ZA")})` : ""}
        </Button>
      </PageHeader>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {/* Document failures are per-row and usually fixable ("no monthly price"), so
          they surface here rather than in a tab the user has to close. */}
      {docError ? (
        <AlertBanner tone="danger">
          <span className="flex-1">{docError}</span>
          <button
            type="button"
            onClick={clearDocError}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </AlertBanner>
      ) : null}

      {/* The gap between "active" and "invoiceable" is the department's actual
          workload, so it is stated plainly rather than left to be discovered. */}
      {!neverImported && notReady > 0 ? (
        <AlertBanner tone="warn">
          <span>
            <span className="font-medium">{notReady.toLocaleString("en-ZA")}</span> active{" "}
            {notReady === 1 ? "client is" : "clients are"} missing an email address or a
            monthly price, so {notReady === 1 ? "it" : "they"} cannot be invoiced yet.{" "}
            <button
              type="button"
              onClick={() => {
                setFilter("status", "active");
                setFilter("review", true);
              }}
              className="font-medium underline underline-offset-2"
            >
              Show them
            </button>
          </span>
        </AlertBanner>
      ) : null}

      {/* --- bulk actions ---
          Marking a few hundred clients "quote only" or "cash" one dialog at a time is
          not work anybody finishes, so the two the department actually needs are one
          click from a selection. */}
      {canEdit && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2.5 shadow-lift">
          <span className="text-sm font-medium text-foreground">
            {selected.size.toLocaleString("en-ZA")} selected
          </span>
          <span className="text-sm text-muted-foreground">Mark as</span>

          <Button
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void bulkSet({ billingStatus: "quote_only" })}
          >
            Quote only
          </Button>
          <Button
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void bulkSet({ paymentMethod: "cash" })}
          >
            Cash
          </Button>
          <Button
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void bulkSet({ paymentMethod: "eft" })}
          >
            EFT on invoice
          </Button>
          <Button
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void bulkSet({ billingStatus: "active" })}
          >
            Active
          </Button>
          <Button
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void bulkSet({ billingStatus: "cancelled" })}
          >
            Cancelled
          </Button>

          {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}

          <Button
            variant="ghost"
            className="ml-auto"
            disabled={bulkBusy}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      ) : null}

      <Panel className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading clients…
          </div>
        ) : neverImported ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No clients yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                Import the Sage <span className="font-medium">Megs Kliente lys</span> export
                to bring the client book in. You&apos;ll see what the file contains before
                anything is saved.
              </p>
            </div>
            {canEdit ? (
              <Button
                onClick={() => setImportOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Upload className="mr-1.5 h-4 w-4" /> Import from Sage
              </Button>
            ) : null}
          </div>
        ) : empty ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No clients match those filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {canEdit ? (
                    <th className="w-9 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allOnPageSelected}
                        onChange={togglePage}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </th>
                  ) : null}
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Pays by</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monthly</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  {/* Pinned right: the table scrolls horizontally on smaller screens
                      and these are the actions the page exists for. Scrolling to
                      reach "Send" would defeat moving it out of the dialog. */}
                  <th className="sticky right-0 border-l border-hairline bg-surface-elevated px-3 py-2.5 text-right font-medium">
                    Documents
                  </th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setEditing(c)}
                    className="group/row cursor-pointer border-b border-hairline last:border-0 hover:bg-muted/40"
                  >
                    {canEdit ? (
                      // Stops the row's own click handler from opening the dialog
                      // when the intent was to tick the box.
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5">
                      <div className="flex items-start gap-2">
                        {c.needsReview ? (
                          <AlertTriangle
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                            aria-label="Needs review"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{c.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {c.contactName ? <span className="truncate">{c.contactName}</span> : null}
                            {c.email ? (
                              <span className="inline-flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3 shrink-0" />
                                {c.email}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700">
                                <Mail className="h-3 w-3 shrink-0" /> no email
                              </span>
                            )}
                            {c.mobile ? (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" />
                                {c.mobile}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={isBillable(c.billingStatus) ? "default" : "secondary"}
                        title={c.staffRaw ? `Sage: ${c.staffRaw}` : undefined}
                      >
                        {statusLabel(c.billingStatus)}
                      </Badge>
                      {c.seasonal ? (
                        <Badge variant="outline" className="ml-1">
                          Seasonal
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {c.accountsOwner ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {c.paymentMethod === "unknown" ? (
                        <span className="text-muted-foreground/70">—</span>
                      ) : (
                        <span>{paymentLabel(c.paymentMethod)}</span>
                      )}
                      {c.debitOrderDay ? (
                        <span className="block text-xs text-muted-foreground">
                          on the {c.debitOrderDay}
                          {c.debitOrderDay === 1 ? "st" : "th"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {c.packagePriceIncl === null ? (
                        <span
                          className="text-xs text-amber-700"
                          title={c.packageRaw ? `Sage: ${c.packageRaw}` : "No package recorded"}
                        >
                          not priced
                        </span>
                      ) : (
                        <div>
                          <p className="font-medium tabular-nums text-foreground">
                            {money(c.packagePriceIncl)}
                          </p>
                          {c.packageSpeedMbps ? (
                            <p className="text-xs text-muted-foreground">
                              {c.packageSpeedMbps} Mbps
                            </p>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={
                          c.balance > 0
                            ? "font-medium tabular-nums text-amber-700"
                            : c.balance < 0
                              ? "tabular-nums text-emerald-700"
                              : "tabular-nums text-muted-foreground"
                        }
                      >
                        {money(c.balance)}
                      </span>
                    </td>

                    {/* --- documents ---
                        On the row rather than inside the client dialog: the monthly
                        run is a pass down this list, and opening a form for each of
                        2 000 clients is not a workflow anybody finishes.
                        stopPropagation so a click here doesn't also open the row. */}
                    <td
                      className="sticky right-0 border-l border-hairline bg-surface-elevated px-3 py-2.5 group-hover/row:bg-muted/40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <RowAction
                          label="Tax invoice"
                          icon={Receipt}
                          busy={docBusy(c.id, "invoice")}
                          // Statements work for any client; an invoice needs a price.
                          disabled={c.packagePriceIncl === null}
                          disabledReason="No monthly price recorded for this client."
                          onClick={() => void openDocument(c.id, "invoice")}
                        />
                        <RowAction
                          label="Customer report"
                          icon={FileText}
                          busy={docBusy(c.id, "statement")}
                          onClick={() => void openDocument(c.id, "statement")}
                        />
                        {canEdit ? (
                          <RowAction
                            label="Send invoice"
                            icon={Send}
                            emphasis
                            disabled={!!invoiceBlockedReason(c)}
                            disabledReason={invoiceBlockedReason(c) ?? undefined}
                            onClick={() => setSendingTo(c)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* --- paging --- */}
      {!neverImported && total > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Showing {(offset + 1).toLocaleString("en-ZA")}–
            {Math.min(offset + PAGE_SIZE, total).toLocaleString("en-ZA")} of{" "}
            {total.toLocaleString("en-ZA")}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={offset === 0 || isLoading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={offset + PAGE_SIZE >= total || isLoading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <ClientImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void reload()}
        canEdit={canEdit}
      />

      <ClientEditDialog
        client={editing}
        onClose={() => setEditing(null)}
        onSaved={async (payload) => {
          await post(payload);
          await reload();
        }}
        canEdit={canEdit}
      />

      <SendInvoiceDialog
        client={sendingTo}
        onClose={() => setSendingTo(null)}
        onSent={() => void reload()}
      />
    </PageShell>
  );
}

/**
 * One icon button in a client row.
 *
 * Icon-only with the label in the tooltip, because three words per button across
 * seven columns and a hundred rows crowds out the data the table exists to show.
 * A disabled button always carries its REASON — "Send invoice" greyed out with no
 * explanation is exactly what generates a phone call to whoever built it.
 */
function RowAction({
  label,
  icon: Icon,
  onClick,
  busy = false,
  disabled = false,
  disabledReason,
  emphasis = false,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled ? (disabledReason ?? label) : label}
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        emphasis
          ? "border-primary/30 text-primary hover:bg-primary/10 disabled:hover:bg-transparent"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}
