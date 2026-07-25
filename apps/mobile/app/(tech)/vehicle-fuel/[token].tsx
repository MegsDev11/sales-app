import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, router } from "expo-router";
import { API_PATHS, type Vehicle } from "@megs/shared";
import { apiFetch } from "../../../src/lib/api";
import { colors, spacing } from "../../../src/theme";
import { Loading, Muted, PrimaryButton, Screen, Title } from "../../../src/ui";

export default function VehicleFuelScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = decodeURIComponent(String(rawToken ?? ""));
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [litres, setLitres] = useState("");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch(
        `${API_PATHS.mobileTechVehicles}?token=${encodeURIComponent(token)}`
      );
      setVehicle(data.vehicle ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vehicle not found");
      setVehicle(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  async function submit() {
    if (!vehicle) return;
    const litresN = Number(litres);
    const priceN = Number(price);
    if (!Number.isFinite(litresN) || litresN <= 0) {
      Alert.alert("Litres", "Enter litres greater than 0");
      return;
    }
    if (!location.trim()) {
      Alert.alert("Where", "Enter where you filled up");
      return;
    }
    if (!Number.isFinite(priceN) || priceN < 0) {
      Alert.alert("Price", "Enter the fuel price (total R)");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(API_PATHS.mobileTechFuel, {
        method: "POST",
        body: JSON.stringify({
          vehicleId: vehicle.id,
          litres: litresN,
          location: location.trim(),
          price: priceN,
        }),
      });
      Alert.alert("Saved", "Fuel entry sent to Financial", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Title>Log fuel</Title>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {vehicle ? (
        <>
          <Muted>
            {vehicle.brand || "Vehicle"} · {vehicle.numberPlate}
            {vehicle.technicianName ? ` · Driver ${vehicle.technicianName}` : ""}
          </Muted>
          <View style={styles.fields}>
            <Text style={styles.label}>Litres</Text>
            <TextInput
              value={litres}
              onChangeText={setLitres}
              placeholder="e.g. 45"
              keyboardType="decimal-pad"
              style={styles.input}
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.label}>Where</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Engen Bela-Bela"
              style={styles.input}
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.label}>Price (R total)</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="e.g. 980.50"
              keyboardType="decimal-pad"
              style={styles.input}
              placeholderTextColor={colors.muted}
            />
            <PrimaryButton
              label={busy ? "Saving…" : "Submit fuel"}
              disabled={busy}
              onPress={() => void submit()}
            />
          </View>
        </>
      ) : (
        <Muted>Scan a valid vehicle QR to log fuel.</Muted>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    color: colors.brand,
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 8,
  },
  error: {
    color: colors.offline,
    marginVertical: 8,
  },
  fields: {
    marginTop: spacing.md,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedDark,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    fontSize: 16,
    color: colors.text,
  },
});
