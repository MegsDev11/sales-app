import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { API_PATHS, type LeaveType, type TimeOffRequest } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { colors, spacing } from "../../src/theme";
import { DashboardScreen } from "../../src/tech-ui";
import { Loading, PrimaryButton } from "../../src/ui";

const LEAVE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: "family", label: "Family" },
  { value: "time_off", label: "Time off" },
  { value: "sick", label: "Sick leave" },
  { value: "unpaid", label: "Unpaid leave" },
];

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function statusColor(status: string) {
  if (status === "approved") return colors.online;
  if (status === "declined") return colors.offline;
  return colors.unknown;
}

export default function TimeOffScreen() {
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [leaveType, setLeaveType] = useState<LeaveType>("time_off");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch(API_PATHS.mobileTechTimeOff);
      setRequests(data.requests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const balances = useMemo(() => {
    const approved = requests.filter((r) => r.status === "approved");
    const sum = (type: LeaveType) =>
      approved.filter((r) => r.leaveType === type).reduce((n, r) => n + r.days, 0);
    return {
      family: sum("family"),
      time_off: sum("time_off"),
      sick: sum("sick"),
      unpaid: sum("unpaid"),
    };
  }, [requests]);

  async function submit() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await apiFetch(API_PATHS.mobileTechTimeOff, {
        method: "POST",
        body: JSON.stringify({ leaveType, startDate, endDate, reason }),
      });
      setReason("");
      setMsg("Request sent to Coordination");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <DashboardScreen>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Time off</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Request time off</Text>
          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            {LEAVE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setLeaveType(opt.value)}
                style={[
                  styles.typeChip,
                  leaveType === opt.value && styles.typeChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    leaveType === opt.value && styles.typeChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            autoCapitalize="none"
            style={styles.input}
            placeholder="2026-07-24"
          />
          <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
          <TextInput
            value={endDate}
            onChangeText={setEndDate}
            autoCapitalize="none"
            style={styles.input}
            placeholder="2026-07-25"
          />
          <Text style={styles.label}>Reason</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            style={[styles.input, styles.reason]}
            placeholder="Optional note for Coordination"
            multiline
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {msg ? <Text style={styles.ok}>{msg}</Text> : null}
          <PrimaryButton
            label={busy ? "Sending…" : "Submit request"}
            disabled={busy}
            onPress={() => void submit()}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Approved days used</Text>
          <View style={styles.balanceRow}>
            {(
              [
                ["Family", balances.family],
                ["Time off", balances.time_off],
                ["Sick", balances.sick],
                ["Unpaid", balances.unpaid],
              ] as const
            ).map(([label, days]) => (
              <View key={label} style={styles.balanceChip}>
                <Text style={styles.balanceLabel}>{label}</Text>
                <Text style={styles.balanceValue}>{days}d</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.section}>Your requests</Text>
        {requests.length === 0 ? (
          <Text style={styles.empty}>No requests yet.</Text>
        ) : (
          requests.map((r) => (
            <View key={r.id} style={styles.requestCard}>
              <View style={styles.requestTop}>
                <Text style={styles.requestType}>
                  {LEAVE_OPTIONS.find((o) => o.value === r.leaveType)?.label ?? r.leaveType}
                </Text>
                <Text style={[styles.requestStatus, { color: statusColor(r.status) }]}>
                  {r.status}
                </Text>
              </View>
              <Text style={styles.requestDates}>
                {r.startDate} → {r.endDate} · {r.days} day{r.days === 1 ? "" : "s"}
              </Text>
              {r.reason ? <Text style={styles.requestReason}>{r.reason}</Text> : null}
              {r.status !== "pending" && r.reviewNote ? (
                <Text style={styles.reviewNote}>Coordination: {r.reviewNote}</Text>
              ) : null}
              {r.reviewedAt ? (
                <Text style={styles.reviewedAt}>
                  {r.status} {new Date(r.reviewedAt).toLocaleString()}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 8,
  },
  back: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 16,
    width: 56,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    gap: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedDark,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 15,
  },
  reason: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F9FAFB",
  },
  typeChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  typeChipText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
  typeChipTextActive: {
    color: colors.accentDeep,
  },
  error: {
    color: colors.offline,
    fontWeight: "600",
    fontSize: 13,
  },
  ok: {
    color: colors.online,
    fontWeight: "600",
    fontSize: 13,
  },
  balanceRow: {
    flexDirection: "row",
    gap: 8,
  },
  balanceChip: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 8,
  },
  balanceLabel: {
    fontSize: 11,
    color: colors.mutedDark,
  },
  balanceValue: {
    marginTop: 4,
    fontWeight: "700",
    color: colors.text,
  },
  section: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    marginTop: 4,
  },
  empty: {
    color: colors.mutedDark,
    fontSize: 14,
  },
  requestCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  requestTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  requestType: {
    fontWeight: "700",
    color: colors.text,
  },
  requestStatus: {
    fontWeight: "700",
    textTransform: "capitalize",
    fontSize: 13,
  },
  requestDates: {
    color: colors.mutedDark,
    fontSize: 13,
  },
  requestReason: {
    color: colors.text,
    fontSize: 13,
    marginTop: 2,
  },
  reviewNote: {
    marginTop: 4,
    color: colors.accentDeep,
    fontSize: 13,
  },
  reviewedAt: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
});
