// Estrutura da aplicação: barra lateral flutuante escura, ilhas de vidro no topo,
// barra mobile com gaveta, seletor de disciplina e avisos (toasts).
import { usePathname, useRouter } from "expo-router";
import {
  BookOpen,
  Check,
  ChevronDown,
  Gauge,
  Library,
  ListChecks,
  LucideIcon,
  Menu,
  MessageCircleQuestion,
  Moon,
  Settings,
  Sun,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Course } from "../lib/api";
import { useApp, useTheme } from "../lib/store";
import { ICON, palette, radius, tint } from "../lib/theme";
import { Button, Txt } from "./ui";

export const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Painel", icon: Gauge },
  { href: "/materiais", label: "Materiais", icon: Library },
  { href: "/quiz", label: "Quiz", icon: ListChecks },
  { href: "/perguntar", label: "Perguntar", icon: MessageCircleQuestion },
];
const SETTINGS_NAV = { href: "/configuracoes", label: "Configurações", icon: Settings };

const SIDEBAR_BG = palette.sidebar;
const glass = Platform.OS === "web" ? ({ backdropFilter: "blur(14px)" } as object) : {};

function Wordmark({ full }: { full: boolean }) {
  return full ? (
    <Txt size={17} weight="bold" color="#e1e4e8" numberOfLines={1}>
      Revisa<Txt size={17} weight="bold" color={palette.accent}> AI</Txt>
    </Txt>
  ) : (
    <Txt size={18} weight="bold" color={palette.accent}>
      R
    </Txt>
  );
}

function Sidebar({ expanded, onToggle, onNavigate }: { expanded: boolean; onToggle: () => void; onNavigate?: () => void }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <View
      style={{
        width: expanded ? 272 : 72,
        flex: 1,
        backgroundColor: SIDEBAR_BG,
        borderRadius: radius.float,
        borderWidth: 1,
        borderColor: palette.sidebarLine,
        paddingVertical: 14,
        paddingHorizontal: 12,
        gap: 6,
      }}
    >
      <Pressable onPress={onToggle} style={{ height: 44, justifyContent: "center", alignItems: expanded ? "flex-start" : "center", paddingHorizontal: expanded ? 8 : 0, marginBottom: 10 }}>
        <Wordmark full={expanded} />
      </Pressable>
      {NAV.map(renderItem)}
      <View style={{ flex: 1 }} />
      {renderItem(SETTINGS_NAV)}
      <Txt size={10} color="#6b7280" style={{ textAlign: expanded ? "left" : "center", paddingHorizontal: expanded ? 8 : 0, marginTop: 6 }}>
        v1.1.0
      </Txt>
    </View>
  );

  function renderItem(item: { href: string; label: string; icon: LucideIcon }) {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Pressable
            key={item.href}
            onPress={() => {
              router.navigate(item.href as never);
              onNavigate?.();
            }}
            accessibilityLabel={item.label}
            style={(s) => ({
              height: 44,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 13,
              backgroundColor: active ? tint(palette.accent, 0.16) : (s as { hovered?: boolean }).hovered ? "rgba(255,255,255,0.06)" : "transparent",
            })}
          >
            {active && <View style={{ position: "absolute", left: -12, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: palette.accent }} />}
            <Icon size={20} strokeWidth={ICON.stroke} color={active ? palette.accent : "#a3a9b3"} />
            {expanded && (
              <Txt size={13} weight={active ? "semibold" : "medium"} color={active ? "#e1e4e8" : "#a3a9b3"} numberOfLines={1}>
                {item.label}
              </Txt>
            )}
          </Pressable>
        );
  }
}

