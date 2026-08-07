"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  MoonStar,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Panel } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The chatbot's escalations for one desk.
 *
 * Used by Support, Financial, Sales and AI Agents with a different `scope`. The scope
 * is sent to the API, which decides both which module guards the request and which
 * categories may come back — the component cannot widen its own view by asking.
 */

export type ChatbotScope = "support" | "financial" | "sales" | "all";

interface Escalation {
  id: string;
  reference: string;
  sessionId: string;
  category: string;
  urgency: string;
  summary: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  accountsClientId: string | null;
  afterHours: boolean;
  status: string;
  notifiedAt: string | null;
  notifyError: string;
  assignedTo: string | null;
  assignedToName?: string;
  createdAt: string;
}

interface TranscriptLine {
  role: "user" | "assistant";
  body: string;
}

const STATUS_TABS = [
  { key: "new", label: "New" },
  { key: "acknowledged", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  connectivity: "Connectivity",
  billing: "Billing",
  sales: "Sales",
  general: "General",
};

function whenText(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatbotRequests({
  scope,
  showCategory = false,
}: {
  scope: ChatbotScope;
  /** Only AI Agents sees more than one category, so only it needs the column. */
  showCategory?: boolean;
}) {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<string>("new");
  const [rows, setRows] = useState<Escalation[]>([]);
  const [counts, setCounts] = useState({ new: 0, acknowledged: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/escalations?scope=${scope}&status=${status}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load requests");
      setRows(body.escalations ?? []);
      setCounts(body.counts ?? { new: 0, acknowledged: 0, resolved: 0 });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [accessToken, scope, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openTranscript(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    setTranscript([]);
    if (!accessToken) return;
    setTranscriptLoading(true);
    try {
      const res = await fetch(`/api/ai/escalations?scope=${scope}&id=${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (res.ok) setTranscript(body.transcript ?? []);
    } catch {
      // The transcript is context, not the record — a failure here should not
      // block acknowledging the request.
    } finally {
      setTranscriptLoading(false);
    }
  }

  async function update(id: string, patch: { status?: string; assignToMe?: boolean }) {
    if (!accessToken) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/ai/escalations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id, scope, ...patch }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.key === "new"
              ? counts.new
              : tab.key === "acknowledged"
                ? counts.acknowledged
                : tab.key === "resolved"
                  ? counts.resolved
                  : 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatus(tab.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition",
                status === tab.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.key !== "all" && count > 0 && (
                <span className="ml-1.5 text-xs opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border border-border bg-muted/40" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Panel>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Bot className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">Nothing here</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {status === "new"
                ? "The assistant hasn't had to hand anything over. That is the point of it."
                : "No requests match this filter."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const isOpen = openId === row.id;
            const busy = busyId === row.id;
            return (
              <div
                key={row.id}
                className="overflow-hidden rounded-lg border border-border bg-surface-elevated"
              >
                <div className="flex flex-wrap items-start gap-3 p-3 sm:p-4">
                  <button
                    type="button"
                    onClick={() => void openTranscript(row.id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "Hide conversation" : "Show conversation"}
                    className="mt-0.5 rounded p-0.5 text-muted-foreground transition hover:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    )}
                  </button>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.reference || row.id.slice(-6)}
                      </span>
                      <span className="font-medium">{row.contactName || "No name given"}</span>
                      {row.urgency === "urgent" && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Urgent
                        </Badge>
                      )}
                      {showCategory && (
                        <Badge variant="secondary">
                          {CATEGORY_LABELS[row.category] ?? row.category}
                        </Badge>
                      )}
                      {row.afterHours && (
                        <Badge variant="outline" className="gap-1 text-amber-600">
                          <MoonStar className="h-3 w-3" aria-hidden />
                          After hours
                        </Badge>
                      )}
                      {row.accountsClientId && (
                        <Badge variant="outline" className="gap-1 text-emerald-600">
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          Verified
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground">{row.summary}</p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {row.contactPhone && (
                        <a
                          href={`tel:${row.contactPhone.replace(/\s/g, "")}`}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <Phone className="h-3 w-3" aria-hidden />
                          {row.contactPhone}
                        </a>
                      )}
                      {row.contactEmail && (
                        <a
                          href={`mailto:${row.contactEmail}`}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <Mail className="h-3 w-3" aria-hidden />
                          {row.contactEmail}
                        </a>
                      )}
                      <span>{whenText(row.createdAt)}</span>
                      {row.assignedToName && <span>· {row.assignedToName}</span>}
                      {row.notifyError && (
                        <span className="text-amber-600" title={row.notifyError}>
                          · on-call email failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
                    {!row.assignedTo && row.status !== "resolved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void update(row.id, { assignToMe: true, status: "acknowledged" })}
                      >
                        <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Take it
                      </Button>
                    )}
                    {row.status !== "resolved" && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void update(row.id, { status: "resolved" })}
                      >
                        <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Resolve
                      </Button>
                    )}
                    {row.status === "resolved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void update(row.id, { status: "acknowledged" })}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border bg-muted/30 p-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Conversation before hand-over
                    </p>
                    {transcriptLoading ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : transcript.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        The conversation could not be read.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {transcript.map((line, i) => (
                          <div key={i} className="text-sm">
                            <span
                              className={cn(
                                "font-medium",
                                line.role === "user" ? "text-foreground" : "text-primary"
                              )}
                            >
                              {line.role === "user" ? "Client" : "Assistant"}:
                            </span>{" "}
                            <span className="whitespace-pre-wrap text-muted-foreground">
                              {line.body}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
