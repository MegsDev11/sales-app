import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { API_PATHS, type SupportMessage, type SupportThread } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { colors } from "../../src/theme";
import { Loading, Screen } from "../../src/ui";
import { LifeBuoyIcon, MessageIcon } from "../../src/ui/icons";

export default function ClientMessages() {
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshThread = useCallback(async (threadId?: string) => {
    if (threadId) {
      const data = await apiFetch(
        `${API_PATHS.mobileClientMessages}?threadId=${encodeURIComponent(threadId)}`
      );
      setThread(data.thread ?? null);
      setMessages(data.messages ?? []);
      return data.thread as SupportThread | null;
    }
    const list = await apiFetch(API_PATHS.mobileClientMessages);
    const threads = (list.threads ?? []) as SupportThread[];
    const active =
      threads.find((t) => t.status === "open" || t.status === "pending") ?? threads[0] ?? null;
    setThread(active);
    if (active) {
      const data = await apiFetch(
        `${API_PATHS.mobileClientMessages}?threadId=${encodeURIComponent(active.id)}`
      );
      setMessages(data.messages ?? []);
      setThread(data.thread ?? active);
      return data.thread as SupportThread | null;
    }
    setMessages([]);
    return null;
  }, []);

  const load = useCallback(async () => {
    try {
      await refreshThread();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [refreshThread]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }, [load])
  );

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (thread?.status !== "pending" || !thread.id) return;
    pollRef.current = setInterval(() => {
      void refreshThread(thread.id).catch(() => undefined);
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [thread?.id, thread?.status, refreshThread]);

  async function requestChat() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(API_PATHS.mobileClientMessages, {
        method: "POST",
        body: JSON.stringify({ action: "request_chat" }),
      });
      setThread(res.thread ?? null);
      if (res.thread?.id) await refreshThread(res.thread.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!text.trim() || !thread || thread.status !== "open") return;
    setBusy(true);
    try {
      await apiFetch(API_PATHS.mobileClientMessages, {
        method: "POST",
        body: JSON.stringify({
          action: "send",
          threadId: thread.id,
          body: text.trim(),
        }),
      });
      setText("");
      await refreshThread(thread.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  const status = thread?.status;

  const statusCopy =
    !status || status === "closed"
      ? "Request a chat when you need help."
      : status === "pending"
        ? "Waiting for support to accept…"
        : "You can message support now.";

  return (
    <Screen safeTop style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={88}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <LifeBuoyIcon size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>Support</Text>
              <Text style={styles.subheading}>{statusCopy}</Text>
            </View>
            {status === "pending" || status === "open" ? (
              <View
                style={[
                  styles.statusChip,
                  status === "open" ? styles.statusOpen : styles.statusPending,
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    status === "open" ? styles.statusOpenText : styles.statusPendingText,
                  ]}
                >
                  {status === "open" ? "Connected" : "Pending"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {status === "open" || status === "pending" ? (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              status === "pending" ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Chat requested</Text>
                  <Text style={styles.emptyBody}>
                    You can type once a support tech accepts.
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptyBody}>Say hello — we are here to help.</Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const mine = item.senderType === "client";
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {item.body}
                  </Text>
                  <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
              );
            }}
          />
        ) : (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyCard, styles.emptyCardCentered]}>
              <View style={styles.emptyIcon}>
                <MessageIcon size={26} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>Need help?</Text>
              <Text style={[styles.emptyBody, { textAlign: "center" }]}>
                Request a chat and a MEGS support tech will accept when available.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.composer}>
          {!status || status === "closed" ? (
            <Pressable
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => void requestChat()}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Requesting…" : "Request chat"}
              </Text>
            </Pressable>
          ) : null}
          {status === "pending" ? (
            <View style={[styles.primaryBtn, styles.btnDisabled]}>
              <Text style={styles.primaryBtnText}>Waiting for support…</Text>
            </View>
          ) : null}
          {status === "open" ? (
            <View style={styles.composeRow}>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="How can we help?"
                placeholderTextColor={colors.muted}
                multiline
              />
              <Pressable
                style={[
                  styles.sendBtn,
                  (busy || !text.trim()) && styles.btnDisabled,
                ]}
                disabled={busy || !text.trim()}
                onPress={() => void send()}
              >
                <Text style={styles.sendBtnText}>{busy ? "…" : "Send"}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F8FA",
    padding: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
  },
  subheading: {
    marginTop: 1,
    fontSize: 13,
    color: colors.mutedDark,
  },
  statusChip: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: "#FEF3C7",
  },
  statusOpen: {
    backgroundColor: "#DCFCE7",
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusPendingText: {
    color: "#92400E",
  },
  statusOpenText: {
    color: "#166534",
  },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    color: colors.offline,
    fontSize: 13,
  },
  messageList: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
    flexGrow: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  emptyCardCentered: {
    alignItems: "center",
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.mutedDark,
    lineHeight: 19,
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.brand,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
  },
  bubbleTextMine: {
    color: "#FFFFFF",
  },
  bubbleTime: {
    fontSize: 10,
    color: colors.mutedDark,
  },
  bubbleTimeMine: {
    color: "rgba(255,255,255,0.7)",
  },
  composer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: "#FFFFFF",
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.55,
  },
  composeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "#F7F8FA",
  },
  sendBtn: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
