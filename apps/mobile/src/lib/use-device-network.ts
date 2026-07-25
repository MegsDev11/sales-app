import { useEffect, useState } from "react";
import { Platform } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import * as Location from "expo-location";

export type DeviceNetworkKind = "wifi" | "cellular" | "none" | "unknown" | "other";

export type DeviceNetwork = {
  kind: DeviceNetworkKind;
  /** Wi‑Fi SSID when the OS allows reading it; null on web / without permission. */
  ssid: string | null;
  /** Carrier name when on cellular (Android/iOS when available). */
  carrier: string | null;
  /** Human label for the network the phone is on right now. */
  label: string;
  /** True when the test is almost certainly not on home Wi‑Fi. */
  isMobileData: boolean;
  permissionNeeded: boolean;
};

const idle: DeviceNetwork = {
  kind: "unknown",
  ssid: null,
  carrier: null,
  label: "Checking…",
  isMobileData: false,
  permissionNeeded: false,
};

function mapState(state: NetInfoState, permissionNeeded: boolean): DeviceNetwork {
  if (!state.isConnected) {
    return {
      kind: "none",
      ssid: null,
      carrier: null,
      label: "Offline",
      isMobileData: false,
      permissionNeeded: false,
    };
  }

  if (state.type === "wifi") {
    const ssid =
      state.details && "ssid" in state.details && typeof state.details.ssid === "string"
        ? state.details.ssid.replace(/^"|"$/g, "").trim() || null
        : null;
    if (ssid) {
      return {
        kind: "wifi",
        ssid,
        carrier: null,
        label: ssid,
        isMobileData: false,
        permissionNeeded: false,
      };
    }
    return {
      kind: "wifi",
      ssid: null,
      carrier: null,
      label:
        Platform.OS === "web"
          ? "Wi‑Fi (name not available in browser)"
          : permissionNeeded
            ? "Wi‑Fi (allow location to show name)"
            : "Wi‑Fi",
      isMobileData: false,
      permissionNeeded,
    };
  }

  if (state.type === "cellular") {
    const carrier =
      state.details &&
      "carrier" in state.details &&
      typeof state.details.carrier === "string" &&
      state.details.carrier
        ? state.details.carrier
        : null;
    return {
      kind: "cellular",
      ssid: null,
      carrier,
      label: carrier ? `Mobile data · ${carrier}` : "Mobile data",
      isMobileData: true,
      permissionNeeded: false,
    };
  }

  if (state.type === "none" || state.type === "unknown") {
    return {
      kind: state.type === "none" ? "none" : "unknown",
      ssid: null,
      carrier: null,
      label: state.type === "none" ? "Offline" : "Checking…",
      isMobileData: false,
      permissionNeeded: false,
    };
  }

  return {
    kind: "other",
    ssid: null,
    carrier: null,
    label: state.type.replace(/_/g, " "),
    isMobileData: false,
    permissionNeeded: false,
  };
}

async function ensureWifiNamePermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return false;
    const asked = await Location.requestForegroundPermissionsAsync();
    return !asked.granted;
  } catch {
    return true;
  }
}

/** Live network the phone is using (SSID / mobile data), not the installed router record. */
export function useDeviceNetwork(): DeviceNetwork {
  const [network, setNetwork] = useState<DeviceNetwork>(idle);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const permissionNeeded = await ensureWifiNamePermission();
      if (cancelled) return;

      const apply = (state: NetInfoState) => {
        if (!cancelled) setNetwork(mapState(state, permissionNeeded));
      };

      apply(await NetInfo.fetch());
      unsubscribe = NetInfo.addEventListener(apply);
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return network;
}

export function deviceNetworkReportLine(network: DeviceNetwork): string {
  if (network.kind === "wifi" && network.ssid) {
    return `Phone network: Wi‑Fi “${network.ssid}”`;
  }
  if (network.kind === "wifi") {
    return "Phone network: Wi‑Fi (SSID unavailable)";
  }
  if (network.kind === "cellular") {
    return network.carrier
      ? `Phone network: Mobile data (${network.carrier})`
      : "Phone network: Mobile data";
  }
  if (network.kind === "none") return "Phone network: Offline";
  return `Phone network: ${network.label}`;
}