function CoursePicker() {
  const t = useTheme();
  const { courses, course, setCourseId, reloadCourses, toast } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    if (deleting) return;
    setConfirmId(null);
    setOpen(false);
  };

  const remove = async (c: Course) => {
    setDeleting(true);
    try {
      await api.deleteCourse(c.id);
      await reloadCourses();
      setConfirmId(null);
      toast(`Disciplina "${c.name}" excluída`);
    } catch (e) {
      toast((e as Error).message, { bad: true });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={(s) => ({
          height: 34,
          borderRadius: radius.pill,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          maxWidth: 220,
          backgroundColor: (s as { hovered?: boolean }).hovered ? t.hover : "transparent",
        })}
      >
        <BookOpen size={16} strokeWidth={ICON.stroke} color={palette.accent} />
        <Txt size={12} weight="semibold" color={t.islStrong} numberOfLines={1} style={{ flexShrink: 1 }}>
          {course?.name ?? "Sem disciplina"}
        </Txt>
        <ChevronDown size={14} strokeWidth={ICON.stroke} color={t.text3} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
        <Pressable onPress={close} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "flex-start", paddingTop: 80, paddingHorizontal: 16 }}>
          <Pressable style={{ width: "100%", maxWidth: 320, backgroundColor: t.dark ? "rgba(29,32,39,0.97)" : "rgba(255,255,255,0.97)", borderRadius: 16, borderWidth: 1, borderColor: t.islLine, padding: 6, ...glass }}>
            <Txt size={11} weight="bold" tone={3} style={{ textTransform: "uppercase", letterSpacing: 0.8, padding: 10 }}>
              Disciplinas
            </Txt>
            {courses.map((c) =>
              confirmId === c.id ? (
                <View key={c.id} style={{ gap: 8, padding: 10, borderRadius: 10, backgroundColor: tint(palette.danger, 0.1), borderWidth: 1, borderColor: tint(palette.danger, 0.3) }}>
                  <Txt size={13} weight="semibold" numberOfLines={2}>
                    Excluir "{c.name}"?
                  </Txt>
                  <Txt size={11.5} tone={2}>
                    Apaga {c.documents === 1 ? "1 material" : `${c.documents} materiais`}, os tópicos, os quizzes e o histórico. Não dá para desfazer.
                  </Txt>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
                    <Button size="sm" label="Cancelar" disabled={deleting} onPress={() => setConfirmId(null)} />
                    <Button size="sm" variant="danger" icon={Trash2} label="Excluir" loading={deleting} onPress={() => remove(c)} />
                  </View>
                </View>
              ) : (
                <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Pressable
                    onPress={() => {
                      setCourseId(c.id);
                      close();
                    }}
                    style={(s) => ({ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, backgroundColor: (s as { hovered?: boolean }).hovered ? t.hover : "transparent" })}
                  >
                    <BookOpen size={16} strokeWidth={ICON.stroke} color={t.text3} />
                    <Txt size={13} style={{ flex: 1 }} numberOfLines={1}>
                      {c.name}
                    </Txt>
                    {c.id === course?.id && <Check size={16} strokeWidth={ICON.stroke} color={palette.accent} />}
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmId(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Excluir disciplina ${c.name}`}
                    style={(s) => ({ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: (s as { hovered?: boolean }).hovered ? tint(palette.danger, 0.14) : "transparent" })}
                  >
                    <Trash2 size={15} strokeWidth={ICON.stroke} color={t.text3} />
                  </Pressable>
                </View>
              ),
            )}
            <View style={{ height: 1, backgroundColor: t.line, marginVertical: 6 }} />
            <Pressable
              onPress={() => {
                close();
                router.navigate("/materiais?nova=1" as never);
              }}
              style={(s) => ({ padding: 10, borderRadius: 10, backgroundColor: (s as { hovered?: boolean }).hovered ? t.hover : "transparent" })}
            >
              <Txt size={13} weight="medium" color={palette.accent}>
                + Nova disciplina
              </Txt>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ActionIsland() {
  const t = useTheme();
  const { toggleTheme } = useApp();
  const { width } = useWindowDimensions();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 46, paddingHorizontal: 6, borderRadius: radius.float, backgroundColor: t.islBg, borderWidth: 1, borderColor: t.islLine, ...glass }}>
      <CoursePicker />
      <View style={{ width: 1, height: 20, backgroundColor: t.islLine, marginHorizontal: 2 }} />
      <Pressable
        onPress={toggleTheme}
        accessibilityLabel="Alternar tema"
        style={(s) => ({ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: (s as { hovered?: boolean }).hovered ? t.hover : "transparent" })}
      >
        {t.dark ? <Sun size={18} strokeWidth={ICON.stroke} color={t.text2} /> : <Moon size={18} strokeWidth={ICON.stroke} color={t.text2} />}
      </Pressable>
      {width >= 900 && (
        <>
          <View style={{ width: 1, height: 20, backgroundColor: t.islLine, marginHorizontal: 2 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8, paddingLeft: 4 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: palette.accent, alignItems: "center", justifyContent: "center" }}>
              <Txt size={11} weight="bold" color="#fff">
                AL
              </Txt>
            </View>
            <Txt size={12} weight="medium" color={t.islStrong}>
              Aluno
            </Txt>
          </View>
        </>
      )}
    </View>
  );
}

/** Cabeçalho de cada página: ilha do título à esquerda e ilha de ações à direita. */
export function Page({ icon: Icon, title, crumb, children }: { icon: LucideIcon; title: string; crumb?: string; children: React.ReactNode }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 900;
  const island = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 52, paddingLeft: 7, paddingRight: 18, borderRadius: radius.float, backgroundColor: t.islBg, borderWidth: 1, borderColor: t.islLine, alignSelf: narrow ? "stretch" : "flex-start", minWidth: 0, ...glass }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: tint(palette.accent, 0.14), alignItems: "center", justifyContent: "center" }}>
        <Icon size={18} strokeWidth={ICON.stroke} color={palette.accent} />
      </View>
      <View style={{ minWidth: 0, flexShrink: 1 }}>
        <Txt size={15} weight="semibold" color={t.islStrong} numberOfLines={1}>
          {title}
        </Txt>
        {crumb ? (
          <Txt size={10.5} weight="medium" tone={4} style={{ textTransform: "uppercase", letterSpacing: 0.6 }} numberOfLines={1}>
            {crumb}
          </Txt>
        ) : null}
      </View>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: narrow ? 12 : 16, paddingTop: narrow ? 8 : 16, gap: 16, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {narrow ? (
        <View style={{ gap: 8 }}>
          <View style={{ alignItems: "flex-end" }}>
            <ActionIsland />
          </View>
          {island}
        </View>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          {island}
          <ActionIsland />
        </View>
      )}
      <View style={{ maxWidth: 1400, width: "100%", alignSelf: "center", flex: 1 }}>{children}</View>
      <Txt size={11} tone={4} style={{ textAlign: "center", paddingVertical: 8 }}>
        Revisa AI · Trabalho 2 de Inteligência Artificial II · 2026
      </Txt>
    </ScrollView>
  );
}

function Toasts() {
  const { toasts } = useApp();
  const t = useTheme();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: 16, bottom: 16, left: 16, alignItems: "flex-end", gap: 8 }}>
      {toasts.map((x) => (
        <View key={x.id} style={{ maxWidth: 420, flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: t.dark ? "rgba(29,32,39,0.96)" : "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: t.islLine, ...glass }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.bad ? palette.danger : palette.success }} />
          <Txt size={12.5} style={{ flexShrink: 1 }}>
            {x.text}
          </Txt>
        </View>
      ))}
    </View>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const [expanded, setExpanded] = useState(false);
  const [drawer, setDrawer] = useState(false);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: t.bg, paddingTop: insets.top }}>
      {!mobile && (
        <View style={{ padding: 8, paddingRight: 0 }}>
          <Sidebar expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {mobile && (
          <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 }}>
            <Pressable onPress={() => setDrawer(true)} accessibilityLabel="Abrir menu" style={{ width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: SIDEBAR_BG }}>
              <Menu size={18} strokeWidth={ICON.stroke} color="#e1e4e8" />
            </Pressable>
            <Txt size={16} weight="bold">
              Revisa<Txt size={16} weight="bold" color={palette.accent}> AI</Txt>
            </Txt>
          </View>
        )}
        {children}
      </View>
      {mobile && (
        <Modal transparent visible={drawer} animationType="fade" onRequestClose={() => setDrawer(false)}>
          <View style={{ flex: 1, flexDirection: "row" }}>
            <View style={{ padding: 8, paddingTop: 8 + insets.top }}>
              <Sidebar expanded onToggle={() => setDrawer(false)} onNavigate={() => setDrawer(false)} />
            </View>
            <Pressable onPress={() => setDrawer(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}>
              <View style={{ position: "absolute", top: 16 + insets.top, right: 16 }}>
                <X size={20} color="#fff" />
              </View>
            </Pressable>
          </View>
        </Modal>
      )}
      <Toasts />
    </View>
  );
}
