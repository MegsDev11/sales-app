"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
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
import { ACCOUNTS_OWNERS } from "@/lib/accounts/parse-clients";
import { BUCKETS, type BucketKey } from "@/lib/financial/ageing";
import { cn } from "@/lib/utils";
import { ChevronLeft, Loader2, Mail, Phone } from "lucide-react";

/**
 * Debtor age analysis — the collections call list.
 *
 * Sorted worst-first, because the point of the report is to decide who to phone this
 * morning. Everything on a row is what that call needs: how much, how old, who owns
 * the relationship, and the contact details, so nobody has to open another screen
 * between calls.
 *
 * The brought-forward column is kept visually distinct rather than blended into the
 * buckets. It is real money owed whose AGE is unknown — it came across as one figure
 * per client when the Sage book was imported. Showing it as "current" would put the
 * worst debtors at the bottom of this list, which is the exact failure the report
 * exists to prevent.
 */

const money = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);

const compact = (value: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

interface AgeingRow {
  clientId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  accountsOwner: string | null;
  billingStatus: string;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d120: number;
  broughtForward: number;
  unallocated: number;
  total: number;
  oldestDays: number | null;
}

interface Totals {
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d120: number;
  broughtForward: number;
  unallocated: number;
  total: number;
  clientsOwing: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function AgeingPage() {
  const { accessToken } = useAuth();

  const [asAt, setAsAt] = useState(today);
  const [owner, setOwner] = useState("all");
  const [minDays, setMinDays] = useState("0");
  const [rows, setRows] = useState<AgeingRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [matched, setMatched] = useState(0);
  const [paymentsLive, setPaymentsLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ asAt, minDays });
      if (owner !== "all") params.set("owner", owner);
      const res = await fetch(`/api/accounts/ageing?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to build the age analysis");
      setRows(body.clients ?? []);
      setTotals(body.totals ?? null);
      setMatched(body.matched ?? 0);
      setPaymentsLive(body.paymentsLive !== false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build the age analysis");
    } finally {
      setLoading(false);
    }
  }, [accessToken, asAt, owner, minDays]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Share of the book sitting in each bucket — the shape of the debt at a glance. */
  const mix = useMemo(() => {
    if (!totals || totals.total <= 0) return null;
    const gross =
      totals.current + totals.d30 + totals.d60 + totals.d90 + totals.d120 + totals.broughtForward;
    if (gross <= 0) return null;
    return { gross };
  }, [totals]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Accounts"
        title="Age analysis"
        description="Who owes what, and how long they've owed it. Worst first."
        meta={
          totals ? (
            <>
              <span>
                <span className="font-medium text-foreground">{money(totals.total)}</span> owed
              </span>
              <span>
                across{" "}
                <span className="font-medium text-foreground">
                  {totals.clientsOwing.toLocaleString("en-ZA")}
                </span>{" "}
                clients
              </span>
              {totals.unallocated > 0 ? (
                <span>
                  <span className="font-medium text-emerald-700">
                    {money(totals.unallocated)}
                  </span>{" "}
                  on account
                </span>
              ) : null}
            </>
          ) : null
        }
        actions={
          <Link href="/accounts">
            <Button variant="outline">
              <ChevronLeft className="mr-1 h-4 w-4" /> Client book
            </Button>
          </Link>
        }
      >
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          As at
          <Input
            type="date"
            value={asAt}
            onChange={(e) => setAsAt(e.target.value || today())}
            className="h-8 w-[10.5rem] bg-surface-elevated"
          />
        </label>

        <Select value={owner} onValueChange={(v) => setOwner(v ?? "all")}>
          <SelectTrigger className="w-[168px] bg-surface-elevated">
            <SelectValue>
              {(v) => (v === "all" ? "All owners" : v === "none" ? "Unassigned" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {ACCOUNTS_OWNERS.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
            <SelectItem value="none">Unassigned</SelectItem>
          </SelectContent>
        </Select>

        <Select value={minDays} onValueChange={(v) => setMinDays(v ?? "0")}>
          <SelectTrigger className="w-[168px] bg-surface-elevated">
            <SelectValue>
              {(v) => (v === "0" ? "Any age" : `${v}+ days overdue`)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Any age</SelectItem>
            <SelectItem value="30">30+ days overdue</SelectItem>
            <SelectItem value="60">60+ days overdue</SelectItem>
            <SelectItem value="90">90+ days overdue</SelectItem>
            <SelectItem value="120">120+ days overdue</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {error ? <AlertBanner tone="danger">{error}</AlertBanner> : null}

      {!paymentsLive ? (
        <AlertBanner tone="warn">
          Payments aren&apos;t recorded yet, so nothing here can show as paid. Apply
          migration 056 and import a bank statement, and these figures start coming down.
        </AlertBanner>
      ) : null}

      {totals && totals.broughtForward > 0 ? (
        <AlertBanner tone="info">
          <span>
            <span className="font-medium">{money(totals.broughtForward)}</span> came across
            as a Sage opening balance, so its age isn&apos;t known — it&apos;s shown in its
            own column rather than being counted as current. Importing the Sage customer
            age analysis would place it properly.
          </span>
        </AlertBanner>
      ) : null}

      {/* --- the shape of the debt --- */}
      {totals ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {BUCKETS.map((b) => (
            <BucketCard
              key={b.key}
              label={b.label}
              value={totals[b.key]}
              share={mix ? totals[b.key] / mix.gross : 0}
              severe={b.key === "d90" || b.key === "d120"}
            />
          ))}
          <BucketCard
            label="Brought forward"
            value={totals.broughtForward}
            share={mix ? totals.broughtForward / mix.gross : 0}
            muted
          />
        </div>
      ) : null}

      <Panel className="p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Working out the ageing…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            Nothing outstanding for those filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-3 py-2.5 text-right font-medium">Current</th>
                  <th className="px-3 py-2.5 text-right font-medium">30</th>
                  <th className="px-3 py-2.5 text-right font-medium">60</th>
                  <th className="px-3 py-2.5 text-right font-medium">90</th>
                  <th className="px-3 py-2.5 text-right font-medium">120+</th>
                  <th className="px-3 py-2.5 text-right font-medium">B/fwd</th>
                  <th className="sticky right-0 border-l border-hairline bg-surface-elevated px-4 py-2.5 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.clientId}
                    className="group/row border-b border-hairline last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                          <span className="truncate">{r.name}</span>
                          {r.oldestDays !== null && r.oldestDays >= 90 ? (
                            <Badge variant="destructive">{r.oldestDays} days</Badge>
                          ) : null}
                          {r.unallocated > 0 ? (
                            <Badge variant="secondary">{money(r.unallocated)} on account</Badge>
                          ) : null}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {r.accountsOwner ? <span>{r.accountsOwner}</span> : null}
                          {r.email ? (
                            <span className="inline-flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3 shrink-0" />
                              {r.email}
                            </span>
                          ) : null}
                          {r.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 shrink-0" />
                              {r.phone}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <Cell value={r.current} />
                    <Cell value={r.d30} />
                    <Cell value={r.d60} />
                    <Cell value={r.d90} severe />
                    <Cell value={r.d120} severe />
                    <Cell value={r.broughtForward} muted />
                    <td className="sticky right-0 border-l border-hairline bg-surface-elevated px-4 py-2.5 text-right font-semibold tabular-nums text-foreground group-hover/row:bg-muted/40">
                      {money(r.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals ? (
                <tfoot>
                  <tr className="border-t border-border bg-muted/50 text-xs font-semibold">
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {matched > rows.length
                        ? `Totals — all ${matched.toLocaleString("en-ZA")} matching clients`
                        : "Totals"}
                    </td>
                    <Cell value={totals.current} />
                    <Cell value={totals.d30} />
                    <Cell value={totals.d60} />
                    <Cell value={totals.d90} severe />
                    <Cell value={totals.d120} severe />
                    <Cell value={totals.broughtForward} muted />
                    <td className="sticky right-0 border-l border-hairline bg-muted/50 px-4 py-2.5 text-right tabular-nums text-foreground">
                      {money(totals.total)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </Panel>

      {matched > rows.length ? (
        <p className="text-sm text-muted-foreground">
          Showing the {rows.length.toLocaleString("en-ZA")} largest of{" "}
          {matched.toLocaleString("en-ZA")} clients. The totals row covers all of them.
        </p>
      ) : null}
    </PageShell>
  );
}

function Cell({
  value,
  severe,
  muted,
}: {
  value: number;
  severe?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 text-right tabular-nums",
        value === 0
          ? "text-muted-foreground/40"
          : severe
            ? "font-medium text-red-700"
            : muted
              ? "text-muted-foreground"
              : "text-foreground"
      )}
    >
      {value === 0 ? "—" : money(value)}
    </td>
  );
}

function BucketCard({
  label,
  value,
  share,
  severe,
  muted,
}: {
  label: string;
  value: number;
  share: number;
  severe?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          severe ? "text-red-700" : muted ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {compact(value)}
      </p>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", severe ? "bg-red-600" : muted ? "bg-slate-400" : "bg-primary")}
          style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
        />
      </div>
    </div>
  );
}

export type { BucketKey };
