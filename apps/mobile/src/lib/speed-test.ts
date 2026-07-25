import { API_PATHS } from "@megs/shared";
import { getApiBaseUrl, supabase } from "./api";

export type SpeedTestPhase = "idle" | "ping" | "download" | "upload" | "done" | "error";

export type SpeedTestProgress = {
  phase: SpeedTestPhase;
  liveMbps: number;
  downloadMbps: number | null;
  uploadMbps: number | null;
  pingMs: number | null;
  jitterMs: number | null;
  error: string | null;
};

export type SpeedTestCallbacks = {
  onProgress: (progress: SpeedTestProgress) => void;
  signal?: AbortSignal;
};

const DOWN_BYTES = 1_500_000;
const UP_BYTES = 750_000;
const PING_ROUNDS = 3;
/** Cap React updates so the download loop stays smooth */
const UI_THROTTLE_MS = 200;

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function meanAbsDev(values: number[], center: number) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += Math.abs(v - center);
  return sum / values.length;
}

function toMbps(bytes: number, ms: number) {
  if (ms <= 0) return 0;
  return (bytes * 8) / (ms / 1000) / 1_000_000;
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function makeSpeedFetch(token: string | null) {
  return async function speedFetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
    });
    if (!res.ok && res.status !== 204) {
      const json = await res.json().catch(() => ({}));
      throw new Error(
        (json as { error?: string }).error || `Speed test failed (${res.status})`
      );
    }
    return res;
  };
}

export async function runSpeedTest({ onProgress, signal }: SpeedTestCallbacks) {
  const progress: SpeedTestProgress = {
    phase: "ping",
    liveMbps: 0,
    downloadMbps: null,
    uploadMbps: null,
    pingMs: null,
    jitterMs: null,
    error: null,
  };

  let lastUi = 0;
  const emit = (force = false) => {
    const now = performance.now();
    if (!force && now - lastUi < UI_THROTTLE_MS) return;
    lastUi = now;
    onProgress({ ...progress });
  };

  emit(true);

  try {
    const token = await getAccessToken();
    const speedFetch = makeSpeedFetch(token);

    // Warm-up (not counted)
    await speedFetch(`${API_PATHS.mobileClientSpeedTest}?phase=ping`, { signal });

    const rtts: number[] = [];
    for (let i = 0; i < PING_ROUNDS; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const t0 = performance.now();
      await speedFetch(`${API_PATHS.mobileClientSpeedTest}?phase=ping`, { signal });
      rtts.push(performance.now() - t0);
      progress.pingMs = median(rtts);
      progress.jitterMs = meanAbsDev(rtts, progress.pingMs);
      emit(true);
    }

    progress.phase = "download";
    progress.liveMbps = 0;
    emit(true);

    const downStart = performance.now();
    const downRes = await speedFetch(
      `${API_PATHS.mobileClientSpeedTest}?phase=down&bytes=${DOWN_BYTES}`,
      { signal }
    );

    // Prefer one-shot buffer: fewer JS ticks, smoother UI on RN/web
    const ab = await downRes.arrayBuffer();
    const downMs = performance.now() - downStart;
    const downMbps = toMbps(ab.byteLength, downMs);
    progress.downloadMbps = downMbps;
    progress.liveMbps = downMbps;
    emit(true);

    progress.phase = "upload";
    progress.liveMbps = 0;
    emit(true);

    // Reuse a compact payload; filling once is cheaper than streaming fake progress
    const payload = new Uint8Array(UP_BYTES);
    const upStart = performance.now();
    await speedFetch(`${API_PATHS.mobileClientSpeedTest}?phase=up`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: payload,
      signal,
    });
    const upMbps = toMbps(UP_BYTES, performance.now() - upStart);
    progress.uploadMbps = upMbps;
    progress.liveMbps = upMbps;
    progress.phase = "done";
    emit(true);
    return progress;
  } catch (e) {
    if (
      signal?.aborted ||
      (e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError")
    ) {
      progress.phase = "idle";
      progress.error = null;
      emit(true);
      return progress;
    }
    progress.phase = "error";
    progress.error = e instanceof Error ? e.message : "Speed test failed";
    emit(true);
    return progress;
  }
}
