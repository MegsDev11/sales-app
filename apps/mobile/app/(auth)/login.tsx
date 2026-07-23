import { useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "../../src/auth";
import { Field, PrimaryButton, Loading } from "../../src/ui";
import { colors } from "../../src/theme";

const webGradient: ViewStyle =
  Platform.OS === "web"
    ? ({
        backgroundImage: "linear-gradient(to bottom right, #f9fafb, #f3f4f6)",
      } as ViewStyle)
    : {};

export default function LoginScreen() {
  const { session, me, signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authLoading) return <Loading />;
  if (session && me) {
    if (me.mobileRole === "tech") return <Redirect href="/(tech)" />;
    if (me.mobileRole === "stock") return <Redirect href="/(stock)" />;
    if (me.mobileRole === "client") return <Redirect href="/(client)" />;
    return <Redirect href="/unsupported" />;
  }
  if (session) return <Redirect href="/" />;

  async function onSubmit() {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError("Enter the app email and password from the technician card.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(trimmed, password);
      router.replace("/");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Try again";
      setError(message);
      if (Platform.OS !== "web") {
        const { Alert } = await import("react-native");
        Alert.alert("Sign in failed", message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.page, webGradient]}>
      <View style={styles.hero}>
        <Image
          source={require("../../assets/megs-logo.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="MEGS logo"
        />
      </View>

      <View style={styles.card}>
        <View style={{ gap: 12 }}>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@megs.co.za" />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            label={busy ? "Signing in…" : "Sign in"}
            onPress={onSubmit}
            disabled={busy}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  hero: {
    alignItems: "center",
    marginBottom: 28,
  },
  logo: {
    width: 220,
    height: 80,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 4,
      },
    }),
  },
  error: {
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
