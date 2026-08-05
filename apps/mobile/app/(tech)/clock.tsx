import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_PATHS, type FieldJob, type TimeEntry } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import {
  formatHoursLabel,
  todayWorkMinutes,
} from "../../src/lib/weekly-hours";
import { MapBackdrop } from "../../src/map-backdrop";
import { colors, spacing } from "../../src/theme";
import { Loading } from "../../src/ui";

const CLOCK_BLUE = "#2196F3";
const FALLBACK_REGION = {
  latitude: -24.883,
  longitude: 28.294,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

type LocGate =
  | { kind: "ok"; lat: number; lng: number }
  | { kind: "denied" }
  | { kind: "disabled" }
  | { kind: "unknown" };

export default function ClockScreen() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [loc, setLoc] = useState<LocGate>({ kind: "unknown" });
  const [checkingLoc, setCheckingLoc] = useState(false);
  // Open jobs assigned to this tech: clock-in asks which one the shift is for,
  // so hours can roll up to the job — and through it, the project.
  const [myJobs, setMyJobs] = useState<FieldJob[]>([]);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_PATHS.mobileTechTime);
      const open = (data.active as TimeEntry | null) ?? null;
      const list = (data.entries ?? []) as TimeEntry[];
      const merged =
        open && !list.some((e) => e.id === open.id) ? [open, ...list] : list;
      setActive(open);
      setEntries(merged);
      setNow(new Date());
    } finally {
      setLoading(false);
    }
    try {
      const jobData = await apiFetch(API_PATHS.mobileTechJobs);
      const jobs = ((jobData.jobs ?? []) as FieldJob[]).filter(
        (j) => j.status !== "completed" && j.status !== "cancelled"
      );
      setMyJobs(jobs);
    } catch {
      setMyJobs([]);
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    setCheckingLoc(true);
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setLoc({ kind: "disabled" });
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoc({ kind: "denied" });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLoc({
        kind: "ok",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    } catch {
      setLoc({ kind: "disabled" });
    } finally {
      setCheckingLoc(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refreshLocation();
    }, [load, refreshLocation])
  );

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
    // `active?.id`, not `active`: every reload hands back a new object for the same
    // shift, and depending on it would tear down and restart the ticker each time —
    // resetting the 30s cadence so the clock could stall.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const todayLabel = useMemo(
    () => formatHoursLabel(todayWorkMinutes(entries, now)),
    [entries, now]
  );

  const showTimesheetBadge =
    !active || entries.some((e) => !e.clockOutAt && e.id !== active?.id);
  const showLocModal = loc.kind === "denied" || loc.kind === "disabled";

  const mapRegion =
    loc.kind === "ok"
      ? {
          latitude: loc.lat,
          longitude: loc.lng,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        }
      : FALLBACK_REGION;

  async function clock(action: "clock_in" | "clock_out", jobId?: string | null) {
    if (loc.kind !== "ok") {
      await refreshLocation();
      return;
    }
    // Clocking in with open jobs on the board: ask which one first. The server
    // stores time_entries.job_id, which is how hours reach the job's project.
    if (action === "clock_in" && jobId === undefined && myJobs.length > 0) {
      setJobPickerOpen(true);
      return;
    }
    setJobPickerOpen(false);
    setBusy(true);
    try {
      await apiFetch(API_PATHS.mobileTechTime, {
        method: "POST",
        body: JSON.stringify({
          action,
          lat: loc.lat,
          lng: loc.lng,
          ...(action === "clock_in" && jobId ? { jobId } : {}),
        }),
      });
      await load();
    } catch (e) {
      Alert.alert("Clock failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  async function openPermissionSettings() {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        "Open settings",
        "Turn on location for MEGS Field in your device settings."
      );
    }
  }

  if (loading) return <Loading />;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.mapWrap}>
        <MapBackdrop region={mapRegion} showUser={loc.kind === "ok"} />
        {showLocModal ? <View style={styles.mapDim} pointerEvents="none" /> : null}

        <View style={styles.topChrome}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <View style={styles.hoursPill}>
            <Text style={styles.hoursLabel}>Total work hours today</Text>
            <Text style={styles.hoursValue}>{todayLabel}</Text>
          </View>
        </View>

        {jobPickerOpen ? (
          <View style={styles.locModalWrap} pointerEvents="box-none">
            <View style={styles.locModal}>
              <Text style={styles.locModalText}>What are you clocking in for?</Text>
              <View style={styles.locActions}>
                {myJobs.slice(0, 5).map((j) => (
                  <Pressable
                    key={j.id}
                    style={styles.locOutlineBtn}
                    onPress={() => void clock("clock_in", j.id)}
                    disabled={busy}
                  >
                    <Text style={styles.locOutlineText} numberOfLines={1}>
                      {j.title}
                      {j.clientName ? ` · ${j.clientName}` : ""}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  style={styles.locOutlineBtn}
                  onPress={() => void clock("clock_in", null)}
                  disabled={busy}
                >
                  <Text style={styles.locOutlineText}>General work — no job</Text>
                </Pressable>
                <Pressable
                  style={styles.locOutlineBtn}
                  onPress={() => setJobPickerOpen(false)}
                >
                  <Text style={styles.locOutlineText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {showLocModal ? (
          <View style={styles.locModalWrap} pointerEvents="box-none">
            <View style={styles.locModal}>
              <Text style={styles.locModalText}>
                {loc.kind === "denied"
                  ? "Location permission is off. Allow location access in system settings and try again."
                  : "Location is turned off on this device. Turn on location services in system settings and try again."}
              </Text>
              <View style={styles.locActions}>
                <Pressable
                  style={styles.locOutlineBtn}
                  onPress={() => void refreshLocation()}
                  disabled={checkingLoc}
                >
                  <Text style={styles.locOutlineText}>
                    {checkingLoc ? "Checking…" : "Try Again"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.locOutlineBtn}
                  onPress={() => void openPermissionSettings()}
                >
                  <Text style={styles.locOutlineText}>
                    Go to permission settings
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.bottomSheet,
          { paddingBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
      >
        <View style={styles.clockBtnWrap}>
          <Pressable
            style={[
              styles.clockBtn,
              active ? styles.clockBtnOut : null,
              (busy || showLocModal) && styles.clockBtnDisabled,
            ]}
            disabled={busy}
            onPress={() => void clock(active ? "clock_out" : "clock_in")}
          >
            <Text style={styles.clockIcon}>{active ? "⏹" : "⏱"}</Text>
            <Text style={styles.clockLabel}>
              {busy ? "…" : active ? "Clock out" : "Clock in"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.shortcutRow}>
          <Pressable
            style={styles.shortcutCard}
            onPress={() => router.push("/(tech)/time-off")}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: "#F97316" }]}>
              <Text style={styles.shortcutIconGlyph}>✓</Text>
            </View>
            <Text style={styles.shortcutLabel}>My requests</Text>
          </Pressable>

          <Pressable
            style={styles.shortcutCard}
            onPress={() => router.push("/(tech)/timesheet")}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: "#EFF6FF" }]}>
              <Text style={{ fontSize: 20 }}>📅</Text>
            </View>
            <View style={styles.shortcutLabelRow}>
              <Text style={styles.shortcutLabel}>Timesheet</Text>
              {showTimesheetBadge ? (
                <View style={styles.shortcutBadge}>
                  <Text style={styles.shortcutBadgeText}>1</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mapWrap: {
    flex: 1,
    overflow: "hidden",
  },
  mapDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  topChrome: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(55,65,81,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  backArrow: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "600",
    marginTop: -2,
    marginLeft: -2,
  },
  hoursPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  hoursLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
    flexShrink: 1,
  },
  hoursValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginLeft: 8,
  },
  locModalWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    zIndex: 3,
  },
  locModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 20,
    width: "100%",
    maxWidth: 340,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  locModalText: {
    textAlign: "center",
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  locActions: {
    gap: 10,
  },
  locOutlineBtn: {
    borderWidth: 1.5,
    borderColor: CLOCK_BLUE,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: "center",
  },
  locOutlineText: {
    color: CLOCK_BLUE,
    fontWeight: "700",
    fontSize: 14,
  },
  bottomSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingTop: 8,
    paddingHorizontal: spacing.md,
    gap: 18,
    zIndex: 4,
  },
  clockBtnWrap: {
    alignItems: "center",
    marginTop: -52,
  },
  clockBtn: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: CLOCK_BLUE,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: CLOCK_BLUE,
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  clockBtnOut: {
    backgroundColor: "#EF4444",
  },
  clockBtnDisabled: {
    opacity: 0.55,
  },
  clockIcon: {
    fontSize: 28,
    color: "#fff",
  },
  clockLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  shortcutRow: {
    flexDirection: "row",
    gap: 12,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEF2F7",
    paddingVertical: 18,
    alignItems: "center",
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  shortcutIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutIconGlyph: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  shortcutLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shortcutLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  shortcutBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.badge,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  shortcutBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
});
