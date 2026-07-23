import type { NetworkDeviceStatus } from "@/lib/wireless/layout-types";

export interface RuijieDeviceSnapshot {
  externalId: string;
  serialNumber: string | null;
  macAddress: string | null;
  name: string;
  status: NetworkDeviceStatus;
  lastSeenAt: string | null;
}

export interface RuijieSyncResult {
  configured: boolean;
  ok: boolean;
  message: string;
  devices: RuijieDeviceSnapshot[];
}

function getConfig() {
  const appId = process.env.RUIJIE_APP_ID?.trim() ?? "";
  const appSecret = process.env.RUIJIE_APP_SECRET?.trim() ?? "";
  const baseUrl = (
    process.env.RUIJIE_CLOUD_BASE_URL?.trim() ||
    "https://cloud.ruijienetworks.com"
  ).replace(/\/$/, "");
  return { appId, appSecret, baseUrl, configured: Boolean(appId && appSecret) };
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Ruijie API returned non-JSON (${res.status})`);
  }
}

function extractToken(payload: Record<string, unknown>): string | null {
  const direct =
    (payload.accessToken as string | undefined) ||
    (payload.access_token as string | undefined) ||
    ((payload.data as Record<string, unknown> | undefined)?.accessToken as string | undefined) ||
    ((payload.data as Record<string, unknown> | undefined)?.access_token as string | undefined);
  return direct || null;
}

function normalizeStatus(value: unknown): NetworkDeviceStatus {
  if (value === true || value === 1 || value === "1" || value === "online" || value === "ONLINE") {
    return "online";
  }
  if (value === false || value === 0 || value === "0" || value === "offline" || value === "OFFLINE") {
    return "offline";
  }
  return "unknown";
}

function mapDevice(raw: Record<string, unknown>): RuijieDeviceSnapshot | null {
  const externalId = String(
    raw.serialNumber ??
      raw.serial_number ??
      raw.sn ??
      raw.deviceSn ??
      raw.mac ??
      raw.macAddress ??
      raw.deviceId ??
      raw.id ??
      ""
  ).trim();
  if (!externalId) return null;

  const online =
    raw.onlineStatus ??
    raw.isOnline ??
    raw.is_online ??
    raw.online ??
    raw.status;

  return {
    externalId,
    serialNumber: (raw.serialNumber ?? raw.serial_number ?? raw.sn ?? null) as string | null,
    macAddress: (raw.mac ?? raw.macAddress ?? raw.mac_address ?? null) as string | null,
    name: String(raw.aliasName ?? raw.name ?? raw.productType ?? externalId),
    status: normalizeStatus(online),
    lastSeenAt: (raw.lastOnline ?? raw.last_seen_at ?? raw.lastSeen ?? null) as string | null,
  };
}

function extractDeviceList(payload: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [
    payload.deviceList,
    payload.devices,
    (payload.data as Record<string, unknown> | undefined)?.deviceList,
    (payload.data as Record<string, unknown> | undefined)?.devices,
    payload.data,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Record<string, unknown>[];
  }
  return [];
}

/**
 * Ruijie Cloud adapter. Credentials: RUIJIE_APP_ID / RUIJIE_APP_SECRET
 * (optional RUIJIE_CLOUD_BASE_URL). Apply for API access via service_rj@ruijienetworks.com.
 */
export async function syncRuijieDevices(): Promise<RuijieSyncResult> {
  const { appId, appSecret, baseUrl, configured } = getConfig();
  if (!configured) {
    return {
      configured: false,
      ok: false,
      message: "Ruijie not configured — set RUIJIE_APP_ID and RUIJIE_APP_SECRET",
      devices: [],
    };
  }

  try {
    const tokenPaths = [
      `/service/api/intl/auth?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
      `/service/api/token/refresh?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
    ];

    let token: string | null = null;
    let lastError = "Failed to authenticate with Ruijie Cloud";
    for (const path of tokenPaths) {
      try {
        const auth = await fetchJson(`${baseUrl}${path}`);
        const code = auth.code;
        if (code !== undefined && code !== 0 && code !== "0") {
          lastError = String(auth.msg ?? auth.message ?? `Auth code ${code}`);
          continue;
        }
        token = extractToken(auth);
        if (token) break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    if (!token) {
      return { configured: true, ok: false, message: lastError, devices: [] };
    }

    const devicesPayload = await fetchJson(
      `${baseUrl}/service/api/maint/devices?access_token=${encodeURIComponent(token)}`
    );
    const code = devicesPayload.code;
    if (code !== undefined && code !== 0 && code !== "0") {
      return {
        configured: true,
        ok: false,
        message: String(devicesPayload.msg ?? devicesPayload.message ?? `Devices code ${code}`),
        devices: [],
      };
    }

    const devices = extractDeviceList(devicesPayload)
      .map(mapDevice)
      .filter((d): d is RuijieDeviceSnapshot => Boolean(d));

    return {
      configured: true,
      ok: true,
      message: `Synced ${devices.length} Ruijie device(s)`,
      devices,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      message: err instanceof Error ? err.message : "Ruijie sync failed",
      devices: [],
    };
  }
}

export function isRuijieConfigured(): boolean {
  return getConfig().configured;
}
