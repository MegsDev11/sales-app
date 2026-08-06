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
  const [odometer, setOdometer] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Custody (migration 069): who has this vehicle, and the last reading we
  // know, so the tech confirms rather than remembers.
  const [booking, setBooking] = useState<{
    technicianName: string | null;
    odometerStart: number | null;
    isMine: boolean;
  } | null>(null);
  const [lastOdometer, setLastOdometer] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch(
        `${API_PATHS.mobileTechVehicles}?token=${encodeURIComponent(token)}`
      );
      setVehicle(data.vehicle ?? null);
      setBooking(data.booking ?? null);
      setLastOdometer(data.lastOdometer ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vehicle not found");
      setVehicle(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  async function book(action: "bookOut" | "bookIn") {
    if (!vehicle) return;
    const reading = odometer.trim() === "" ? null : Number(odometer);
    if (reading != null && (!Number.isFinite(reading) || reading < 0)) {
      Alert.alert("Odometer", "Enter the reading as a whole number of kilometres");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(API_PATHS.mobileTechVehicles, {
        method: "POST",
        body: JSON.stringify({ action, vehicleId: vehicle.id, odometer: reading }),
      });
      setOdometer("");
      await load();
      Alert.alert(
        action === "bookOut" ? "Booked out" : "Booked in",
        action === "bookOut"
          ? "The vehicle is signed out to you."
          : "Thanks — the vehicle is back in the pool."
      );
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  async function sendFuel(litresN: number, priceN: number, locationTrimmed: string) {
    if (!vehicle) return;
    setBusy(true);
    try {
      await apiFetch(API_PATHS.mobileTechFuel, {
        method: "POST",
        body: JSON.stringify({
          vehicleId: vehicle.id,
          litres: litresN,
          location: locationTrimmed,
          price: priceN,
          // Shared with the custody field above: one reading serves both.
          odometerKm: odometer.trim() === "" ? null : Number(odometer),
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

  function confirmAndSubmit() {
    if (!vehicle || busy) return;
    const litresN = Number(litres);
    const priceN = Number(price);
    const locationTrimmed = location.trim();
    if (!Number.isFinite(litresN) || litresN <= 0) {
      Alert.alert("Litres", "Enter litres greater than 0");
      return;
    }
    if (!locationTrimmed) {
      Alert.alert("Where", "Enter where you filled up");
      return;
    }
    if (!Number.isFinite(priceN) || priceN < 0) {
      Alert.alert("Price", "Enter the fuel price (total R)");
      return;
    }

    const perL = litresN > 0 ? priceN / litresN : 0;
    const plate = [vehicle.brand, vehicle.numberPlate].filter(Boolean).join(" · ");
    Alert.alert(
      "Confirm fuel entry",
      [
        plate,
        "",
        `Litres: ${litresN}`,
        `Where: ${locationTrimmed}`,
        `Price: R ${priceN.toFixed(2)}`,
        `≈ R ${perL.toFixed(2)}/L`,
        "",
        "Is this correct?",
      ].join("\n"),
      [
        { text: "Edit", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => void sendFuel(litresN, priceN, locationTrimmed),
        },
      ]
    );
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

          {/* Custody first: who has the key right now. */}
          <View style={styles.fields}>
            <Muted>
              {booking
                ? booking.isMine
                  ? "You have this vehicle booked out."
                  : `Booked out to ${booking.technicianName ?? "another technician"}.`
                : "This vehicle is available."}
              {lastOdometer != null ? ` Last reading ${lastOdometer} km.` : ""}
            </Muted>
            <Text style={styles.label}>Odometer (km)</Text>
            <TextInput
              value={odometer}
              onChangeText={setOdometer}
              placeholder={lastOdometer != null ? `e.g. ${lastOdometer + 120}` : "e.g. 148320"}
              keyboardType="number-pad"
              style={styles.input}
              placeholderTextColor={colors.muted}
            />
            {booking?.isMine ? (
              <PrimaryButton
                label={busy ? "Saving…" : "Book in (return)"}
                disabled={busy}
                onPress={() => void book("bookIn")}
              />
            ) : booking ? null : (
              <PrimaryButton
                label={busy ? "Saving…" : "Book out to me"}
                disabled={busy}
                onPress={() => void book("bookOut")}
              />
            )}
          </View>

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
              onPress={confirmAndSubmit}
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
