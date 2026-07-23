import { Tabs } from "expo-router";
import { colors } from "../../src/theme";

export default function ClientLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "My service", tabBarLabel: "Home" }} />
      <Tabs.Screen name="network" options={{ title: "Network", tabBarLabel: "Network" }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarLabel: "Messages" }} />
    </Tabs>
  );
}
