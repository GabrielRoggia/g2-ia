// Cliente HTTP do backend FastAPI.
import { Linking, Platform } from "react-native";

const DEFAULT_URL = Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_URL).replace(/\/$/, "");

export type Course = { id: number; name: string; created_at: string; documents: number };
export type Doc = { id: number; course_id: number; name: string; pages: number; chunks: number; created_at: string };
export type TopicStat = {
  topic: string;
  description: string;
  answered: number;
  correct: number;
  accuracy: number | null;
  mastery: number;
};
export type Source = { id: string; doc_name: string; page: number; excerpt: string; n?: number };
export type Question = {
  id: number;
  topic: string;
  difficulty: "facil" | "media" | "dificil";
  question: string;
  options: string[];
  sources: Source[];
  correct_index?: number;
  explanation?: string;
};
export type Quiz = { id: number; course_id: number; mode: string; topics: string[]; questions: Question[] };
export type QuizResult = {
  quiz_id: number;
  score: number;
  total: number;
  accuracy: number;
  results: (Question & { chosen_index: number; correct: boolean; correct_index: number; explanation: string })[];
  weak_topics: TopicStat[];
};
export type Dashboard = {
  documents: number;
  chunks: number;
  quizzes: number;
  answered: number;
  accuracy: number | null;
  topics: TopicStat[];
  weak_topics: TopicStat[];
  history: QuizHistoryItem[];
};
export type QuizHistoryItem = {
  quiz_id: number;
  created_at: string;
  answered_at: string;
  mode: QuizMode;
  topics: string[];
  score: number;
  total: number;
  accuracy: number;
};
export type QuizReview = QuizResult & { course_id: number; mode: QuizMode; topics: string[]; answered_at: string };
export type QuizMode = "adaptive" | "mixed" | "topic";
export type Provider = "ollama" | "claude_code" | "anthropic";
export type AISettings = {
  provider: Provider;
  ollama_url: string;
  ollama_model: string;
  claude_code_path: string;
  claude_code_model: "sonnet" | "opus" | "haiku";
  anthropic_model: "claude-opus-5-5" | "claude-sonnet-5-5" | "claude-haiku-5-5";
};
export type ClaudeLoginState = { state: "idle" | "waiting" | "done" | "error"; url: string | null; detail: string };
export type ProviderStatus = { ok: boolean; detail: string; models?: string[]; running?: boolean; path?: string | null };
export type SettingsState = {
  settings: AISettings;
  providers: Record<Provider, ProviderStatus>;
  ready: boolean;
};

/** Abre o arquivo original em outra guia; em PDFs, já na página indicada. */
export function openDocument(docId: number, page?: number) {
  const url = `${API_URL}/documents/${docId}/file${page ? `#page=${page}` : ""}`;
  if (Platform.OS === "web") window.open(url, "_blank", "noopener");
  else Linking.openURL(url);
}

/** O id de um trecho tem o formato "<documento>-<posição>". */
export const sourceDocId = (source: Source) => Number(source.id.split("-")[0]);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error(`Não consegui falar com o servidor em ${API_URL}. O backend está rodando?`);
  }
  if (!res.ok) {
    let detail = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () => request<{ ok: boolean; model: string; llm_ready: boolean; provider: string; llm_detail: string }>("/health"),
  courses: () => request<Course[]>("/courses"),
  createCourse: (name: string) => request<Course>("/courses", json({ name })),
  deleteCourse: (id: number) => request<void>(`/courses/${id}`, { method: "DELETE" }),
  documents: (courseId: number) => request<Doc[]>(`/courses/${courseId}/documents`),
  deleteDocument: (id: number) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  upload: (courseId: number, form: FormData, updateTopics = true) =>
    request<{ document: Doc; topics: unknown[]; warning: string | null }>(`/courses/${courseId}/documents?update_topics=${updateTopics}`, {
      method: "POST",
      body: form,
    }),
  topics: (courseId: number) => request<TopicStat[]>(`/courses/${courseId}/topics`),
  refreshTopics: (courseId: number) => request<unknown>(`/courses/${courseId}/topics/refresh`, { method: "POST" }),
  dashboard: (courseId: number) => request<Dashboard>(`/courses/${courseId}/dashboard`),
  createQuiz: (courseId: number, body: { n: number; mode: QuizMode; topics?: string[] | null }) =>
    request<Quiz>(`/courses/${courseId}/quizzes`, json(body)),
  answer: (quizId: number, answers: { question_id: number; chosen_index: number }[]) =>
    request<QuizResult>(`/quizzes/${quizId}/answers`, json({ answers })),
  clearHistory: (courseId: number) => request<{ removed: number }>(`/courses/${courseId}/history`, { method: "DELETE" }),
  review: (quizId: number) => request<QuizReview>(`/quizzes/${quizId}/review`),
  settings: () => request<SettingsState>("/settings"),
  saveSettings: (s: AISettings) =>
    request<SettingsState>("/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }),
  claudeLoginStart: () => request<ClaudeLoginState>("/settings/claude-login", { method: "POST" }),
  claudeLoginStatus: () => request<ClaudeLoginState>("/settings/claude-login"),
  claudeLoginCode: (code: string) => request<ClaudeLoginState>("/settings/claude-login/code", json({ code })),
  claudeLoginCancel: () => request<ClaudeLoginState>("/settings/claude-login", { method: "DELETE" }),
  testSettings: () => request<{ ok: boolean; message: string; seconds: number; provider: Provider }>("/settings/test", { method: "POST" }),
  ask: (courseId: number, question: string) =>
    request<{ answer: string; sources: Source[] }>(`/courses/${courseId}/ask`, json({ question })),
};
