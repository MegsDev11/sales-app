import { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { API_PATHS, type ClientInstallationDto } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { useAuth } from "../../src/auth";
import { Card, Loading, Muted, PrimaryButton, Screen, Title } from "../../src/ui";

export default function ClientHome() {
  const { me, signOut } = useAuth();
  const [packageTier, setPackageTier] = useState<string | null>(null);
  const [installations, setInstallations] = useState<ClientInstallationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const data = await apiFetch(API_PATHS.mobileClientMe);
          setPackageTier(data.packageTier ?? null);
          setInstallations(data.installations ?? []);
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
      <Title>{me?.client?.clientName ?? "My service"}</Title>
      <Muted>Package: {packageTier ?? "—"}</Muted>
      {error ? <Muted>{error}</Muted> : null}
      <FlatList
        data={installations}
        keyExtractor={(i) => i.itemId}
        contentContainerStyle={{ gap: 10, paddingVertical: 12 }}
        ListEmptyComponent={<Muted>No installation linked yet. Contact MEGS support.</Muted>}
        renderItem={({ item }) => (
          <Card>
            <Text style={{ fontWeight: "700" }}>{item.productName}</Text>
            <Muted>Serial: {item.serialNumber || "—"}</Muted>
            <View style={{ gap: 4, marginTop: 6 }}>
              <Text>SSID: {item.wifiName || "—"}</Text>
              <Text>WiFi password: {item.wifiPassword || "—"}</Text>
              <Text>PPPoE: {item.clientPppoe || "—"}</Text>
            </View>
          </Card>
        )}
      />
      <PrimaryButton
        label="Sign out"
        onPress={async () => {
          await signOut();
          router.replace("/(auth)/login");
        }}
      />
    </Screen>
  );
}
