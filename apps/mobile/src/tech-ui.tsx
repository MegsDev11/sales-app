import React from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, jobGradients, spacing } from "./theme";

export function initialsFromName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function greetingForNow(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function formatDayMonthYear(date = new Date()) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function Avatar({
  name,
  size = 44,
  color = colors.accent,
}: {
  name?: string | null;
  size?: number;
  color?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.36 }}>
        {initialsFromName(name)}
      </Text>
    </View>
  );
}

export function SectionTitle({
  title,
  onPress,
}: {
  title: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={styles.sectionRow}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

export function MenuRow({
  icon,
  iconBg,
  label,
  onPress,
  showChevron = true,
}: {
  icon: string;
  iconBg?: string;
  label: string;
  onPress?: () => void;
  showChevron?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow}>
      <View style={[styles.menuIcon, { backgroundColor: iconBg ?? "#EFF6FF" }]}>
        <Text style={styles.menuIconText}>{icon}</Text>
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {showChevron ? <Text style={styles.menuChevron}>›</Text> : null}
    </Pressable>
  );
}

export function ProfileHeroCard({
  name,
  dateLabel,
}: {
  name?: string | null;
  dateLabel: string;
}) {
  return (
    <View style={styles.profileHero}>
      <View style={styles.profileHeroLeft}>
        <Image
          source={require("../assets/megs-logo.png")}
          style={styles.profileLogo}
          resizeMode="contain"
        />
        <Text style={styles.profileName}>{name ?? "Technician"}</Text>
      </View>
      <View style={styles.profileHeroRight}>
        <View style={styles.pillDecor}>
          {["#93C5FD", "#FDBA74", "#F9A8D4", "#A5B4FC", "#67E8F9"].map((c, i) => (
            <View
              key={c}
              style={[
                styles.pill,
                {
                  backgroundColor: c,
                  opacity: 0.55,
                  height: 28 + (i % 3) * 10,
                  marginTop: (i % 2) * 8,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.profileAvatarWrap}>
          <Avatar name={name} size={56} color={colors.accent} />
        </View>
        <Text style={styles.profileDate}>{dateLabel}</Text>
      </View>
    </View>
  );
}

export function GradientJobCard({
  title,
  subtitle,
  authorName,
  dateLabel,
  category = "Jobs",
  index = 0,
  onPress,
}: {
  title: string;
  subtitle?: string;
  authorName?: string | null;
  dateLabel: string;
  category?: string;
  index?: number;
  onPress?: () => void;
}) {
  const gradient = jobGradients[index % jobGradients.length];
  return (
    <Pressable onPress={onPress} style={styles.jobItem}>
      <View style={styles.jobMeta}>
        <Avatar name={authorName} size={40} color={index % 2 ? "#F59E0B" : "#EAB308"} />
        <View style={{ flex: 1 }}>
          <View style={styles.jobMetaTop}>
            <Text style={styles.jobAuthor} numberOfLines={1}>
              {authorName ?? "Coordination"}
            </Text>
            <Text style={styles.jobMetaChevron}>›</Text>
            <Text style={styles.jobCategory}>{category}</Text>
          </View>
          <Text style={styles.jobDate}>{dateLabel}</Text>
        </View>
        <Text style={styles.jobMore}>⋯</Text>
      </View>
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.jobGradient}
      >
        <View style={styles.jobIconOuter}>
          <View style={styles.jobIconInner}>
            <Text style={styles.jobIconGlyph}>📋</Text>
          </View>
        </View>
        <Text style={styles.jobTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.jobSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

export function QuickAction({
  label,
  icon,
  bg,
  onPress,
}: {
  label: string;
  icon: string;
  bg: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.quickAction, { backgroundColor: bg }]}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

export function AlertBanner({
  title,
  body,
  onOpen,
}: {
  title: string;
  body: string;
  onOpen?: () => void;
}) {
  return (
    <View style={styles.alertBanner}>
      <View style={styles.alertIcon}>
        <Text style={{ fontSize: 18 }}>⏱</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertBody}>{body}</Text>
      </View>
      <Pressable onPress={onOpen} style={styles.alertOpen}>
        <Text style={styles.alertOpenText}>Open</Text>
      </Pressable>
    </View>
  );
}

export function WeeklyHoursCard({
  days,
  totalLabel,
  progress,
}: {
  days: {
    label: string;
    minutes: number | null;
    firstClockInAt?: string | null;
    lastClockOutAt?: string | null;
    hasOpenShift?: boolean;
  }[];
  totalLabel: string;
  progress: number;
}) {
  const max = Math.max(1, ...days.map((d) => d.minutes ?? 0));
  return (
    <View style={styles.hoursCard}>
      <SectionTitle title="Weekly Hours" />
      <View style={styles.barsRow}>
        {days.map((d) => {
          const has = d.minutes != null && d.minutes > 0;
          const h = has ? Math.max(12, Math.round(((d.minutes ?? 0) / max) * 72)) : 0;
          const overtime = (d.minutes ?? 0) > 8 * 60;
          return (
            <View key={d.label} style={styles.barCol}>
              <View style={styles.barTrack}>
                {has ? (
                  <>
                    <View
                      style={[
                        styles.barFill,
                        { height: h },
                        d.hasOpenShift ? { backgroundColor: colors.accent } : null,
                      ]}
                    />
                    {overtime ? <View style={styles.barCap} /> : null}
                  </>
                ) : (
                  <View style={styles.barEmpty} />
                )}
              </View>
              <Text style={styles.barDay}>{d.label}</Text>
              <Text style={styles.barTime}>
                {has ? formatMinutes(d.minutes!) : "--"}
              </Text>
              {d.firstClockInAt ? (
                <Text style={styles.barInOut}>
                  {formatClock(d.firstClockInAt)}
                  {d.hasOpenShift
                    ? "→"
                    : d.lastClockOutAt
                      ? `-${formatClock(d.lastClockOutAt)}`
                      : ""}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={styles.hoursFooter}>
        <Text style={styles.hoursFooterLabel}>Total hours this week</Text>
        <Text style={styles.hoursFooterValue}>{totalLabel}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress <= 0 ? 0 : Math.min(100, Math.max(4, progress * 100))}%`,
            },
          ]}
        />
        {progress > 0.85 ? <View style={styles.progressOver} /> : null}
      </View>
    </View>
  );
}

function formatClock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatMinutes(totalMinutes: number) {
  const total = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function DashboardScreen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

const cardShadow = Platform.select({
  web: { boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  default: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
}) as ViewStyle;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  chevron: {
    fontSize: 22,
    color: colors.muted,
    lineHeight: 22,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 12,
  },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIconText: {
    fontSize: 16,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: "500",
  },
  menuChevron: {
    fontSize: 22,
    color: "#D1D5DB",
  },
  profileHero: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    flexDirection: "row",
    minHeight: 140,
    overflow: "hidden",
    ...cardShadow,
  },
  profileHeroLeft: {
    flex: 1,
    justifyContent: "space-between",
  },
  profileLogo: {
    width: 110,
    height: 40,
  },
  profileName: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    marginTop: 24,
  },
  profileHeroRight: {
    width: 120,
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  pillDecor: {
    position: "absolute",
    right: 8,
    top: 0,
    flexDirection: "row",
    gap: 4,
    opacity: 0.9,
  },
  pill: {
    width: 10,
    borderRadius: 999,
  },
  profileAvatarWrap: {
    marginTop: 8,
    marginRight: 4,
  },
  profileDate: {
    fontSize: 12,
    color: colors.mutedDark,
    marginTop: 8,
  },
  jobItem: {
    marginBottom: 20,
  },
  jobMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  jobMetaTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  jobAuthor: {
    fontWeight: "700",
    color: colors.text,
    maxWidth: 140,
  },
  jobMetaChevron: {
    color: colors.muted,
    fontSize: 16,
  },
  jobCategory: {
    fontWeight: "700",
    color: colors.text,
  },
  jobDate: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  jobMore: {
    fontSize: 20,
    color: colors.muted,
    paddingHorizontal: 4,
  },
  jobGradient: {
    borderRadius: 22,
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  jobIconOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  jobIconInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  jobIconGlyph: {
    fontSize: 28,
  },
  jobTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  jobSubtitle: {
    color: "rgba(255,255,255,0.85)",
    marginTop: 6,
    fontSize: 13,
  },
  quickAction: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  quickIcon: {
    fontSize: 22,
  },
  quickLabel: {
    fontWeight: "700",
    color: colors.text,
    fontSize: 15,
  },
  alertBanner: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    ...cardShadow,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: {
    fontWeight: "700",
    color: colors.text,
    fontSize: 14,
  },
  alertBody: {
    color: colors.mutedDark,
    fontSize: 12,
    marginTop: 2,
  },
  alertOpen: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  alertOpenText: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 13,
  },
  hoursCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    ...cardShadow,
  },
  barsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 16,
  },
  barCol: {
    alignItems: "center",
    flex: 1,
  },
  barTrack: {
    height: 80,
    width: 18,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barFill: {
    width: 14,
    borderRadius: 6,
    backgroundColor: "#93C5FD",
  },
  barCap: {
    width: 14,
    height: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: colors.accentDeep,
    marginTop: -2,
  },
  barEmpty: {
    width: 14,
    borderTopWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  barDay: {
    fontSize: 11,
    color: colors.mutedDark,
    marginTop: 6,
  },
  barTime: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 2,
  },
  barInOut: {
    fontSize: 8,
    color: colors.mutedDark,
    marginTop: 1,
  },
  hoursFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  hoursFooterLabel: {
    color: colors.mutedDark,
    fontSize: 13,
  },
  hoursFooterValue: {
    fontWeight: "800",
    color: colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
    flexDirection: "row",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#93C5FD",
  },
  progressOver: {
    width: 24,
    height: "100%",
    backgroundColor: colors.accentDeep,
  },
});
