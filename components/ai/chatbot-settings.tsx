"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, KeyRound, Loader2, Mail, Power } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Panel } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

interface Settings {
  enabled: boolean;
  greeting: string;
  effort: string;
  oncallEmail: string;
  officeOpensHour: number;
  officeClosesHour: number;

  /**
   * The advisor's fields, carried through untouched.
   *
   * This form PUTs its whole object and the API writes every column, so leaving these
   * off would blank the advisor's house rules every time somebody saved a greeting.
   * They are not edited here — that is the Advisor tab — only round-tripped.
   */
  advisorEnabled: boolean;
  advisorEffort: string;
  advisorHouseRules: string;
}

interface Payload {
  settings: Settings;
  environment: { apiKeyPresent: boolean; emailConfigured: boolean };
  usage: { days: number; conversationTurns: number; costUsd: number };
}

const EFFORTS = [
  { value: "low", label: "Low — fastest, cheapest" },
  { value: "medium", label: "Medium — recommended" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max — slowest, dearest" },
];

const HOURS = Array.from({ length: 25 }, (_, i) => i);

export function ChatbotSettings() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/settings", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load settings");
      setData(body);
      setForm(body.settings);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!accessToken || !form) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save");
      setForm(body.settings);
      setError("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form || !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* The two reasons the assistant is silent that no setting on this page can
          fix. Reported as booleans by the API — never the key or the password. */}
      {!data.environment.apiKeyPresent && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            <strong>No API key.</strong> The assistant is hidden from the website until{" "}
            <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> is set in the
            environment. Create one at console.anthropic.com under API keys.
          </span>
        </div>
      )}
      {!data.environment.emailConfigured && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            <strong>Email is not configured.</strong> Without it the assistant cannot send
            verification codes, invoices or on-call alerts, so account questions all become
            escalations. Set the <code className="rounded bg-muted px-1">ACCOUNTS_SMTP_*</code>{" "}
            variables.
          </span>
        </div>
      )}

      <Panel
        title="Assistant"
        description="Controls the chat window on the public website."
      >
        <div className="space-y-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => set("enabled", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Power className="h-3.5 w-3.5" aria-hidden />
                Assistant is live
              </span>
              <span className="mt-0.5 block text-muted-foreground">
                Switching this off removes the chat window from the website immediately and
                makes the endpoint refuse politely. Use it if the assistant ever starts
                saying something wrong — no deploy needed.
              </span>
            </span>
          </label>

          <div>
            <label htmlFor="greeting" className="text-sm font-medium">
              Opening message
            </label>
            <p className="mb-1.5 text-sm text-muted-foreground">
              The first thing a visitor reads. Leave blank for the built-in greeting.
            </p>
            <Textarea
              id="greeting"
              rows={4}
              maxLength={2000}
              value={form.greeting}
              onChange={(e) => set("greeting", e.target.value)}
              placeholder="Leave blank to use the default greeting"
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Escalations"
        description="What happens when the assistant hands a conversation to a person."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="oncall" className="text-sm font-medium">
              On-call email address
            </label>
            <p className="mb-1.5 text-sm text-muted-foreground">
              Every escalation is emailed here with the full conversation attached. Blank
              falls back to <code className="rounded bg-muted px-1">SUPPORT_ONCALL_EMAIL</code>;
              with neither set, escalations are still logged but nobody is told.
            </p>
            <Input
              id="oncall"
              type="email"
              value={form.oncallEmail}
              onChange={(e) => set("oncallEmail", e.target.value)}
              placeholder="oncall@megswb.co.za"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Office opens</label>
            <p className="mb-1.5 text-sm text-muted-foreground">Weekdays, SAST.</p>
            <SelectField
              className="w-full"
              aria-label="Office opens"
              value={String(form.officeOpensHour)}
              onValueChange={(v) => set("officeOpensHour", v === "" ? 8 : Number(v))}
              options={HOURS.slice(0, 24).map((h) => ({
                value: String(h),
                label: `${String(h).padStart(2, "0")}:00`,
              }))}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Office closes</label>
            <p className="mb-1.5 text-sm text-muted-foreground">
              Outside these hours an escalation is flagged after-hours.
            </p>
            <SelectField
              className="w-full"
              aria-label="Office closes"
              value={String(form.officeClosesHour)}
              onValueChange={(v) => set("officeClosesHour", v === "" ? 17 : Number(v))}
              options={HOURS.filter((h) => h > form.officeOpensHour).map((h) => ({
                value: String(h),
                label: `${String(h).padStart(2, "0")}:00`,
              }))}
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Cost"
        description="Thinking depth is the dial between answer quality, speed and spend."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Thinking depth</label>
            <p className="mb-1.5 text-sm text-muted-foreground">
              Drop to Low if replies feel slow. Raise it only if the assistant starts
              skipping lookups it should be doing.
            </p>
            {/* The Select can emit an empty value on clear; falling back keeps a
                valid value rather than writing "" and tripping the CHECK constraint. */}
            <SelectField
              className="w-full"
              aria-label="Thinking depth"
              value={form.effort}
              onValueChange={(v) => set("effort", v === "" ? "medium" : v)}
              options={EFFORTS.map((e) => ({ value: e.value, label: e.label }))}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Last {data.usage.days} days
            </p>
            <p className="mt-1 text-2xl font-semibold">
              ${data.usage.costUsd.toFixed(2)}
            </p>
            <p className="text-sm text-muted-foreground">
              across {data.usage.conversationTurns.toLocaleString("en-ZA")} replies
            </p>
          </div>
        </div>
      </Panel>

      <div className="flex items-center gap-3">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Check className="mr-1.5 h-4 w-4" aria-hidden />
          )}
          Save settings
        </Button>
        <span
          className={cn(
            "text-sm text-emerald-600 transition-opacity",
            saved ? "opacity-100" : "opacity-0"
          )}
          role="status"
        >
          Saved
        </span>
      </div>
    </div>
  );
}
