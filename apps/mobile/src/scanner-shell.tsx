import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { extractStockQrToken } from "@megs/shared";
import { Field, Muted, PrimaryButton, Screen, Title } from "./ui";

export function ScannerShell({
  title,
  help,
  onToken,
}: {
  title: string;
  help: string;
  onToken: (token: string) => Promise<void>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  async function handleRaw(raw: string) {
    if (busy || locked) return;
    const token = extractStockQrToken(raw);
    if (!token) return;
    setBusy(true);
    setLocked(true);
    try {
      await onToken(token);
    } catch (e) {
      Alert.alert("Scan failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
      setTimeout(() => setLocked(false), 1500);
    }
  }

  if (!permission?.granted) {
    return (
      <Screen>
        <Title>{title}</Title>
        <Muted>Camera permission is required to scan QR codes.</Muted>
        <PrimaryButton label="Allow camera" onPress={() => void requestPermission()} />
        <Field label="Or paste token / URL" value={manual} onChangeText={setManual} />
        <PrimaryButton label="Submit" disabled={busy} onPress={() => void handleRaw(manual)} />
      </Screen>
    );
  }

  return (
    <Screen style={{ padding: 0 }}>
      <View style={{ padding: 16, gap: 6 }}>
        <Title>{title}</Title>
        <Muted>{help}</Muted>
      </View>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => void handleRaw(data)}
      />
      <View style={{ padding: 16, gap: 8 }}>
        <Field label="Manual entry" value={manual} onChangeText={setManual} />
        <PrimaryButton
          label={busy ? "Working…" : "Submit token"}
          disabled={busy}
          onPress={() => void handleRaw(manual)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, minHeight: 280 },
});
