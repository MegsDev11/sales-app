import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  API_PATHS,
  buildPeriodHours,
  formatDurationLabel,
  formatMonthRangePill,
  monthRangeLocal,
  type OtSettings,
  type TimeEntry,
  type TimeOffRequest,
  DEFAULT_OT_SETTINGS,
} from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { colors, spacing } from "../../src/theme";
import { Loading } from "../../src/ui";

const CLOCK_BLUE = "#2196F3";

export default function TimesheetScreen() {
  const insets = useSafeAreaInsets();
  const [anchor, setAnchor] = useState(() => new Date());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [otSettings, setOtSettings] = useState<OtSettings>(DEFAULT_OT_SETTINGS);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => new Date());

  const { start, end } = useMemo(() => monthRangeLocal(anchor), [anchor]);

  const load = useCallback(async () => {
    try {
      const from = start.toISOString();
      const to = end.toISOString();
      const [timeData, leaveData] = await Promise.all([
        apiFetch(`${API_PATHS.mobileTechTime}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        apiFetch(API_PATHS.mobileTechTimeOff).catch(() => ({ requests: [] })),
      ]);
      const open = (timeData.active as TimeEntry | null) ?? null;
      const list = (timeData.entries ?? []) as TimeEntry[];
      const merged =
        open && !list.some((e) => e.id === open.id) ? [open, ...list] : list;
      setEntries(merged);
      if (timeData.otSettings) {
        setOtSettings(timeData.otSettings as OtSettings);
      }
      setTimeOff((leaveData.requests ?? []) as TimeOffRequest[]);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const period = useMemo(
    () => buildPeriodHours(entries, start, end, otSettings, now),
    [entries, start, end, otSettings, now]
  );

  const requestCounts = useMemo(() => {
    const pending = timeOff.filter((r) => r.status === "pending").length;
    const approved = timeOff.filter((r) => r.status === "approved").length;
    return { pending, approved };
  }, [timeOff]);

  const todayKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  function shiftMonth(delta: number) {
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  if (loading) return <Loading />;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <Text style={styles.headerBack}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Timesheet</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.navRow}>
        <Pressable onPress={() => shiftMonth(-1)} style={styles.navArrow}>
          <Text style={styles.navArrowText}>‹</Text>
        </Pressable>
        <View style={styles.rangePill}>
          <Text style={styles.rangeText}>{formatMonthRangePill(start, end)}</Text>
        </View>
        <Pressable onPress={() => shiftMonth(1)} style={styles.navArrow}>
          <Text style={styles.navArrowText}>›</Text>
        </Pressable>
        <Pressable onPress={() => setAnchor(new Date())} style={styles.todayBtn}>
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCol label="Regular" value={formatDurationLabel(period.regularMinutes)} />
        <SummaryCol label="OT" value={formatDurationLabel(period.otMinutes)} />
        <SummaryCol label="Total" value={formatDurationLabel(period.totalMinutes)} />
        <SummaryCol label="Absence" value="--" />
      </View>

      <Pressable
        style={styles.requestsRow}
        onPress={() => router.push("/(tech)/time-off")}
      >
        <Text style={styles.requestsLabel}>Requests</Text>
        <View style={styles.requestsRight}>
          {requestCounts.pending > 0 ? (
            <View style={styles.reqChip}>
              <Text style={styles.reqPendingIcon}>⏱</Text>
              <Text style={styles.reqCount}>{requestCounts.pending}</Text>
            </View>
          ) : null}
          {requestCounts.approved > 0 ? (
            <View style={styles.reqChip}>
              <Text style={styles.reqApprovedIcon}>✓</Text>
              <Text style={styles.reqCount}>{requestCounts.approved}</Text>
            </View>
          ) : null}
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        {period.weeks.map((week) => (
          <View key={week.weekStartKey} style={styles.weekBlock}>
            <Text style={styles.weekHeader}>
              Week total {formatDurationLabel(week.totalMinutes)}
              {"  •  "}
              Overtime {formatDurationLabel(week.otMinutes)}
            </Text>
            {week.days.map((day) => {
              const empty = day.totalMinutes <= 0;
              const isToday = day.dateKey === todayKey;
              return (
                <View
                  key={day.dateKey}
                  style={[styles.dayCard, isToday && styles.dayCardToday]}
                >
                  {isToday ? <View style={styles.todayBar} /> : null}
                  <View style={styles.dayLeft}>
                    <Text style={styles.dayNum}>{day.dayOfMonth}</Text>
                    <Text style={styles.dayName}>{day.weekdayShort}</Text>
                    {!empty ? <Text style={styles.dayClock}>⏱</Text> : null}
                  </View>
                  <View style={styles.dayCols}>
                    <DayCol
                      label="Regular"
                      value={empty ? "--" : formatDurationLabel(day.regularMinutes)}
                    />
                    <DayCol
                      label="OT"
                      value={empty ? "--" : formatDurationLabel(day.otMinutes)}
                    />
                    <DayCol
                      label="Total"
                      value={empty ? "--" : formatDurationLabel(day.totalMinutes)}
                      emphasis
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SummaryCol({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCol}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function DayCol({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.dayCol}>
      <Text style={styles.dayColLabel}>{label}</Text>
      <Text style={[styles.dayColValue, emphasis && styles.dayColTotal]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  headerBtn: {
    width: 44,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBack: {
    fontSize: 32,
    color: colors.brand,
    fontWeight: "600",
    marginTop: -4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  navArrow: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  navArrowText: {
    fontSize: 24,
    color: colors.mutedDark,
    fontWeight: "600",
  },
  rangePill: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  rangeText: {
    fontWeight: "600",
    color: colors.text,
    fontSize: 14,
  },
  todayBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  todayText: {
    color: CLOCK_BLUE,
    fontWeight: "700",
    fontSize: 14,
  },
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  summaryCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.mutedDark,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  requestsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    marginTop: 10,
    marginHorizontal: spacing.md,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  requestsLabel: {
    fontWeight: "700",
    fontSize: 15,
    color: colors.text,
  },
  requestsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reqChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reqPendingIcon: {
    color: "#EAB308",
    fontSize: 14,
  },
  reqApprovedIcon: {
    color: "#16a34a",
    fontSize: 14,
    fontWeight: "800",
  },
  reqCount: {
    fontWeight: "700",
    color: colors.text,
  },
  chevron: {
    fontSize: 20,
    color: colors.muted,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    gap: 16,
  },
  weekBlock: {
    gap: 8,
  },
  weekHeader: {
    fontSize: 12,
    color: colors.mutedDark,
    fontWeight: "600",
    marginLeft: 4,
  },
  dayCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  dayCardToday: {
    borderWidth: 0,
  },
  todayBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: CLOCK_BLUE,
  },
  dayLeft: {
    width: 52,
    alignItems: "center",
    gap: 2,
  },
  dayNum: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  dayName: {
    fontSize: 12,
    color: colors.mutedDark,
    fontWeight: "600",
  },
  dayClock: {
    fontSize: 11,
    color: "#EAB308",
    marginTop: 2,
  },
  dayCols: {
    flex: 1,
    flexDirection: "row",
  },
  dayCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  dayColLabel: {
    fontSize: 11,
    color: colors.mutedDark,
    fontWeight: "500",
  },
  dayColValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  dayColTotal: {
    color: CLOCK_BLUE,
  },
});
