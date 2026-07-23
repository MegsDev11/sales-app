import { Text } from "react-native";
import { useAuth } from "../src/auth";
import { PrimaryButton, Screen, Title, Muted, Card } from "../src/ui";
import { router } from "expo-router";

export default function UnsupportedScreen() {
  const { me, signOut } = useAuth();
  return (
    <Screen>
      <Title>Web CRM account</Title>
      <Muted>{me?.message ?? "This role is not supported in the mobile app yet."}</Muted>
      <Card style={{ marginTop: 16 }}>
        <Text>{me?.user?.name}</Text>
        <Muted>
          {me?.user?.department ?? "—"} · {me?.user?.role}
        </Muted>
      </Card>
      <PrimaryButton
        label="Sign out"
        onPress={async () => {
          await signOut();
          router.replace("/(auth)/login");
        }}
      />
    </Screen>
  );
}
