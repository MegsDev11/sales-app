import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { ScannerShell } from "../../src/scanner-shell";
import { Card, Loading, Muted, PrimaryButton, Screen, Title } from "../../src/ui";

/**
 * Book out by QR — two steps, because fulfillScan requires a pick list:
 * choose the open pick list first, then every scan fulfils a line on it.
 * (This screen used to scan without a requestId, which the server rejects,
 * so mobile book-out never worked.)
 */

interface PickList {
  id: string;
  title: string;
  status: string;
  technicianName: string;
  clientName: string;
  outstanding: number;
}

export default function BookOutScreen() {
  const [requests, setRequests] = useState<PickList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PickList | null>(null);

  useFocusEffect(
    useCallback(() => {
      setSelected(null);
      void (async () => {
        try {
          const data = await apiFetch(API_PATHS.mobileStockRequests);
          setRequests(data.requests ?? []);
          setError(null);
        } catch (e) {
          setRequests([]);
          setError(e instanceof Error ? e.message : "Failed to load pick lists");
        }
      })();
    }, [])
  );

  if (selected) {
    return (
      <View style={{ flex: 1 }}>
        <ScannerShell
          title={`Book out — ${selected.title}`}
          help={`For ${selected.technicianName}${
            selected.clientName ? ` · ${selected.clientName}` : ""
          }. ${selected.outstanding} unit${selected.outstanding === 1 ? "" : "s"} still needed. Scan a unit QR to fulfil a line.`}
          onToken={async (token) => {
            await apiFetch(API_PATHS.stock, {
              method: "POST",
              body: JSON.stringify({
                action: "fulfillScan",
                qrToken: token,
                requestId: selected.id,
              }),
            });
            Alert.alert("Booked out", "Unit assigned from the pick list.");
          }}
        />
        <View style={{ padding: 16 }}>
          <PrimaryButton label="Change pick list" onPress={() => setSelected(null)} />
        </View>
      </View>
    );
  }

  if (requests === null) return <Loading />;

  return (
    <Screen>
      <Title>Book out</Title>
      <Muted>Pick the open pick list you are filling, then scan each unit.</Muted>
      {error ? <Muted>{error}</Muted> : null}
      {requests.length === 0 && !error ? (
        <Card style={{ marginTop: 12 }}>
          <Muted>No open pick lists. Coordination raises them from a job.</Muted>
        </Card>
      ) : (
        <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ gap: 8 }}>
          {requests.map((r) => (
            <Pressable key={r.id} onPress={() => setSelected(r)}>
              <Card>
                <Title>{r.title}</Title>
                <Muted>
                  {r.technicianName}
                  {r.clientName ? ` · ${r.clientName}` : ""}
                </Muted>
                <Muted>
                  {r.status === "partial" ? "Partially filled · " : ""}
                  {r.outstanding} unit{r.outstanding === 1 ? "" : "s"} outstanding
                </Muted>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
