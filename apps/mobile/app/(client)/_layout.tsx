import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { colors } from "../../src/theme";
import { HomeIcon, WifiIcon, LifeBuoyIcon } from "../../src/ui/icons";

export default function ClientLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.mutedDark,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: colors.border,
          height: Platform.OS === "ios" ? 84 : 62,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 26 : 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ color }) => <HomeIcon size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          title: "Network",
          tabBarLabel: "Network",
          tabBarIcon: ({ color }) => <WifiIcon size={23} color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Support",
          tabBarLabel: "Support",
          tabBarIcon: ({ color }) => <LifeBuoyIcon size={23} color={color} />,
        }}
      />
    </Tabs>
  );
}
