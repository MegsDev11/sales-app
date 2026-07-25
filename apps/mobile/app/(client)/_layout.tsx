import { Tabs } from "expo-router";
import { colors } from "../../src/theme";

export default function ClientLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.mutedDark,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarLabel: "Home" }} />
      <Tabs.Screen name="network" options={{ title: "Network", tabBarLabel: "Network" }} />
      <Tabs.Screen name="messages" options={{ title: "Support", tabBarLabel: "Support" }} />
    </Tabs>
  );
}
