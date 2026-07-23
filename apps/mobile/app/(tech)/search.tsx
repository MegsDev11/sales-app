import { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { API_PATHS, type FieldJob } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { useAuth } from "../../src/auth";
import { colors, spacing } from "../../src/theme";
import {
  DashboardScreen,
  GradientJobCard,
  formatDayMonthYear,
} from "../../src/tech-ui";
import { EmptyState, Loading, Muted } from "../../src/ui";

export default function TechSearch() {
  const { me } = useAuth();
  const [jobs, setJobs] = useState<FieldJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch(API_PATHS.mobileTechJobs);
      setJobs(data.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
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
        <Text style={styles.title}>Jobs</Text>
        <Muted>Assigned job cards from Coordination</Muted>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No jobs yet"
            body="When Coordination assigns you a job, it appears here."
          />
        }
        renderItem={({ item, index }) => (
          <GradientJobCard
            index={index}
            title={item.title || "Technician Job Card"}
            subtitle={[item.clientName, item.address].filter(Boolean).join(" · ")}
            authorName={me?.user?.name}
            dateLabel={formatDayMonthYear(
              item.scheduledStart ? new Date(item.scheduledStart) : new Date(item.createdAt)
            )}
            category="Jobs"
            onPress={() => router.push(`/(tech)/job/${item.id}`)}
          />
        )}
      />
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
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: 32,
    paddingTop: 12,
  },
  error: {
    color: colors.offline,
    marginTop: 6,
  },
});
