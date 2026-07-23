import { Alert } from "react-native";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { ScannerShell } from "../../src/scanner-shell";

export default function BookInScreen() {
  return (
    <ScannerShell
      title="Book in"
      help="Scan a pending QR label to claim it into inventory."
      onToken={async (token) => {
        await apiFetch(API_PATHS.stock, {
          method: "POST",
          body: JSON.stringify({ action: "claimQrLabel", qrToken: token }),
        });
        Alert.alert("Booked in", "Label claimed into inventory.");
      }}
    />
  );
}
