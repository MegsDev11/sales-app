import { Tabs } from "expo-router";
import { colors } from "../../src/theme";

export default function StockLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Stock", tabBarLabel: "Home" }} />
      <Tabs.Screen name="book-in" options={{ title: "Book in", tabBarLabel: "Book in" }} />
      <Tabs.Screen name="book-out" options={{ title: "Book out", tabBarLabel: "Book out" }} />
      <Tabs.Screen name="return" options={{ title: "Return", tabBarLabel: "Return" }} />
    </Tabs>
  );
}
