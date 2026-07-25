import { router } from "expo-router";
import { extractVehicleQrToken } from "@megs/shared";
import { ScannerShell } from "../../src/scanner-shell";

export default function VehicleScanScreen() {
  return (
    <ScannerShell
      title="Scan vehicle QR"
      help="Point at the vehicle fuel QR label, or paste the token below."
      extractToken={extractVehicleQrToken}
      onToken={async (token) => {
        router.replace(`/(tech)/vehicle-fuel/${encodeURIComponent(token)}`);
      }}
    />
  );
}
