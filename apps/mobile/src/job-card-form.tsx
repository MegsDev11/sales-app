import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { JobCardSignature, YesNo } from "@megs/shared";
import { colors, spacing } from "./theme";

export function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

/** Nested heading under a parent section (e.g. Risk Assessment inside Job Card). */
export function SubSectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.subSectionHeader}>
      <Text style={styles.subSectionHeaderText}>{title}</Text>
    </View>
  );
}

export function FormCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.formCard}>{children}</View>;
}

export function RequiredLabel({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <View style={{ gap: 2, marginBottom: 8 }}>
      <Text style={styles.fieldLabel}>
        <Text style={styles.required}>* </Text>
        {label}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function OptionalLabel({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <View style={{ gap: 2, marginBottom: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function YesNoToggle({
  value,
  onChange,
  disabled,
}: {
  value: YesNo;
  onChange: (v: "yes" | "no") => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.yesNoRow}>
      {(["yes", "no"] as const).map((opt) => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            disabled={disabled}
            onPress={() => onChange(opt)}
            style={[styles.yesNoBtn, active && styles.yesNoBtnActive]}
          >
            <Text style={[styles.yesNoText, active && styles.yesNoTextActive]}>
              {opt === "yes" ? "Yes" : "No"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FormTextInput({
  value,
  onChangeText,
  placeholder = "Type here",
  multiline,
  disabled,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      editable={!disabled}
      multiline={multiline}
      style={[
        styles.input,
        multiline && styles.inputMultiline,
        disabled && styles.inputDisabled,
      ]}
    />
  );
}

export function TapLink({
  icon,
  label,
  onPress,
  disabled,
  done,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  done?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.tapRow, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.tapIcon}>{icon}</Text>
      <Text style={[styles.tapLabel, done && { color: colors.online }]}>
        {done ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

export function SignatureModal({
  visible,
  title,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: (sig: JobCardSignature) => void;
}) {
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.hint}>Type full name to sign</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.muted}
            autoFocus
            style={styles.input}
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const trimmed = name.trim();
                if (!trimmed) return;
                onSave({ name: trimmed, signedAt: new Date().toISOString() });
                onClose();
              }}
              style={styles.modalSave}
            >
              <Text style={styles.modalSaveText}>Sign</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  subSectionHeader: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  subSectionHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.mutedDark,
  },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  required: {
    color: colors.offline,
  },
  hint: {
    fontSize: 12,
    color: colors.mutedDark,
  },
  yesNoRow: {
    flexDirection: "row",
    gap: 8,
  },
  yesNoBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  yesNoBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  yesNoText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.mutedDark,
  },
  yesNoTextActive: {
    color: colors.accentDeep,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    fontSize: 16,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  inputDisabled: {
    backgroundColor: "#F9FAFB",
    color: colors.mutedDark,
  },
  tapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  tapIcon: {
    fontSize: 18,
  },
  tapLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.accent,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  modalCancelText: {
    color: colors.mutedDark,
    fontWeight: "600",
  },
  modalSave: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  modalSaveText: {
    color: "#fff",
    fontWeight: "700",
  },
});
