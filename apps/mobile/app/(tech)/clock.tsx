import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import * as Location from "expo-location";
import { API_PATHS, type TimeEntry } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { colors, spacing } from "../../src/theme";
import { DashboardScreen } from "../../src/tech-ui";
import { Loading, Muted, PrimaryButton } from "../../src/ui";

export default function ClockScreen() {
  const [active, setActive] = useState<TimeEntry | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_PATHS.mobileTechTime);
      setActive(data.active ?? null);
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function getCoords() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return {};
    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }

  async function clock(action: "clock_in" | "clock_out") {
    setBusy(true);
    try {
      const coords = await getCoords();
      await apiFetch(API_PATHS.mobileTechTime, {
        method: "POST",
        body: JSON.stringify({ action, ...coords }),
      });
      await load();
    } catch (e) {
      Alert.alert("Clock failed", e instanceof Error ? e.message : "Try again");
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
        <Text style={styles.title}>Time Clock</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={styles.statusCard}>
        <Text style={[styles.status, { color: active ? colors.online : colors.muted }]}>
          {active ? "IN" : "OUT"}
        </Text>
        <Muted>
          {active
            ? `Since ${new Date(active.clockInAt).toLocaleTimeString()}`
            : "Not clocked in"}
        </Muted>
        <PrimaryButton
          label={busy ? "…" : active ? "Clock out" : "Clock in"}
          disabled={busy}
          onPress={() => void clock(active ? "clock_out" : "clock_in")}
        />
      </View>

      <Text style={styles.section}>Recent entries</Text>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.md, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.entry}>
            <Text style={{ fontWeight: "600" }}>
              {new Date(item.clockInAt).toLocaleString()}
            </Text>
            <Muted>
              {item.clockOutAt
                ? `Out ${new Date(item.clockOutAt).toLocaleTimeString()}`
                : "Still open"}
            </Muted>
          </View>
        )}
      />
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
  statusCard: {
    margin: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: "center",
    gap: 12,
  },
  status: {
    fontSize: 48,
    fontWeight: "800",
  },
  section: {
    marginHorizontal: spacing.md,
    marginBottom: 8,
    fontWeight: "700",
    color: colors.text,
  },
  entry: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
});
