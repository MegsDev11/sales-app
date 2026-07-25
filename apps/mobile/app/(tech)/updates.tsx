import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import {
  API_PATHS,
  type FieldJob,
  type JobSource,
  type JobStatus,
  type Vehicle,
} from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { useAuth } from "../../src/auth";
import { colors, spacing } from "../../src/theme";
import {
  DashboardScreen,
  GradientJobCard,
  formatDayMonthYear,
} from "../../src/tech-ui";
import { EmptyState, Loading, Muted, PrimaryButton } from "../../src/ui";

const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  en_route: "En route",
  on_site: "On site",
  completed: "Completed",
  cancelled: "Cancelled",
};

const SOURCE_LABELS: Record<JobSource, string> = {
  coordination: "Coordination",
  owner: "From owner",
  support: "From support",
};

type Section = "jobs" | "vehicles";

export default function TechUpdates() {
  const { me } = useAuth();
  const [section, setSection] = useState<Section>("jobs");
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [jobsData, vehiclesData] = await Promise.all([
        apiFetch(API_PATHS.mobileTechJobs),
        apiFetch(API_PATHS.mobileTechVehicles).catch(() => ({ vehicles: [] })),
      ]);
      setJobs(jobsData.jobs ?? []);
      setVehicles(vehiclesData.vehicles ?? []);
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

  if (loading) return <Loading />;

  return (
    <DashboardScreen>
      <View style={styles.top}>
        <Text style={styles.title}>Updates</Text>
        <Muted>
          {section === "jobs"
            ? "Job cards assigned to your technician account"
            : "Your vehicles — scan QR to log fuel"}
        </Muted>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.segment}>
          <Pressable
            onPress={() => setSection("jobs")}
            style={[styles.segBtn, section === "jobs" && styles.segBtnActive]}
          >
            <Text style={[styles.segText, section === "jobs" && styles.segTextActive]}>
              Jobs
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSection("vehicles")}
            style={[styles.segBtn, section === "vehicles" && styles.segBtnActive]}
          >
            <Text
              style={[styles.segText, section === "vehicles" && styles.segTextActive]}
            >
              Vehicles
            </Text>
          </Pressable>
        </View>
      </View>

      {section === "jobs" ? (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title="No jobs assigned yet"
              body="Coordination will dispatch jobs to your account — they appear here."
            />
          }
          renderItem={({ item, index }) => (
            <GradientJobCard
              index={index}
              title={item.title || "Technician Job Card"}
              subtitle={[item.clientName, item.address].filter(Boolean).join(" · ")}
              authorName={me?.user?.name}
              dateLabel={formatDayMonthYear(
                item.scheduledStart
                  ? new Date(item.scheduledStart)
                  : new Date(item.createdAt)
              )}
              category="Jobs"
              statusLabel={STATUS_LABELS[item.status] ?? item.status}
              sourceLabel={
                item.source && item.source !== "coordination"
                  ? SOURCE_LABELS[item.source]
                  : undefined
              }
              onPress={() => router.push(`/(tech)/job/${item.id}`)}
            />
          )}
        />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.id}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              <PrimaryButton
                label="Scan vehicle QR"
                onPress={() => router.push("/(tech)/vehicle-scan")}
              />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title="No vehicles assigned"
              body="Stock can register a vehicle QR with you as driver — or scan any fleet QR to log fuel."
            />
          }
          renderItem={({ item, index }) => (
            <GradientJobCard
              index={index}
              title={`${item.brand || "Vehicle"} · ${item.numberPlate}`}
              subtitle="Tap to log fuel"
              authorName={me?.user?.name}
              dateLabel={formatDayMonthYear(new Date(item.createdAt))}
              category="Vehicles"
              statusLabel="Fuel"
              onPress={() =>
                router.push(`/(tech)/vehicle-fuel/${encodeURIComponent(item.qrToken)}`)
              }
            />
          )}
        />
      )}
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 4,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },
  segment: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  segBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingVertical: 10,
    alignItems: "center",
  },
  segBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  segText: {
    fontWeight: "700",
    color: colors.mutedDark,
  },
  segTextActive: {
    color: colors.accentDeep,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: 32,
    paddingTop: 12,
    gap: 12,
    flexGrow: 1,
  },
  error: {
    color: colors.offline,
    marginTop: 6,
  },
});
