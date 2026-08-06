import { Alert } from "react-native";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { ScannerShell } from "../../src/scanner-shell";

/**
 * Issue PPE by scan.
 *
 * No pick list and no client: a hard hat or harness goes to the person
 * scanning it. Returning it uses the ordinary Return tab.
 */
export default function PpeScreen() {
  return (
    <ScannerShell
      title="Issue PPE"
      help="Scan the PPE label to sign it out to yourself."
      onToken={async (token) => {
        const res = await apiFetch(API_PATHS.stock, {
          method: "POST",
          body: JSON.stringify({ action: "issuePpe", qrToken: token }),
        });
        Alert.alert(
          "Signed out",
          `${res?.productName ?? "PPE"} is now issued to ${res?.issuedTo ?? "you"}.`
        );
      }}
    />
  );
}
