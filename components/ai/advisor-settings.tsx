"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Power, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Panel } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

/**
 * The project advisor's settings, alongside the website assistant's.
 *
 * Three knobs, and only three, because the advisor's job is fixed in code: it reads the
 * delivery history and answers from it. What an owner legitimately wants to change
 * without a deploy is whether it runs, how hard it thinks, and the standing context it
 * should weigh — not its prompt.
 *
 * Reads and writes the same /api/ai/settings row as the assistant, so saving here does
 * not clobber the assistant's fields and vice versa.
 */

interface Settings {
  enabled: boolean;
  greeting: string;
  effort: string;
  oncallEmail: string;
  officeOpensHour: number;
  officeClosesHour: number;
  advisorEnabled: boolean;
  advisorEffort: string;
  advisorHouseRules: string;
}

interface Payload {
  settings: Settings;
  environment: { apiKeyPresent: boolean; emailConfigured: boolean };
}

const EFFORTS = [
  { value: "low", label: "Low — fastest, cheapest" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High — recommended" },
  { value: "xhigh", label: "Extra high" },
  { value: "max", label: "Max — slowest, dearest" },
];

const HOUSE_RULES_PLACEHOLDER = `We don't trench in Limpopo through December — plan around the rain.
Always check the cherry picker is booked before quoting overhead work.
Marchand's team is committed to Die Oog until March.`;

export function AdvisorSettings() {
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

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      // The whole row goes back, so the assistant's settings survive a save here.
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <Panel title="Project advisor">
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
        </p>
      </Panel>
    );
  }

  const keyMissing = data?.environment.apiKeyPresent === false;

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {keyMissing ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/60 px-3 py-2.5 text-sm">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            No <span className="font-mono text-xs">ANTHROPIC_API_KEY</span> on the server,
            so the advisor cannot answer whatever these settings say. Get a key from
            platform.claude.com and set it in the environment.
          </span>
        </p>
      ) : null}

      <Panel
        title="Project advisor"
        description="The Advisor tab under Projects — advice argued from your own delivery record"
      >
        <div className="space-y-5">
          {/* Kill switch, same shape as the assistant's. */}
          <label className="flex items-start gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.advisorEnabled}
              onClick={() => setForm({ ...form, advisorEnabled: !form.advisorEnabled })}
              className={cn(
                "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
                form.advisorEnabled ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-full bg-white transition-transform",
                  form.advisorEnabled ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Power className="h-3.5 w-3.5" /> Advisor is on
              </span>
              <span className="block text-xs text-muted-foreground">
                Off means the Advisor tab says so plainly instead of failing when
                somebody asks. Past answers stay readable either way.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              How hard it thinks
            </label>
            <SelectField
              className="w-full sm:w-72"
              aria-label="How hard it thinks"
              value={form.advisorEffort}
              onValueChange={(v) => setForm({ ...form, advisorEffort: v })}
              options={EFFORTS.map((e) => ({ value: e.value, label: e.label }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Higher than the website assistant on purpose. The assistant follows a
              troubleshooting tree; this one reasons across every project you have run
              and has to cite it correctly. Below <span className="font-medium">high</span>{" "}
              it starts making claims your record does not support.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              House rules
            </label>
            <Textarea
              value={form.advisorHouseRules}
              onChange={(e) => setForm({ ...form, advisorHouseRules: e.target.value })}
              rows={5}
              maxLength={4000}
              placeholder={HOUSE_RULES_PLACEHOLDER}
              className="text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Standing context it should weigh on every project — seasons, crew
              commitments, things you always want checked. One per line. It is told these
              come from you rather than from the data, and to say when a rule is what is
              driving its answer.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
            <Button
              onClick={() => void save()}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
            {saved ? (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="h-4 w-4" /> Saved
              </span>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="What it is shown">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Every answer is built from a brief assembled out of your own tables — the
            delay log and what each cause cost you, per-project quote against stock and
            teams cost, the plant register, and the spread of unit prices you have
            actually paid different suppliers. Nothing is trained on your data and the
            model does not remember between questions; what grows is the brief, so the
            advice sharpens as projects finish rather than because anything learned.
          </span>
        </p>
      </Panel>
    </div>
  );
}
