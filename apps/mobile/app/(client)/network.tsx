import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { Card, Loading, Muted, Screen, StatusChip, Title } from "../../src/ui";

export default function ClientNetwork() {
  const [layout, setLayout] = useState<{
    title: string;
    canvas: { nodes: { id: string; kind: string; label: string }[] };
  } | null>(null);
  const [devices, setDevices] = useState<
    { id: string; nodeId: string; label: string; status: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const data = await apiFetch(API_PATHS.mobileClientLayout);
          setLayout(data.layout);
          setDevices(data.devices ?? []);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  if (loading) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <Title>Network layout</Title>
        <Muted>Published diagram devices and online status</Muted>
        {error ? <Muted>{error}</Muted> : null}
        {!layout ? (
          <Muted>No published layout for your account yet.</Muted>
        ) : (
          <Card>
            <Text style={{ fontWeight: "700" }}>{layout.title}</Text>
            <Muted>{layout.canvas?.nodes?.length ?? 0} nodes on layout</Muted>
          </Card>
        )}
        {devices.map((d) => (
          <Card key={d.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "600" }}>{d.label || d.nodeId}</Text>
              <StatusChip
                label={d.status}
                tone={
                  d.status === "online" ? "ok" : d.status === "offline" ? "bad" : "warn"
                }
              />
            </View>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
