// Área que recebe arquivos arrastados do computador (somente na web).
// No celular não existe arrastar: o conteúdo é exibido normalmente e o envio usa o seletor.
import { Upload } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";

import { useTheme } from "../lib/store";
import { palette, radius, tint } from "../lib/theme";
import { Txt } from "./ui";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function DropZone({ onFiles, children }: { onFiles: (files: File[]) => void; children: React.ReactNode }) {
  const t = useTheme();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const latest = useRef(onFiles);
  latest.current = onFiles;
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    let depth = 0; // dragenter/leave também disparam ao passar pelos elementos filhos

    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const move = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) latest.current(files);
    };
    // fora da área, soltar um arquivo não pode fazer o navegador abrir o arquivo e sair do app
    const block = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };

    el.addEventListener("dragenter", enter);
    el.addEventListener("dragover", move);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      el.removeEventListener("dragenter", enter);
      el.removeEventListener("dragover", move);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  return (
    <View ref={ref}>
      {children}
      {over && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            minHeight: 160,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: radius.panel,
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: palette.accent,
            backgroundColor: t.dark ? "rgba(24,27,33,0.94)" : "rgba(255,255,255,0.94)",
          }}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: tint(palette.accent, 0.14) }}>
            <Upload size={22} strokeWidth={1.75} color={palette.accent} />
          </View>
          <Txt size={14} weight="semibold">
            Solte os arquivos aqui
          </Txt>
          <Txt size={12} tone={3}>
            PDF, PPTX, TXT e MD
          </Txt>
        </View>
      )}
    </View>
  );
}
