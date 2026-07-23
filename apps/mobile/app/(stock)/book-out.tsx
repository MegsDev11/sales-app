import { Alert } from "react-native";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { ScannerShell } from "../../src/scanner-shell";

export default function BookOutScreen() {
  return (
    <ScannerShell
      title="Book out"
      help="Scan a unit QR to fulfill an open pick-list line."
      onToken={async (token) => {
        await apiFetch(API_PATHS.stock, {
          method: "POST",
          body: JSON.stringify({ action: "fulfillScan", qrToken: token }),
        });
        Alert.alert("Booked out", "Unit assigned from pick list.");
      }}
    />
  );
}
