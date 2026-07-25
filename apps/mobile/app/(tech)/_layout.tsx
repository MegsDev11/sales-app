import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../src/theme";

const TAB_BAR_STYLE = {
  backgroundColor: "#fff",
  borderTopColor: "#E5E7EB",
  height: 62,
  paddingTop: 6,
  paddingBottom: 8,
} as const;

const HIDDEN_TAB_BAR = { display: "none" as const };

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55, color: focused ? colors.accent : "#6B7280" }}>
      {glyph}
    </Text>
  );
}

export default function TechLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: TAB_BAR_STYLE,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ focused }) => <TabIcon glyph="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: "Updates",
          tabBarLabel: "Updates",
          tabBarIcon: ({ focused }) => <TabIcon glyph="✉" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarLabel: "Chat",
          tabBarIcon: ({ focused }) => <TabIcon glyph="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon glyph="👤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clock"
        options={{ href: null, title: "Time Clock", tabBarStyle: HIDDEN_TAB_BAR }}
      />
      <Tabs.Screen
        name="timesheet"
        options={{ href: null, title: "Timesheet", tabBarStyle: HIDDEN_TAB_BAR }}
      />
      <Tabs.Screen
        name="time-off"
        options={{ href: null, title: "Time off", tabBarStyle: HIDDEN_TAB_BAR }}
      />
      <Tabs.Screen
        name="job/[id]"
        options={{ href: null, title: "Job", tabBarStyle: HIDDEN_TAB_BAR }}
      />
      <Tabs.Screen
        name="vehicle-scan"
        options={{ href: null, title: "Scan vehicle", tabBarStyle: HIDDEN_TAB_BAR }}
      />
      <Tabs.Screen
        name="vehicle-fuel/[token]"
        options={{ href: null, title: "Log fuel", tabBarStyle: HIDDEN_TAB_BAR }}
      />
    </Tabs>
  );
}
