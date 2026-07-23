import { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { API_PATHS, type SupportMessage } from "@megs/shared";
import { apiFetch } from "../../src/lib/api";
import { Card, Field, Loading, Muted, PrimaryButton, Screen, Title } from "../../src/ui";
import { colors } from "../../src/theme";

export default function ClientMessages() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const ensured = await apiFetch(API_PATHS.mobileClientMessages, {
        method: "POST",
        body: JSON.stringify({ action: "ensure_thread" }),
      });
      const tid = ensured.thread?.id as string;
      setThreadId(tid);
      const data = await apiFetch(`${API_PATHS.mobileClientMessages}?threadId=${tid}`);
      setMessages(data.messages ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await apiFetch(API_PATHS.mobileClientMessages, {
        method: "POST",
        body: JSON.stringify({ action: "send", threadId, body: text.trim() }),
      });
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <Title>Support</Title>
      <Muted>Chat directly with MEGS support</Muted>
      {error ? <Muted>{error}</Muted> : null}
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ gap: 8, paddingVertical: 12, flexGrow: 1 }}
        renderItem={({ item }) => (
          <Card
            style={{
              alignSelf: item.senderType === "client" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              backgroundColor: item.senderType === "client" ? "#fee2e2" : "#fff",
            }}
          >
            <Text>{item.body}</Text>
            <Muted>{new Date(item.createdAt).toLocaleString()}</Muted>
          </Card>
        )}
      />
      <View style={{ gap: 8 }}>
        <Field label="Message" value={text} onChangeText={setText} placeholder="How can we help?" />
        <PrimaryButton label={busy ? "Sending…" : "Send"} disabled={busy} onPress={() => void send()} />
      </View>
    </Screen>
  );
}
