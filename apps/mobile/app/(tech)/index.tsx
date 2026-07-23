import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { API_PATHS, type TimeEntry, type TimeOffRequest } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { buildWeeklyHours } from "../../src/lib/weekly-hours";
import { useAuth } from "../../src/auth";
import { colors, spacing } from "../../src/theme";
import {
  AlertBanner,
  Avatar,
  DashboardScreen,
  QuickAction,
  WeeklyHoursCard,
  greetingForNow,
} from "../../src/tech-ui";
import { Loading } from "../../src/ui";

export default function TechHome() {
  const { me } = useAuth();
  const name = me?.user?.name ?? "Technician";
  const firstName = name.split(/\s+/)[0] ?? name;
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [timeOff, setTimeOff] = useState<TimeOffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobCount, setJobCount] = useState(0);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const [timeData, jobsData, leaveData] = await Promise.all([
        apiFetch(API_PATHS.mobileTechTime),
        apiFetch(API_PATHS.mobileTechJobs),
        apiFetch(API_PATHS.mobileTechTimeOff).catch(() => ({ requests: [] })),
      ]);
      const list = (timeData.entries ?? []) as TimeEntry[];
      const open = (timeData.active as TimeEntry | null) ?? null;
      const merged =
        open && !list.some((e) => e.id === open.id) ? [open, ...list] : list;
      setActive(open);
      setEntries(merged);
      setTimeOff((leaveData.requests ?? []) as TimeOffRequest[]);
      setJobCount((jobsData.jobs ?? []).length);
      setNow(new Date());
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

  // Live-update weekly hours while clocked in
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [active?.id]);

  const week = useMemo(() => buildWeeklyHours(entries, now), [entries, now]);

  const leaveSummary = useMemo(() => {
    const approved = timeOff.filter((r) => r.status === "approved");
    const pending = timeOff.filter((r) => r.status === "pending");
    const declined = timeOff.filter((r) => r.status === "declined");
    const days = (type: string) =>
      approved.filter((r) => r.leaveType === type).reduce((n, r) => n + r.days, 0);
    return {
      pendingCount: pending.length,
      latestDecision: [...declined, ...approved].sort(
        (a, b) =>
          new Date(b.reviewedAt ?? b.updatedAt).getTime() -
          new Date(a.reviewedAt ?? a.updatedAt).getTime()
      )[0] as TimeOffRequest | undefined,
      chips: [
        { label: "Family", value: `${days("family")}d`, tone: "#F97316" },
        {
          label: "Time Off",
          value: pending.length ? `${pending.length} pending` : `${days("time_off")}d`,
        },
        { label: "Sick leave", value: `${days("sick")}d` },
        { label: "Unpaid", value: `${days("unpaid")}d` },
      ],
    };
  }, [timeOff]);

  if (loading) return <Loading />;

  return (
    <DashboardScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Avatar name={name} size={48} />
            <Text style={styles.greeting}>
              {greetingForNow()}, {firstName} 👋
            </Text>
          </View>
          <Pressable style={styles.bell}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {jobCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{Math.min(jobCount, 99)}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.quickRow}>
          <QuickAction
            label="Updates"
            icon="✉️"
            bg={colors.accentSoft}
            onPress={() => router.push("/(tech)/search")}
          />
          <QuickAction
            label="Time Clock"
            icon="💼"
            bg={colors.pinkSoft}
            onPress={() => router.push("/(tech)/clock")}
          />
        </View>

        {!active ? (
          <AlertBanner
            title="Please submit your timesheet"
            body="Clock in when you start your shift"
            onOpen={() => router.push("/(tech)/clock")}
          />
        ) : (
          <AlertBanner
            title="You're clocked in"
            body={`Since ${new Date(active.clockInAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`}
            onOpen={() => router.push("/(tech)/clock")}
          />
        )}

        <WeeklyHoursCard
          days={week.days}
          totalLabel={week.totalLabel}
          progress={week.progress}
        />

        <View style={styles.timeOffCard}>
          <Pressable
            style={styles.timeOffHeader}
            onPress={() => router.push("/(tech)/time-off")}
          >
            <Text style={styles.sectionTitle}>Time Off</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          {leaveSummary.latestDecision ? (
            <View
              style={[
                styles.decisionBanner,
                {
                  backgroundColor:
                    leaveSummary.latestDecision.status === "approved"
                      ? "#dcfce7"
                      : "#fee2e2",
                },
              ]}
            >
              <Text style={styles.decisionText}>
                {leaveSummary.latestDecision.status === "approved"
                  ? "Approved"
                  : "Declined"}
                : {leaveSummary.latestDecision.startDate} →{" "}
                {leaveSummary.latestDecision.endDate}
                {leaveSummary.latestDecision.reviewNote
                  ? ` — ${leaveSummary.latestDecision.reviewNote}`
                  : ""}
              </Text>
            </View>
          ) : null}
          {leaveSummary.pendingCount > 0 ? (
            <Text style={styles.pendingText}>
              {leaveSummary.pendingCount} request
              {leaveSummary.pendingCount === 1 ? "" : "s"} waiting for Coordination
            </Text>
          ) : null}
          <View style={styles.timeOffRow}>
            {leaveSummary.chips.map((item) => (
              <View key={item.label} style={styles.timeOffChip}>
                <Text style={styles.timeOffLabel}>{item.label}</Text>
                <Text
                  style={[
                    styles.timeOffValue,
                    item.tone ? { color: item.tone } : null,
                  ]}
                >
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
          <Pressable
            style={styles.requestBtn}
            onPress={() => router.push("/(tech)/time-off")}
          >
            <Text style={styles.requestBtnText}>Request time off</Text>
          </Pressable>
        </View>
      </ScrollView>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  greeting: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    flexShrink: 1,
  },
  bell: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.badge,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  quickRow: {
    flexDirection: "row",
    gap: 12,
  },
  timeOffCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    gap: 12,
  },
  timeOffHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chevron: {
    fontSize: 22,
    color: colors.muted,
    lineHeight: 22,
  },
  decisionBanner: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  decisionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  pendingText: {
    fontSize: 13,
    color: colors.unknown,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  timeOffRow: {
    flexDirection: "row",
    gap: 8,
  },
  timeOffChip: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 10,
    minHeight: 64,
    justifyContent: "space-between",
  },
  timeOffLabel: {
    fontSize: 11,
    color: colors.mutedDark,
    fontWeight: "600",
  },
  timeOffValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginTop: 8,
  },
  requestBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  requestBtnText: {
    fontWeight: "600",
    color: colors.text,
  },
});
