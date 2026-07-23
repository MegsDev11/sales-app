import { useCallback, useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { API_PATHS, type FieldJob, type JobStatus } from "@megs/shared";
import { apiFetch } from "../../../src/lib/api";
import {
  Card,
  Loading,
  Muted,
  PrimaryButton,
  Screen,
  StatusChip,
  Title,
} from "../../../src/ui";
import { useFocusEffect } from "expo-router";

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<FieldJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(API_PATHS.mobileTechJobs);
      const found = (data.jobs as FieldJob[]).find((j) => j.id === id) ?? null;
      setJob(found);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function setStatus(status: JobStatus) {
    setBusy(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (status === "on_site" || status === "completed") {
        const { status: perm } = await Location.requestForegroundPermissionsAsync();
        if (perm === "granted") {
          const pos = await Location.getCurrentPositionAsync({});
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      }
      await apiFetch(API_PATHS.mobileTechJobs, {
        method: "POST",
        body: JSON.stringify({ action: "update_status", jobId: id, status, lat, lng }),
      });
      await load();
    } catch (e) {
      Alert.alert("Update failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!job) {
    return (
      <Screen>
        <Title>Job not found</Title>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{job.title}</Title>
      <StatusChip label={job.status} />
      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: "600" }}>{job.clientName}</Text>
        <Muted>{job.address}</Muted>
        {job.notes ? <Muted>{job.notes}</Muted> : null}
        {job.address ? (
          <PrimaryButton
            label="Open in maps"
            onPress={() =>
              void Linking.openURL(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`
              )
            }
          />
        ) : null}
      </Card>
      <View style={{ gap: 10, marginTop: 16 }}>
        {job.status === "scheduled" && (
          <PrimaryButton
            label="Start (en route)"
            disabled={busy}
            onPress={() => void setStatus("en_route")}
          />
        )}
        {(job.status === "scheduled" || job.status === "en_route") && (
          <PrimaryButton
            label="Arrive on site"
            disabled={busy}
            onPress={() => void setStatus("on_site")}
          />
        )}
        {job.status !== "completed" && job.status !== "cancelled" && (
          <PrimaryButton
            label="Complete job"
            disabled={busy}
            onPress={() => void setStatus("completed")}
          />
        )}
      </View>
    </Screen>
  );
}
