import { useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInput as RNTextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import Svg, { Circle, Path } from "react-native-svg";
import { Redirect, router } from "expo-router";
import { useAuth } from "../../src/auth";
import { Loading } from "../../src/ui";
import { colors } from "../../src/theme";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

/* ---------- Small stroke icons (react-native-svg) ---------- */

function MailIcon({ color = colors.mutedDark, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"
        stroke={color}
        strokeWidth={1.6}
      />
      <Path d="M4 7l8 5.5L20 7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function LockIcon({ color = colors.mutedDark, size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 11.5A1.5 1.5 0 0 1 6.5 10h11A1.5 1.5 0 0 1 19 11.5v6A1.5 1.5 0 0 1 17.5 19h-11A1.5 1.5 0 0 1 5 17.5z"
        stroke={color}
        strokeWidth={1.6}
      />
      <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function EyeIcon({ off, color = colors.mutedDark, size = 18 }: { off?: boolean; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={1.6} />
      {off ? <Path d="M4 4l16 16" stroke={color} strokeWidth={1.6} strokeLinecap="round" /> : null}
    </Svg>
  );
}

function ShieldIcon({ color = colors.muted, size = 13 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5l7 2.5v5.5c0 4.6-3.1 7.4-7 9-3.9-1.6-7-4.4-7-9V5z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ---------- Input with icon + focus state ---------- */

function LoginField({
  icon,
  trailing,
  focused,
  onFocus,
  onBlur,
  inputRef,
  ...input
}: {
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  inputRef?: React.Ref<RNTextInput>;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={[styles.field, focused && styles.fieldFocused]}>
      <View style={styles.fieldIcon}>{icon}</View>
      <TextInput
        ref={inputRef}
        placeholderTextColor={colors.muted}
        onFocus={onFocus}
        onBlur={onBlur}
        style={styles.input}
        {...input}
      />
      {trailing}
    </View>
  );
}

const ROLE_HINTS = ["Technician", "Stock", "Client"];

export default function LoginScreen() {
  const { session, me, signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [focus, setFocus] = useState<"email" | "password" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<RNTextInput>(null);

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
    <LinearGradient colors={["#FFFFFF", "#FBECEB", "#F3F4F6"]} style={styles.gradient}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              {/* Brand */}
              <View style={styles.brand}>
                <Image
                  source={require("../../assets/megs-logo.png")}
                  style={styles.logo}
                  resizeMode="contain"
                  accessibilityLabel="MEGS logo"
                />
                <View style={styles.kicker}>
                  <View style={styles.kickerDot} />
                  <Text style={styles.kickerText}>FIELD OPERATIONS PORTAL</Text>
                </View>
              </View>

              {/* Card */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Sign in</Text>
                <Text style={styles.cardSubtitle}>
                  Use the email and password issued on your staff card.
                </Text>

                <View style={styles.form}>
                  <LoginField
                    icon={<MailIcon color={focus === "email" ? colors.brand : colors.mutedDark} />}
                    focused={focus === "email"}
                    onFocus={() => setFocus("email")}
                    onBlur={() => setFocus(null)}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@megswb.co.za"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="username"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />

                  <LoginField
                    inputRef={passwordRef}
                    icon={<LockIcon color={focus === "password" ? colors.brand : colors.mutedDark} />}
                    focused={focus === "password"}
                    onFocus={() => setFocus("password")}
                    onBlur={() => setFocus(null)}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={() => void onSubmit()}
                    trailing={
                      <Pressable
                        onPress={() => setShowPw((v) => !v)}
                        hitSlop={10}
                        style={styles.eyeBtn}
                        accessibilityRole="button"
                        accessibilityLabel={showPw ? "Hide password" : "Show password"}
                      >
                        <EyeIcon off={!showPw} />
                      </Pressable>
                    }
                  />

                  {error ? (
                    <View style={styles.error}>
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <Pressable
                    onPress={() => void onSubmit()}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.buttonPressed,
                      busy && styles.buttonBusy,
                    ]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
                  </Pressable>
                </View>
              </View>

              {/* Purpose / roles */}
              <View style={styles.roles}>
                {ROLE_HINTS.map((r) => (
                  <View key={r} style={styles.rolePill}>
                    <Text style={styles.rolePillText}>{r}</Text>
                  </View>
                ))}
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <View style={styles.secureRow}>
                  <ShieldIcon />
                  <Text style={styles.secureText}>
                    Staff access only — accounts are issued by your manager.
                  </Text>
                </View>
                <Text style={styles.version}>MEGS Field · v{APP_VERSION}</Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  content: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },

  brand: {
    alignItems: "center",
    marginBottom: 22,
  },
  logo: {
    width: 190,
    height: 68,
  },
  kicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  kickerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
  kickerText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.mutedDark,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 22,
    ...Platform.select({
      web: { boxShadow: "0 18px 40px rgba(17,24,39,0.10)" } as object,
      default: {
        shadowColor: "#111827",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 6,
      },
    }),
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.mutedDark,
  },
  form: {
    marginTop: 18,
    gap: 12,
  },

  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    height: 50,
  },
  fieldFocused: {
    borderColor: colors.brand,
    ...Platform.select({
      web: { boxShadow: `0 0 0 3px ${colors.brand}22` } as object,
      default: {},
    }),
  },
  fieldIcon: { width: 20, alignItems: "center" },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    height: "100%",
    ...Platform.select({ web: { outlineStyle: "none" } as object, default: {} }),
  },
  eyeBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },

  error: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
  },

  button: {
    marginTop: 2,
    backgroundColor: colors.brand,
    borderRadius: 12,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { boxShadow: "0 8px 18px rgba(200,55,51,0.28)" } as object,
      default: {
        shadowColor: colors.brand,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
        elevation: 4,
      },
    }),
  },
  buttonPressed: { backgroundColor: colors.brandDark },
  buttonBusy: { opacity: 0.7 },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  roles: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  rolePill: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedDark,
  },

  footer: {
    marginTop: 22,
    alignItems: "center",
    gap: 8,
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
  },
  secureText: {
    flexShrink: 1,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
  version: {
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.3,
  },
});
