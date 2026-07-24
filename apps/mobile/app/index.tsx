import { Redirect, router } from "expo-router";
import { useAuth } from "../src/auth";
import { Loading, Muted, PrimaryButton, Screen, Title } from "../src/ui";

export default function Index() {
  const { session, me, loading, meError, refreshMe, signOut } = useAuth();

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/(auth)/login" />;

  if (meError && !me) {
    return (
      <Screen>
        <Title>Couldn’t load profile</Title>
        <Muted>{meError}</Muted>
        <Muted>
          Make sure the web Operations app is running (`npm run dev`) and reachable from this app.
        </Muted>
        <PrimaryButton label="Retry" onPress={() => void refreshMe()} />
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

  if (!me) return <Loading />;

  if (me.mobileRole === "tech") return <Redirect href="/(tech)" />;
  if (me.mobileRole === "stock") return <Redirect href="/(stock)" />;
  if (me.mobileRole === "client") return <Redirect href="/(client)" />;
  return <Redirect href="/unsupported" />;
}
