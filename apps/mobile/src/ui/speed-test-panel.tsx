import { memo, useMemo, useRef, useState, Fragment } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { API_PATHS, type ClientInstallationDto } from "@megs/shared";
import { apiFetch } from "../lib/api";
import {
  deviceNetworkReportLine,
  useDeviceNetwork,
} from "../lib/use-device-network";
import { colors } from "../theme";
import {
  runSpeedTest,
  type SpeedTestPhase,
  type SpeedTestProgress,
} from "../lib/speed-test";

const TICKS = [0, 5, 10, 20, 30, 40, 60, 80, 100];
const START_ANGLE = Math.PI;
const END_ANGLE = 0;
const CX = 150;
const CY = 140;
const R = 110;
const TRACK_PATH = (() => {
  const a = {
    x: CX + R * Math.cos(START_ANGLE),
    y: CY + R * Math.sin(START_ANGLE),
  };
  const b = {
    x: CX + R * Math.cos(END_ANGLE),
    y: CY + R * Math.sin(END_ANGLE),
  };
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
})();

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function speedToT(mbps: number) {
  const v = clamp(mbps, 0, 100);
  for (let i = 0; i < TICKS.length - 1; i++) {
    const a = TICKS[i]!;
    const b = TICKS[i + 1]!;
    if (v <= b) {
      const local = (v - a) / (b - a || 1);
      return (i + local) / (TICKS.length - 1);
    }
  }
  return 1;
}

function polar(t: number, radius = R) {
  const angle = START_ANGLE + (END_ANGLE - START_ANGLE) * t;
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  };
}

