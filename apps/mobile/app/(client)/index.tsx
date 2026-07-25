import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import {
  API_PATHS,
  type ClientInstallationDto,
  type ClientPackageInfo,
  type ClientPackageUpgrade,
} from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { useAuth } from "../../src/auth";
import { colors } from "../../src/theme";
import { Loading, Screen } from "../../src/ui";
import { SpeedTestPanel } from "../../src/ui/speed-test-panel";

function firstName(full: string) {
  const part = full.trim().split(/\s+/)[0];
  return part || "there";
}

function CredRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.credRow}>
      <Text style={styles.credLabel}>{label}</Text>
      <Text style={[styles.credValue, mono && styles.credMono]} selectable>
        {value || "—"}
      </Text>
    </View>
  );
}

export default function ClientHome() {
  const { me, signOut } = useAuth();
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [packageTier, setPackageTier] = useState<string | null>(null);
  const [currentPackage, setCurrentPackage] = useState<ClientPackageInfo | null>(null);
  const [upgrades, setUpgrades] = useState<ClientPackageUpgrade[]>([]);
  const [installations, setInstallations] = useState<ClientInstallationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const meData = await apiFetch(API_PATHS.mobileClientMe);
      setClientName(meData.clientName ?? "");
      setAddress(meData.address ?? "");
      setPackageTier(meData.packageTier ?? null);
      setCurrentPackage(meData.currentPackage ?? null);
      setUpgrades((meData.upgrades ?? []).slice(0, 3));
      setInstallations((meData.installations ?? []) as ClientInstallationDto[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) return <Loading />;

  const displayName = clientName || me?.client?.clientName || "Customer";
  const speed = currentPackage?.speed ?? "—";
  const planName = currentPackage?.name ?? packageTier ?? "Your MEGS plan";
  const price = currentPackage?.priceLabel ?? null;
  const serviceType = currentPackage?.serviceType ?? "wireless";
  const primaryInstall = installations[0] ?? null;

  return (
    <Screen safeTop style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hello, {firstName(displayName)}</Text>
            <Text style={styles.subGreeting} numberOfLines={1}>
              {address || "Your MEGS account"}
            </Text>
          </View>
          <Pressable
            onPress={async () => {
              await signOut();
              router.replace("/(auth)/login");
            }}
            hitSlop={8}
          >
            <Text style={styles.signOutLink}>Sign out</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Active plan — ISP dashboards lead with service status */}
        <View style={styles.planHero}>
          <View style={styles.planHeroTop}>
            <Text style={styles.planStatus}>Your plan</Text>
            <View style={styles.liveDot}>
              <Text style={styles.liveDotText}>Active</Text>
            </View>
          </View>
          <Text style={styles.planSpeed}>{speed}</Text>
          <Text style={styles.planName}>{planName}</Text>
          <View style={styles.planMetaRow}>
            {price ? (
              <Text style={styles.planPrice}>
                {price}
                <Text style={styles.planPriceUnit}> / month</Text>
              </Text>
            ) : (
              <Text style={styles.planPriceUnit}>Price on request</Text>
            )}
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{serviceType}</Text>
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionTile}
            onPress={() => router.push("/(client)/messages")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#FEE2E2" }]}>
              <Text style={[styles.actionIconGlyph, { color: colors.brand }]}>S</Text>
            </View>
            <Text style={styles.actionLabel}>Support</Text>
          </Pressable>
          <Pressable
            style={styles.actionTile}
            onPress={() => router.push("/(client)/network")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#DBEAFE" }]}>
              <Text style={[styles.actionIconGlyph, { color: colors.accentDeep }]}>N</Text>
            </View>
            <Text style={styles.actionLabel}>Network</Text>
          </Pressable>
          <Pressable
            style={styles.actionTile}
            onPress={() => router.push("/(client)/messages")}
          >
            <View style={[styles.actionIcon, { backgroundColor: "#DCFCE7" }]}>
              <Text style={[styles.actionIconGlyph, { color: colors.online }]}>U</Text>
            </View>
            <Text style={styles.actionLabel}>Upgrade</Text>
          </Pressable>
        </View>

        <SpeedTestPanel installation={primaryInstall} />

        {/* Connection credentials */}
        <Text style={styles.sectionLabel}>Connection details</Text>
        {primaryInstall ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>
                {[primaryInstall.brand, primaryInstall.deviceName]
                  .filter(Boolean)
                  .join(" ") || primaryInstall.productName}
              </Text>
              <Text style={styles.panelSubtitle}>{primaryInstall.productName}</Text>
            </View>
            <CredRow label="Wi‑Fi name" value={primaryInstall.wifiName ?? ""} />
            <CredRow label="Wi‑Fi password" value={primaryInstall.wifiPassword ?? ""} mono />
            <CredRow label="PPPoE" value={primaryInstall.clientPppoe ?? ""} mono />
            <CredRow label="Serial" value={primaryInstall.serialNumber} mono />
            {installations.length > 1 ? (
              <Text style={styles.moreDevices}>
                +{installations.length - 1} more device
                {installations.length - 1 === 1 ? "" : "s"} on this account
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Device not linked yet</Text>
            <Text style={styles.panelBody}>
              Wi‑Fi and PPPoE details will show here after MEGS links your installation.
            </Text>
          </View>
        )}

        {installations.length > 1
          ? installations.slice(1).map((item) => (
              <View key={item.itemId} style={styles.panel}>
                <Text style={styles.panelTitle}>{item.productName}</Text>
                <CredRow label="Wi‑Fi name" value={item.wifiName ?? ""} />
                <CredRow label="Wi‑Fi password" value={item.wifiPassword ?? ""} mono />
                <CredRow label="PPPoE" value={item.clientPppoe ?? ""} mono />
              </View>
            ))
          : null}

        {/* Upgrades — compact list, not a wall of cards */}
        {upgrades.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Faster plans</Text>
            <View style={styles.panel}>
              <Text style={styles.panelBody}>
                Compare options below. Chat with support to switch plans.
              </Text>
              {upgrades.map((pkg, i) => (
                <View
                  key={pkg.id}
                  style={[
                    styles.upgradeRow,
                    i < upgrades.length - 1 && styles.upgradeRowBorder,
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.upgradeSpeed}>{pkg.speed}</Text>
                    <Text style={styles.upgradeName} numberOfLines={1}>
                      {pkg.name}
                    </Text>
                  </View>
                  <View style={styles.upgradeRight}>
                    <Text style={styles.upgradePrice}>{pkg.priceLabel}</Text>
                    {currentPackage ? (
                      <Text style={styles.upgradeDelta}>{pkg.priceDeltaLabel}</Text>
                    ) : null}
                    <Pressable
                      onPress={() => router.push("/(client)/messages")}
                      style={styles.upgradeCta}
                    >
                      <Text style={styles.upgradeCtaText}>Ask</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
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
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 4,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.4,
  },
  subGreeting: {
    marginTop: 2,
    fontSize: 14,
    color: colors.mutedDark,
  },
  signOutLink: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
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
  planHero: {
    backgroundColor: "#1A1F2C",
    borderRadius: 20,
    padding: 22,
    gap: 6,
  },
  planHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  planStatus: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  liveDot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(22,163,74,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDotText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#86EFAC",
  },
  planSpeed: {
    fontSize: 40,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  planName: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(255,255,255,0.78)",
    marginBottom: 10,
  },
  planMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  planPriceUnit: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
  },
  typeChip: {
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
    textTransform: "capitalize",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionTile: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconGlyph: {
    fontSize: 14,
    fontWeight: "800",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
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
    gap: 2,
  },
  panelHeader: {
    marginBottom: 10,
    gap: 2,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  panelSubtitle: {
    fontSize: 13,
    color: colors.mutedDark,
  },
  panelBody: {
    fontSize: 13,
    color: colors.mutedDark,
    lineHeight: 19,
    marginBottom: 8,
  },
  credRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  credLabel: {
    fontSize: 13,
    color: colors.mutedDark,
    fontWeight: "500",
  },
  credValue: {
    flexShrink: 1,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  credMono: {
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
  moreDevices: {
    marginTop: 8,
    fontSize: 12,
    color: colors.mutedDark,
  },
  upgradeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  upgradeRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  upgradeSpeed: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  upgradeName: {
    fontSize: 12,
    color: colors.mutedDark,
    marginTop: 2,
  },
  upgradeRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  upgradePrice: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  upgradeDelta: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.brand,
  },
  upgradeCta: {
    marginTop: 2,
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  upgradeCtaText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
