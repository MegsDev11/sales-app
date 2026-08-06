import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
import {
  BoostIcon,
  ChevronRightIcon,
  LifeBuoyIcon,
  LogOutIcon,
  RouterIcon,
  WifiIcon,
} from "../../src/ui/icons";

function firstName(full: string) {
  const part = full.trim().split(/\s+/)[0];
  return part || "there";
}

function initial(full: string) {
  return (full.trim().charAt(0) || "?").toUpperCase();
}

function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionLabelRow}>
      {icon}
      <Text style={styles.sectionLabel}>{children}</Text>
    </View>
  );
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

const ACTIONS = [
  {
    key: "support",
    label: "Support",
    href: "/(client)/messages" as const,
    bg: "#FEE2E2",
    fg: colors.brand,
    Icon: LifeBuoyIcon,
  },
  {
    key: "network",
    label: "Network",
    href: "/(client)/network" as const,
    bg: "#DBEAFE",
    fg: colors.accentDeep,
    Icon: WifiIcon,
  },
  {
    key: "upgrade",
    label: "Upgrade",
    href: "/(client)/messages" as const,
    bg: "#DCFCE7",
    fg: colors.online,
    Icon: BoostIcon,
  },
];

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
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial(displayName)}</Text>
          </View>
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
            style={styles.signOutBtn}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <LogOutIcon size={18} color={colors.mutedDark} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Active plan — ISP dashboards lead with service status */}
        <LinearGradient
          colors={["#242A38", "#161A24"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.planHero}
        >
          <View style={styles.planMotif} pointerEvents="none">
            <WifiIcon size={130} color="rgba(255,255,255,0.05)" strokeWidth={2.4} />
          </View>
          <View style={styles.planHeroTop}>
            <Text style={styles.planStatus}>Your plan</Text>
            <View style={styles.liveDot}>
              <View style={styles.liveDotPip} />
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
        </LinearGradient>

        {/* Quick actions */}
        <View style={styles.actionsRow}>
          {ACTIONS.map(({ key, label, href, bg, fg, Icon }) => (
            <Pressable key={key} style={styles.actionTile} onPress={() => router.push(href)}>
              <View style={[styles.actionIcon, { backgroundColor: bg }]}>
                <Icon size={20} color={fg} />
              </View>
              <Text style={styles.actionLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <SpeedTestPanel installation={primaryInstall} />

        {/* Connection credentials */}
        <SectionLabel icon={<RouterIcon size={15} color={colors.mutedDark} />}>
          Connection details
        </SectionLabel>
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
            <SectionLabel icon={<BoostIcon size={15} color={colors.mutedDark} />}>
              Faster plans
            </SectionLabel>
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
                      <ChevronRightIcon size={13} color="#fff" />
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
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  greeting: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
  },
  subGreeting: {
    marginTop: 1,
    fontSize: 13,
    color: colors.mutedDark,
  },
  signOutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
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
    borderRadius: 20,
    padding: 22,
    gap: 6,
    overflow: "hidden",
  },
  planMotif: {
    position: "absolute",
    top: -18,
    right: -14,
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
  liveDotPip: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ADE80",
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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  sectionLabel: {
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
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.brand,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  upgradeCtaText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
