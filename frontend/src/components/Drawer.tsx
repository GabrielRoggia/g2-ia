// Painel lateral flutuante (formulários). Abaixo de 760px vira folha que sobe de baixo.
import { X } from "lucide-react-native";
import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";

import { useTheme } from "../lib/store";
import { ICON, radius } from "../lib/theme";
import { Txt } from "./ui";

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const sheet = width < 760;
  return (
    <Modal transparent visible={open} animationType={sheet ? "slide" : "fade"} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: sheet ? "flex-end" : "stretch" }}>
        <Pressable onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }} />
        <View
          style={{
            width: sheet ? "100%" : 500,
            maxHeight: sheet ? "88%" : undefined,
            margin: sheet ? 0 : 8,
            borderRadius: sheet ? 0 : radius.float,
            borderTopLeftRadius: radius.float,
            borderTopRightRadius: radius.float,
            backgroundColor: t.dark ? "rgba(29,32,39,0.98)" : "rgba(255,255,255,0.98)",
            borderWidth: 1,
            borderColor: t.islLine,
            overflow: "hidden",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
            <Txt size={15} weight="semibold" color={t.islStrong}>
              {title}
            </Txt>
            <Pressable onPress={onClose} accessibilityLabel="Fechar" style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: t.hover }}>
              <X size={16} strokeWidth={ICON.stroke} color={t.text2} />
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: sheet ? 0 : 1 }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: t.line }}>{footer}</View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
