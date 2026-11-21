// Blocos compartilhados entre telas: avisos de estado, faixa de estatísticas e
// hook que recarrega dados quando a disciplina muda ou a tela ganha foco.
import { useFocusEffect, useRouter } from "expo-router";
import { AlertTriangle, BookOpen, KeyRound, LucideIcon, ServerOff } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";

import { Course } from "../lib/api";
import { useApp, useTheme } from "../lib/store";
import { ICON, palette, radius, tint } from "../lib/theme";
import { Button, Card, Empty, IconCircle, Txt } from "./ui";

export function useCourseData<T>(fetcher: (courseId: number) => Promise<T>) {
  const { course } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const courseId = course?.id;

  const reload = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      setData(await fetcher(courseId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useFocusEffect(
    useCallback(() => {
      setData(null);
      reload();
    }, [reload]),
  );
  return { data, error, loading, reload, setData };
}

function Banner({ icon: Icon, tone, children }: { icon: LucideIcon; tone: "warn" | "bad"; children: React.ReactNode }) {
  const t = useTheme();
  const c = tone === "bad" ? palette.danger : palette.warning;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: radius.panel, backgroundColor: tint(c, 0.1), borderWidth: 1, borderColor: tint(c, 0.3), marginBottom: 16 }}>
      <Icon size={ICON.size} strokeWidth={ICON.stroke} color={tone === "bad" ? t.badText : t.warnText} />
      <Txt size={12.5} style={{ flex: 1 }} color={t.text1}>
        {children}
      </Txt>
    </View>
  );
}

/** Mostra avisos globais e, se não houver disciplina, um convite para criar uma. */
export function Guard({ children }: { children: (course: Course) => React.ReactNode }) {
  const { backendError, llmConfigured, llmDetail, course, reloadCourses } = useApp();
  const router = useRouter();
  if (backendError) {
    return (
      <Card>
        <Empty icon={ServerOff} title="Servidor indisponível" text={backendError} action={<Button label="Tentar de novo" onPress={reloadCourses} />} />
      </Card>
    );
  }
  return (
    <>
      {llmConfigured === false && (
        <Pressable onPress={() => router.navigate("/configuracoes" as never)}>
          <Banner icon={KeyRound} tone="warn">
            O modelo de IA não está pronto: {llmDetail || "verifique o provedor"}. A busca funciona, mas gerar quizzes, tópicos e respostas não. Toque para abrir as Configurações.
          </Banner>
        </Pressable>
      )}
      {course ? (
        children(course)
      ) : (
        <Card>
          <Empty
            icon={BookOpen}
            title="Nenhuma disciplina ainda"
            text="Crie uma disciplina e envie os slides ou PDFs da matéria para começar a estudar."
            action={<Button variant="primary" label="Criar disciplina" onPress={() => router.navigate("/materiais?nova=1" as never)} />}
          />
        </Card>
      )}
    </>
  );
}

export function ErrorNote({ text }: { text: string }) {
  return (
    <Banner icon={AlertTriangle} tone="bad">
      {text}
    </Banner>
  );
}

export type Stat = { label: string; value: string; icon: LucideIcon; onPress?: () => void };

/** Card dividido em células: rótulo, valor laranja grande e ícone em círculo. */
export function StatStrip({ items }: { items: Stat[] }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const twoByTwo = width < 760;
  return (
    <Card pad={false} style={{ flexDirection: "row", flexWrap: "wrap", overflow: "hidden" }}>
      {items.map((it, i) => (
        <Pressable
          key={it.label}
          onPress={it.onPress}
          style={(s) => ({
            width: twoByTwo ? "50%" : `${100 / items.length}%`,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            paddingHorizontal: twoByTwo ? 14 : 20,
            paddingVertical: twoByTwo ? 14 : 18,
            borderLeftWidth: (twoByTwo ? i % 2 : i) ? 1 : 0,
            borderTopWidth: twoByTwo && i >= 2 ? 1 : 0,
            borderColor: t.line,
            backgroundColor: (s as { hovered?: boolean }).hovered && it.onPress ? t.hover : "transparent",
          })}
        >
          <View style={{ minWidth: 0, flexShrink: 1 }}>
            <Txt size={12} tone={3} numberOfLines={1}>
              {it.label}
            </Txt>
            <Txt size={twoByTwo ? 22 : 28} weight="bold" color={palette.accent} tabular>
              {it.value}
            </Txt>
          </View>
          {width >= 1100 && <IconCircle icon={it.icon} size={52} />}
        </Pressable>
      ))}
    </Card>
  );
}