function arcPath(t1: number) {
  const t = Math.max(t1, 0.001);
  const a = polar(0);
  const b = polar(t);
  const large = t > 0.5 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${R} ${R} 0 ${large} 1 ${b.x} ${b.y}`;
}

const GaugeStatic = memo(function GaugeStatic() {
  return (
    <>
      <Path
        d={TRACK_PATH}
        stroke="#E8EEF7"
        strokeWidth={14}
        fill="none"
        strokeLinecap="round"
      />
      {TICKS.map((tick, i) => {
        const t = i / (TICKS.length - 1);
        const outer = polar(t, R + 4);
        const inner = polar(t, R - 8);
        const label = polar(t, R + 20);
        return (
          <Fragment key={tick}>
            <Line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#94A3B8"
              strokeWidth={1.5}
            />
            <SvgText
              x={label.x}
              y={label.y + 3}
              fill="#64748B"
              fontSize="9"
              fontWeight="600"
              textAnchor="middle"
            >
              {tick}
            </SvgText>
          </Fragment>
        );
      })}
    </>
  );
});

function phaseLabel(phase: SpeedTestPhase) {
  switch (phase) {
    case "ping":
      return "Measuring latency…";
    case "download":
      return "Testing download…";
    case "upload":
      return "Testing upload…";
    case "done":
      return "Test complete";
    case "error":
      return "Test failed";
    default:
      return "Tap start to test your connection";
  }
}

const idleProgress: SpeedTestProgress = {
  phase: "idle",
  liveMbps: 0,
  downloadMbps: null,
  uploadMbps: null,
  pingMs: null,
  jitterMs: null,
  error: null,
};

function MetricCard({
  label,
  value,
  unit,
  active,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  active?: boolean;
  icon: string;
}) {
  return (
    <View style={[styles.metricCard, active && styles.metricCardActive]}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, active && styles.metricIconActive]}>
          <Text style={[styles.metricIconText, active && styles.metricIconTextActive]}>
            {icon}
          </Text>
        </View>
        <Text style={[styles.metricLabel, active && styles.metricLabelActive]}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, active && styles.metricValueActive]}>
        {value}
        <Text style={[styles.metricUnit, active && styles.metricUnitActive]}> {unit}</Text>
      </Text>
    </View>
  );
}

function clientPlatformLabel() {
  if (Platform.OS === "web") return "Web browser";
  if (Platform.OS === "ios") return "iPhone / iPad";
  if (Platform.OS === "android") return "Android";
  return Platform.OS;
}

function wifiNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  if (!a?.trim() || !b?.trim()) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function SpeedTestPanel({
  installation,
}: {
  installation?: ClientInstallationDto | null;
}) {
  const network = useDeviceNetwork();
  const [progress, setProgress] = useState<SpeedTestProgress>(idleProgress);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareOk, setShareOk] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const running =
    progress.phase === "ping" ||
    progress.phase === "download" ||
    progress.phase === "upload";
  const testComplete = progress.phase === "done";
  const canSendToSupport =
    testComplete &&
    typeof progress.downloadMbps === "number" &&
    typeof progress.uploadMbps === "number" &&
    typeof progress.pingMs === "number" &&
    typeof progress.jitterMs === "number";

  const displayMbps =
    progress.phase === "download" || progress.phase === "upload"
      ? progress.liveMbps
      : 0;

  const needleT = speedToT(displayMbps);
  const needle = useMemo(() => polar(needleT, R - 8), [needleT]);
  const fillPath = useMemo(() => arcPath(needleT), [needleT]);
  const expectedWifi = installation?.wifiName?.trim() || null;
  const onExpectedWifi =
    network.kind === "wifi" &&
    network.ssid != null &&
    wifiNamesMatch(network.ssid, expectedWifi);
  const wifiMismatch =
    network.kind === "wifi" &&
    network.ssid != null &&
    expectedWifi != null &&
    !onExpectedWifi;

  async function start() {
    if (running) {
      abortRef.current?.abort();
      abortRef.current = null;
      setProgress(idleProgress);
      return;
    }
    setSent(false);
    setShareNote(null);
    const controller = new AbortController();
    abortRef.current = controller;
    await runSpeedTest({
      signal: controller.signal,
      onProgress: setProgress,
    });
    abortRef.current = null;
  }

  async function sendToSupport() {
    if (!canSendToSupport || sending) return;
    setSending(true);
    setShareNote(null);
    setShareOk(false);
    try {
      await apiFetch(API_PATHS.mobileClientMessages, {
        method: "POST",
        body: JSON.stringify({
          action: "report_speed_test",
          downloadMbps: progress.downloadMbps,
          uploadMbps: progress.uploadMbps,
          pingMs: progress.pingMs,
          jitterMs: progress.jitterMs,
          clientPlatform: clientPlatformLabel(),
          phoneNetwork: deviceNetworkReportLine(network),
          phoneNetworkKind: network.kind,
          phoneNetworkSsid: network.ssid,
          device: installation
            ? {
                productName: installation.productName,
                brand: installation.brand,
                deviceName: installation.deviceName,
                wifiName: installation.wifiName,
                serialNumber: installation.serialNumber,
                clientPppoe: installation.clientPppoe,
              }
            : null,
        }),
      });
      setSent(true);
      setShareOk(true);
      setShareNote("Sent to support");
      router.push("/(client)/messages");
    } catch (e) {
      setShareOk(false);
      setShareNote(e instanceof Error ? e.message : "Could not send to support");
    } finally {
      setSending(false);
    }
  }

  const fmtMbps = (n: number | null) => (n == null ? "—" : n.toFixed(2));
  const fmtMs = (n: number | null) => (n == null ? "—" : Math.round(n).toString());

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>Speed test</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => void sendToSupport()}
            disabled={!canSendToSupport || sending}
            style={[
              styles.shareBtn,
              (!canSendToSupport || sending) && styles.shareBtnDisabled,
            ]}
          >
            <Text style={styles.shareBtnText}>
              {sending ? "Sending…" : sent ? "Sent" : "Send to support"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void start()}
            style={[styles.startBtn, running && styles.stopBtn]}
          >
            <Text style={styles.startBtnText}>{running ? "Stop" : "Start"}</Text>
          </Pressable>
        </View>
      </View>
      {shareNote ? (
        <Text style={shareOk ? styles.shareOk : styles.errorText}>{shareNote}</Text>
      ) : null}

      <View
        style={[
          styles.connectedCard,
          network.isMobileData && styles.connectedCardWarn,
        ]}
      >
        <Text style={styles.connectedEyebrow}>Your phone is on</Text>
        <Text style={styles.connectedTitle} numberOfLines={2}>
          {network.label}
        </Text>
        {network.isMobileData ? (
          <Text style={styles.networkWarn}>
            This is mobile data — not your home Wi‑Fi. Results will not reflect your MEGS
            connection.
          </Text>
        ) : null}
        {wifiMismatch ? (
          <Text style={styles.networkWarn}>
            Not on your MEGS Wi‑Fi ({expectedWifi}). Connect to that network for an accurate
            home speed.
          </Text>
        ) : null}
        {onExpectedWifi ? (
          <Text style={styles.networkOk}>Matched to your MEGS Wi‑Fi</Text>
        ) : null}
        {network.permissionNeeded && network.kind === "wifi" ? (
          <Text style={styles.connectedSub}>
            Allow location access so we can show the Wi‑Fi name (SSID).
          </Text>
        ) : null}
        {expectedWifi && !network.isMobileData && !wifiMismatch && !onExpectedWifi ? (
          <Text style={styles.connectedSub}>MEGS Wi‑Fi on file: {expectedWifi}</Text>
        ) : null}
        <Text style={styles.testingOn}>Testing on {clientPlatformLabel()}</Text>
      </View>

      <View style={styles.gaugeCard}>
        <Svg width={300} height={168} viewBox="0 0 300 168" style={styles.gaugeSvg}>
          <GaugeStatic />
          <Path
            d={fillPath}
            stroke={colors.accent}
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
          />
          <Line
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
            stroke={colors.accentDeep}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Circle cx={CX} cy={CY} r={10} fill={colors.accent} />
          <Circle cx={CX} cy={CY} r={4} fill="#fff" />
        </Svg>

        <View style={styles.gaugeCenter}>
          <Text style={styles.liveSpeed}>
            {displayMbps > 0 ? displayMbps.toFixed(1) : "0"}
          </Text>
          <Text style={styles.liveUnit}>Mbps</Text>
          <Text style={styles.phaseText}>{phaseLabel(progress.phase)}</Text>
        </View>
      </View>

      {progress.error ? <Text style={styles.errorText}>{progress.error}</Text> : null}

      <View style={styles.metricsGrid}>
        <MetricCard
          label="Download"
          value={fmtMbps(progress.downloadMbps)}
          unit="Mbps"
          active={progress.phase === "download" || progress.phase === "done"}
          icon="↓"
        />
        <MetricCard
          label="Upload"
          value={fmtMbps(progress.uploadMbps)}
          unit="Mbps"
          active={progress.phase === "upload"}
          icon="↑"
        />
        <MetricCard
          label="Ping"
          value={fmtMs(progress.pingMs)}
          unit="ms"
          icon="·"
        />
        <MetricCard
          label="Jitter"
          value={fmtMs(progress.jitterMs)}
          unit="ms"
          icon="~"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.mutedDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shareBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.brand,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  shareBtnDisabled: {
    opacity: 0.4,
  },
  shareBtnText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: "700",
  },
  shareOk: {
    fontSize: 13,
    color: colors.online,
    fontWeight: "600",
  },
  connectedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  connectedCardWarn: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  connectedEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.mutedDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  connectedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  connectedSub: {
    fontSize: 13,
    color: colors.mutedDark,
    marginTop: 2,
  },
  networkWarn: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#B45309",
    lineHeight: 18,
  },
  networkOk: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: colors.online,
  },
  testingOn: {
    marginTop: 10,
    fontSize: 12,
    color: colors.mutedDark,
  },
  startBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  stopBtn: {
    backgroundColor: colors.mutedDark,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  gaugeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 8,
    paddingBottom: 16,
    overflow: "hidden",
    minHeight: 210,
  },
  gaugeSvg: {
    alignSelf: "center",
  },
  gaugeCenter: {
    alignItems: "center",
    marginTop: -28,
  },
  liveSpeed: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.8,
  },
  liveUnit: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.mutedDark,
    marginTop: -2,
  },
  phaseText: {
    marginTop: 6,
    fontSize: 12,
    color: colors.mutedDark,
  },
  errorText: {
    fontSize: 13,
    color: colors.offline,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricCard: {
    width: "48%",
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
  },
  metricCardActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  metricTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  metricIconActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  metricIconText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.accentDeep,
  },
  metricIconTextActive: {
    color: "#fff",
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.mutedDark,
  },
  metricLabelActive: {
    color: "rgba(255,255,255,0.9)",
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  metricValueActive: {
    color: "#fff",
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedDark,
  },
  metricUnitActive: {
    color: "rgba(255,255,255,0.85)",
  },
});
