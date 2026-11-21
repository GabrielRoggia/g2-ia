// Estado global: tema, disciplina ativa e avisos (toasts).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { api, Course } from "./api";
import { darkTheme, lightTheme, Theme } from "./theme";

type Toast = { id: number; text: string; bad?: boolean };

type Ctx = {
  theme: Theme;
  toggleTheme: () => void;
  courses: Course[];
  course: Course | null;
  setCourseId: (id: number) => void;
  reloadCourses: () => Promise<Course[]>;
  toasts: Toast[];
  toast: (text: string, opts?: { bad?: boolean }) => void;
  backendError: string | null;
  llmConfigured: boolean | null;
  llmDetail: string;
  refreshHealth: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

function load(key: string): string | null {
  if (Platform.OS !== "web") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  if (Platform.OS !== "web") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => load("revisa.theme") !== "light");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseIdState] = useState<number | null>(() => Number(load("revisa.course")) || null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [llmConfigured, setLlm] = useState<boolean | null>(null);

  const toast = useCallback((text: string, opts?: { bad?: boolean }) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, bad: opts?.bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const reloadCourses = useCallback(async () => {
    try {
      const list = await api.courses();
      setCourses(list);
      setBackendError(null);
      setCourseIdState((cur) => (cur && list.some((c) => c.id === cur) ? cur : list[0]?.id ?? null));
      return list;
    } catch (e) {
      setBackendError((e as Error).message);
      return [];
    }
  }, []);

  const [llmDetail, setLlmDetail] = useState("");
  const refreshHealth = useCallback(() => {
    api
      .health()
      .then((h) => {
        setLlm(h.llm_ready);
        setLlmDetail(h.llm_detail);
      })
      .catch(() => setLlm(null));
  }, []);

  useEffect(() => {
    reloadCourses();
    refreshHealth();
  }, [reloadCourses, refreshHealth]);

  const value = useMemo<Ctx>(
    () => ({
      theme: dark ? darkTheme : lightTheme,
      toggleTheme: () =>
        setDark((d) => {
          save("revisa.theme", d ? "light" : "dark");
          return !d;
        }),
      courses,
      course: courses.find((c) => c.id === courseId) ?? null,
      setCourseId: (id) => {
        save("revisa.course", String(id));
        setCourseIdState(id);
      },
      reloadCourses,
      toasts,
      toast,
      backendError,
      llmConfigured,
      llmDetail,
      refreshHealth,
    }),
    [dark, courses, courseId, reloadCourses, toasts, toast, backendError, llmConfigured, llmDetail, refreshHealth],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}

export const useTheme = () => useApp().theme;
