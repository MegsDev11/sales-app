import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../src/auth";
import { colors, spacing } from "../../src/theme";
import {
  DashboardScreen,
  MenuRow,
  ProfileHeroCard,
  formatDayMonthYear,
} from "../../src/tech-ui";

export default function TechProfile() {
  const { me, signOut } = useAuth();
  const u = me?.user;

  return (
    <DashboardScreen>
      <ScrollView contentContainerStyle={styles.content}>
        <ProfileHeroCard name={u?.name} dateLabel={formatDayMonthYear()} />

        <Text style={styles.section}>Form submissions</Text>
        <View style={styles.listCard}>
          <MenuRow
            icon="🕘"
            iconBg="#EDE9FE"
            label="My submissions"
            onPress={() => router.push("/(tech)/search")}
          />
          <MenuRow
            icon="📥"
            iconBg="#CCFBF1"
            label="Shared with me"
            onPress={() => router.push("/(tech)/search")}
          />
        </View>

        <Text style={styles.section}>More</Text>
        <View style={styles.listCard}>
          <MenuRow
            icon="📊"
            label="My activity"
            showChevron={false}
            onPress={() => router.push("/(tech)/clock")}
          />
          <MenuRow icon="📄" label="Personal documents" showChevron={false} />
          <MenuRow icon="👤" label="Personal information" showChevron={false} />
          <MenuRow icon="⚙️" label="Settings" showChevron={false} />
          <MenuRow icon="🎓" label="Support center" showChevron={false} />
        </View>

        <View style={styles.meta}>
          <Text style={styles.metaText}>{u?.email}</Text>
          <Text style={styles.metaText}>
            {u?.technicianLevel ? `${u.technicianLevel} technician` : "Technician"}
            {u?.phone ? ` · ${u.phone}` : ""}
          </Text>
        </View>

        <Text
          style={styles.signOut}
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/login");
          }}
        >
          Sign out
        </Text>
      </ScrollView>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    paddingBottom: 40,
    gap: 8,
  },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  meta: {
    marginTop: 20,
    gap: 4,
  },
  metaText: {
    color: colors.mutedDark,
    fontSize: 13,
  },
  signOut: {
    marginTop: 16,
    color: colors.brand,
    fontWeight: "700",
    fontSize: 15,
  },
});
