import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { colors } from "../../src/theme";
import { Loading, Screen } from "../../src/ui";
import {
  NetworkLayoutDiagram,
  type LayoutCanvasDoc,
  type LayoutDeviceRow,
} from "../../src/ui/network-layout-diagram";

function statusTone(status: string) {
  if (status === "online") return { bg: "#DCFCE7", fg: "#166534" };
  if (status === "offline") return { bg: "#FEE2E2", fg: "#991B1B" };
  return { bg: "#FEF3C7", fg: "#92400E" };
}

export default function ClientNetwork() {
  const { width } = useWindowDimensions();
  const [layout, setLayout] = useState<{
    title: string;
    canvas: LayoutCanvasDoc;
  } | null>(null);
  const [devices, setDevices] = useState<LayoutDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const data = await apiFetch(API_PATHS.mobileClientLayout);
          setLayout(data.layout);
          setDevices(data.devices ?? []);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  if (loading) return <Loading />;

  const onlineCount = devices.filter((d) => d.status === "online").length;

  return (
    <Screen safeTop style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.heading}>Network</Text>
          <Text style={styles.subheading}>Your site layout and device status</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {devices.length > 0 ? (
          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{devices.length}</Text>
              <Text style={styles.summaryLabel}>Devices</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={[styles.summaryValue, { color: colors.online }]}>
                {onlineCount}
              </Text>
              <Text style={styles.summaryLabel}>Online</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={[styles.summaryValue, { color: colors.offline }]}>
                {devices.length - onlineCount}
              </Text>
              <Text style={styles.summaryLabel}>Other</Text>
            </View>
          </View>
        ) : null}

        {!layout ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>No layout published</Text>
            <Text style={styles.panelBody}>
              When MEGS publishes your site diagram, it will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{layout.title}</Text>
            <Text style={styles.panelBody}>
              {layout.canvas?.nodes?.length ?? 0} nodes on layout
            </Text>
            <View style={{ marginTop: 8 }}>
              <NetworkLayoutDiagram
                canvas={layout.canvas ?? {}}
                devices={devices}
                width={width}
              />
            </View>
          </View>
        )}

        {devices.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Devices</Text>
            <View style={styles.panel}>
              {devices.map((d, i) => {
                const tone = statusTone(d.status);
                return (
                  <View
                    key={d.id}
                    style={[
                      styles.deviceRow,
                      i < devices.length - 1 && styles.deviceRowBorder,
                    ]}
                  >
                    <Text style={styles.deviceName} numberOfLines={1}>
                      {d.label || d.nodeId}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.statusPillText, { color: tone.fg }]}>
                        {d.status}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F8FA",
    padding: 0,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
    gap: 14,
  },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.4,
  },
  subheading: {
    marginTop: 2,
    fontSize: 14,
    color: colors.mutedDark,
  },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    color: colors.offline,
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.mutedDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: colors.mutedDark,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  panelBody: {
    marginTop: 4,
    fontSize: 13,
    color: colors.mutedDark,
    lineHeight: 19,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
  },
  deviceRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  deviceName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});
