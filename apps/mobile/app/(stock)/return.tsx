import { Alert } from "react-native";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { ScannerShell } from "../../src/scanner-shell";

export default function ReturnScreen() {
  return (
    <ScannerShell
      title="Return"
      help="Scan a booked-out unit to return it to available stock."
      onToken={async (token) => {
        await apiFetch(API_PATHS.stock, {
          method: "POST",
          body: JSON.stringify({ action: "returnByQr", qrToken: token }),
        });
        Alert.alert("Returned", "Unit is available again.");
      }}
    />
  );
}
