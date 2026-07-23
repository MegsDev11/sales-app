import { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect, router } from "expo-router";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { useAuth } from "../../src/auth";
import { Card, Loading, Muted, PrimaryButton, Screen, Title } from "../../src/ui";

export default function StockHome() {
  const { signOut } = useAuth();
  const [summary, setSummary] = useState<{
    available: number;
    bookedOut: number;
    openRequests: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void (async () => {
        try {
          const data = await apiFetch(API_PATHS.mobileStockSummary);
          setSummary(data);
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
      <Title>Stock</Title>
      <Muted>Inventory at a glance</Muted>
      {error ? <Muted>{error}</Muted> : null}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Card style={{ flex: 1 }}>
          <Muted>Available</Muted>
          <Title>{summary?.available ?? "—"}</Title>
        </Card>
        <Card style={{ flex: 1 }}>
          <Muted>Booked out</Muted>
          <Title>{summary?.bookedOut ?? "—"}</Title>
        </Card>
      </View>
      <Card style={{ marginTop: 8 }}>
        <Muted>Open pick lists</Muted>
        <Title>{summary?.openRequests ?? "—"}</Title>
      </Card>
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
