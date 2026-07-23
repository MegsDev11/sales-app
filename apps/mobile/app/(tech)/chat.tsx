import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../../src/theme";
import { DashboardScreen } from "../../src/tech-ui";

export default function TechChat() {
  return (
    <DashboardScreen>
      <View style={styles.wrap}>
        <Text style={styles.title}>Chat</Text>
        <View style={styles.empty}>
          <Text style={styles.emoji}>💬</Text>
          <Text style={styles.heading}>No messages yet</Text>
          <Text style={styles.body}>
            Field chat with Coordination and support will appear here.
          </Text>
        </View>
      </View>
    </DashboardScreen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 24,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
    gap: 8,
  },
  emoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  heading: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  body: {
    fontSize: 14,
    color: colors.mutedDark,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
});
