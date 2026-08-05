"use client";

import { PageHeader, PageShell } from "@/components/layout/page-shell";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCrmStore } from "@/lib/store/crm-store";
import { getFieldTechnicians } from "@/lib/permissions";
import {
  DEFAULT_OT_SETTINGS,
  formatDurationLabel,
  type OtMode,
  type OtSettings,
  type TimeEntry,
} from "@megs/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";

/** Wording for the overtime rule, in one place so the trigger and the list agree. */
const OT_MODES: { value: OtMode; label: string }[] = [
  { value: "daily", label: "After daily hours" },
  { value: "weekly", label: "After weekly hours" },
  { value: "both", label: "Daily and weekly" },
];

type EntryRow = TimeEntry & {
  durationMinutes?: number;
  regularMinutes?: number;
  otMinutes?: number;
};

export default function CoordinationTimesheetsPage() {
  const { accessToken } = useAuth();
  const { users } = useCrmStore();
  const techs = getFieldTechnicians(users);
  const [technicianId, setTechnicianId] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [otSettings, setOtSettings] = useState<OtSettings>(DEFAULT_OT_SETTINGS);
  const [mode, setMode] = useState<OtMode>("daily");
  const [dailyHours, setDailyHours] = useState("8");
  const [weeklyHours, setWeeklyHours] = useState("40");
  const [weekendAsOt, setWeekendAsOt] = useState(false);
  const [savingOt, setSavingOt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otSaved, setOtSaved] = useState(false);

  // jobId -> title, so an entry can say what the hours were for. Loaded once;
  // entries carried jobId all along but the page never showed it.
  const [jobTitles, setJobTitles] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!accessToken) return;
    const q = technicianId ? `?technicianId=${technicianId}` : "";
    const res = await fetch(`/api/coordination/timesheets${q}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed");
      return;
    }
    setEntries(json.entries ?? []);
    try {
      const jobsRes = await fetch("/api/coordination/jobs", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const jobsJson = await jobsRes.json();
      if (jobsRes.ok) {
        const titles: Record<string, string> = {};
        for (const j of jobsJson.jobs ?? []) titles[j.id] = j.title;
        setJobTitles(titles);
      }
    } catch {
      /* job labels are decoration */
    }
    const settings = (json.otSettings as OtSettings) ?? DEFAULT_OT_SETTINGS;
    setOtSettings(settings);
    setMode(settings.mode);
    setDailyHours(String(settings.dailyThresholdMinutes / 60));
    setWeeklyHours(String(settings.weeklyThresholdMinutes / 60));
    setWeekendAsOt(settings.weekendAsOt);
    setError(null);
  }, [accessToken, technicianId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOtSettings() {
    if (!accessToken) return;
    setSavingOt(true);
    setOtSaved(false);
    try {
      const res = await fetch("/api/coordination/timesheets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "update_ot_settings",
          mode,
          dailyThresholdHours: Number(dailyHours),
          weeklyThresholdHours: Number(weeklyHours),
          weekendAsOt,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save overtime rules");
        return;
      }
      if (json.otSettings) {
        setOtSettings(json.otSettings);
      }
      setOtSaved(true);
      await load();
    } finally {
      setSavingOt(false);
    }
  }

  const nameOf = (id: string) => techs.find((t) => t.id === id)?.name ?? id;

  return (
    <PageShell>
      <PageHeader
        title="Timesheets"
        description="Clock in/out from the mobile app (with GPS when available). Overtime is calculated from the rules below."
      />
      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overtime rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Regular / OT split applies to mobile timesheets and this page. Default: OT after{" "}
            {otSettings.dailyThresholdMinutes / 60}h per day ({otSettings.mode}).
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">When OT starts</p>
              <SelectField
                className="w-full"
                aria-label="When OT starts"
                value={mode}
                onValueChange={(v) =>
                  setMode(
                    v === "weekly" || v === "both" || v === "daily" ? v : "daily"
                  )
                }
                options={OT_MODES}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Daily threshold (hours)</p>
              <Input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={dailyHours}
                onChange={(e) => setDailyHours(e.target.value)}
                disabled={mode === "weekly"}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Weekly threshold (hours)</p>
              <Input
                type="number"
                min={0}
                max={168}
                step={0.5}
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(e.target.value)}
                disabled={mode === "daily"}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Weekend</p>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border"
                  checked={weekendAsOt}
                  onChange={(e) => setWeekendAsOt(e.target.checked)}
                />
                Count Sat/Sun as OT
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={savingOt}
              onClick={() => void saveOtSettings()}
            >
              {savingOt ? "Saving…" : "Save overtime rules"}
            </Button>
            {otSaved ? (
              <span className="text-sm text-green-700">Saved — timesheets recalculate.</span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="max-w-sm">
        <SelectField
          className="w-full"
          aria-label="Filter by technician"
          value={technicianId}
          onValueChange={setTechnicianId}
          options={[
            { value: "", label: "All techs" },
            ...techs.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
      </div>

      <div className="grid gap-2">
        {entries.map((e) => (
          <Card key={e.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">{nameOf(e.technicianId)}</p>
                <p className="text-muted-foreground">
                  In {new Date(e.clockInAt).toLocaleString()}
                  {e.clockOutAt
                    ? ` → Out ${new Date(e.clockOutAt).toLocaleString()}`
                    : " (open)"}
                </p>
                {e.jobId ? (
                  <p className="text-xs text-muted-foreground">
                    Job: {jobTitles[e.jobId] ?? e.jobId}
                  </p>
                ) : null}
                {(e.clockInLat != null || e.clockOutLat != null) && (
                  <p className="text-xs text-muted-foreground">
                    GPS{" "}
                    {e.clockInLat != null
                      ? `in ${e.clockInLat.toFixed(4)},${e.clockInLng?.toFixed(4)}`
                      : ""}
                    {e.clockOutLat != null
                      ? ` · out ${e.clockOutLat.toFixed(4)},${e.clockOutLng?.toFixed(4)}`
                      : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <DurationChip
                  label="Regular"
                  value={formatDurationLabel(e.regularMinutes ?? 0)}
                />
                <DurationChip
                  label="OT"
                  value={formatDurationLabel(e.otMinutes ?? 0)}
                />
                <DurationChip
                  label="Total"
                  value={formatDurationLabel(e.durationMinutes ?? 0)}
                  emphasize
                />
                <span className="uppercase text-muted-foreground">{e.source}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No time entries yet.</p>
        )}
      </div>
    </PageShell>
  );
}

function DurationChip({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-semibold ${emphasize ? "text-blue-600" : ""}`}>{value}</p>
    </div>
  );
}
