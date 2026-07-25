import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { API_PATHS } from "@megs/shared";
import { apiFetch } from "../lib/api";
import { colors } from "../theme";
import {
  NetworkLayoutDiagram,
  type LayoutCanvasDoc,
  type LayoutDeviceRow,
} from "./network-layout-diagram";
import { FormCard, OptionalLabel, SectionHeader } from "../job-card-form";

type PendingFile = {
  uri: string;
  fileName: string;
  mimeType: string;
  kind: "sketch" | "photo";
};

type LayoutResponse = {
  leadId: string | null;
  layout: {
    title: string;
    canvas: LayoutCanvasDoc;
  } | null;
  devices: LayoutDeviceRow[];
  openSubmissions: number;
};

export function JobNetworkLayoutSection({ jobId }: { jobId: string }) {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<LayoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = (await apiFetch(
        `${API_PATHS.mobileTechLayout}?jobId=${encodeURIComponent(jobId)}`
      )) as LayoutResponse;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load network layout");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  async function pick(kind: "sketch" | "photo") {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!cam.granted && !lib.granted) {
      Alert.alert("Photos", "Camera or photo library permission required");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (result.canceled || !result.assets?.length) return;
    setPending((prev) =>
      [
        ...prev,
        ...result.assets.map((a) => ({
          uri: a.uri,
          fileName: a.fileName ?? a.uri.split("/").pop() ?? `${kind}.jpg`,
          mimeType: a.mimeType ?? "image/jpeg",
          kind,
        })),
      ].slice(0, 6)
    );
  }

  async function submit() {
    if (!pending.length) {
      Alert.alert("Layout", "Add at least one sketch or photo first");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("jobId", jobId);
      form.append("notes", notes.trim());
      for (const file of pending) {
        if (Platform.OS === "web") {
          const res = await fetch(file.uri);
          const blob = await res.blob();
          form.append(
            "files",
            new File([blob], file.fileName, { type: file.mimeType || blob.type })
          );
        } else {
          form.append("files", {
            uri: file.uri,
            name: file.fileName,
            type: file.mimeType,
          } as unknown as Blob);
        }
        form.append("kinds", file.kind);
        form.append("captions", "");
      }
      await apiFetch(API_PATHS.mobileTechLayout, {
        method: "POST",
        body: form,
      });
      setPending([]);
      setNotes("");
      Alert.alert(
        "Sent to wireless",
        "Your site layout was submitted to the wireless team inbox."
      );
      await load();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  }

  const hasLayout = !!data?.layout;
  const showSubmit = !loading;

  return (
    <View>
      <SectionHeader title="Client network layout" />
      <FormCard>
        {loading ? (
          <Text style={styles.muted}>Loading layout…</Text>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : hasLayout && data?.layout ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.title}>{data.layout.title}</Text>
            <Text style={styles.muted}>
              {(data.layout.canvas?.nodes?.length ?? 0)} nodes on published layout
            </Text>
            <NetworkLayoutDiagram
              canvas={data.layout.canvas ?? {}}
              devices={data.devices ?? []}
              width={width}
            />
            {(data.devices ?? []).length > 0 ? (
              <View style={{ gap: 6, marginTop: 4 }}>
                {data.devices.map((d) => (
                  <View key={d.id} style={styles.deviceRow}>
                    <Text style={styles.deviceName} numberOfLines={1}>
                      {d.label || d.nodeId}
                    </Text>
                    <Text style={styles.deviceStatus}>{d.status}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={styles.title}>No published layout yet</Text>
            <Text style={styles.muted}>
              Capture a site sketch or photos below. Wireless will receive them in Tech
              Submissions.
            </Text>
            {(data?.openSubmissions ?? 0) > 0 ? (
              <Text style={styles.pendingNote}>
                {data!.openSubmissions} open submission
                {data!.openSubmissions === 1 ? "" : "s"} already with wireless for this
                client.
              </Text>
            ) : null}
          </View>
        )}

        {showSubmit ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <OptionalLabel
              label={
                hasLayout
                  ? "Send updated sketch / photos to wireless (optional)"
                  : "Submit site sketch / photos"
              }
            />
            <View style={styles.pickRow}>
              <Pressable
                onPress={() => void pick("sketch")}
                style={styles.pickBtn}
                disabled={busy}
              >
                <Text style={styles.pickBtnText}>Add sketch</Text>
              </Pressable>
              <Pressable
                onPress={() => void pick("photo")}
                style={styles.pickBtn}
                disabled={busy}
              >
                <Text style={styles.pickBtnText}>Add photo</Text>
              </Pressable>
            </View>
            {pending.length > 0 ? (
              <View style={styles.thumbRow}>
                {pending.map((p, i) => (
                  <Pressable
                    key={`${p.uri}-${i}`}
                    onPress={() =>
                      setPending((list) => list.filter((_, idx) => idx !== i))
                    }
                  >
                    <Image source={{ uri: p.uri }} style={styles.thumb} />
                    <Text style={styles.thumbKind}>{p.kind}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes for wireless (optional)"
              placeholderTextColor={colors.mutedDark}
              style={styles.notes}
              multiline
            />
            <Pressable
              onPress={() => void submit()}
              disabled={busy || pending.length === 0}
              style={[
                styles.sendBtn,
                (busy || pending.length === 0) && styles.sendBtnDisabled,
              ]}
            >
              <Text style={styles.sendBtnText}>
                {busy ? "Sending…" : "Send to wireless"}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </FormCard>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  muted: {
    fontSize: 13,
    color: colors.mutedDark,
    lineHeight: 18,
  },
  error: {
    fontSize: 13,
    color: colors.offline,
  },
  pendingNote: {
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
  },
  deviceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  deviceName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  deviceStatus: {
    fontSize: 12,
    color: colors.mutedDark,
    textTransform: "capitalize",
  },
  pickRow: {
    flexDirection: "row",
    gap: 8,
  },
  pickBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  pickBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  thumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: "#E2E8F0",
  },
  thumbKind: {
    fontSize: 10,
    color: colors.mutedDark,
    textAlign: "center",
    marginTop: 2,
  },
  notes: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    minHeight: 64,
    textAlignVertical: "top",
    fontSize: 14,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
