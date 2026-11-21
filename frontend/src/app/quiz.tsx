// Quiz: configuração, resolução questão a questão e resultado com explicação e fontes.
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleCheck, CircleX, ExternalLink, Gauge, ListChecks, RotateCcw, Sparkles, Target } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { ErrorNote, Guard, useCourseData } from "../components/common";
import { Page } from "../components/Shell";
import { Button, Card, Col, Empty, Field, Grid, IconCircle, Input, Meter, Panel, Seg, Skeleton, Tag, Tile, Txt, masteryTone, pct, s } from "../components/ui";
import { api, openDocument, Quiz, QuizMode, QuizResult, QuizReview, Source, sourceDocId } from "../lib/api";
import { useApp, useTheme } from "../lib/store";
import { ICON, palette, radius, tint } from "../lib/theme";

const LETTERS = ["A", "B", "C", "D"];
const MAX_QUESTIONS = 30;

function SourceList({ sources }: { sources: Source[] }) {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={{ gap: 6 }}>
      {sources.map((src) => (
        <Pressable key={src.id} onPress={() => setOpen(open === src.id ? null : src.id)}>
          <View style={[s.row, { flexWrap: "wrap" }]}>
            <BookOpen size={14} strokeWidth={ICON.stroke} color={palette.accent} />
            <Txt size={12} weight="medium" color={palette.accent}>
              {src.doc_name}, p. {src.page}
            </Txt>
            <Txt size={11} tone={4}>
              {open === src.id ? "ocultar trecho" : "ver trecho"}
            </Txt>
          </View>
          {open === src.id && (
            <View style={{ marginTop: 6, padding: 10, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: palette.accent, backgroundColor: t.surface2 }}>
              <Txt size={12} tone={2}>
                “{src.excerpt}{src.excerpt.length >= 400 ? "…" : ""}”
              </Txt>
              <Button variant="ghost" size="sm" icon={ExternalLink} label="Abrir documento" style={{ alignSelf: "flex-start", marginTop: 4 }} onPress={() => openDocument(sourceDocId(src), src.page)} />
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function Option({ index, text, selected, state, onPress }: { index: number; text: string; selected: boolean; state?: "right" | "wrong"; onPress?: () => void }) {
  const t = useTheme();
  const color = state === "right" ? palette.success : state === "wrong" ? palette.danger : selected ? palette.accent : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={(st) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: color ?? t.line,
        backgroundColor: color ? tint(color, 0.1) : (st as { hovered?: boolean }).hovered ? t.hover : t.surface2,
      })}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: color ?? t.raised, borderWidth: color ? 0 : 1, borderColor: t.line }}>
        <Txt size={12} weight="bold" color={color ? "#fff" : t.text2}>
          {LETTERS[index]}
        </Txt>
      </View>
      <Txt size={13} style={{ flex: 1 }}>
        {text}
      </Txt>
      {state === "right" && <CircleCheck size={18} strokeWidth={ICON.stroke} color={palette.success} />}
      {state === "wrong" && <CircleX size={18} strokeWidth={ICON.stroke} color={palette.danger} />}
    </Pressable>
  );
}

function Setup({ courseId, initialMode, onReady }: { courseId: number; initialMode: QuizMode; onReady: (q: Quiz) => void }) {
  const { toast } = useApp();
  const topics = useCourseData((id) => api.topics(id));
  const [mode, setMode] = useState<QuizMode>(initialMode);
  const [nText, setNText] = useState("10");
  const n = Number(nText);
  const validN = Number.isInteger(n) && n >= 1 && n <= MAX_QUESTIONS;
  const [selected, setSelected] = useState<string[]>([]);
  const toggleTopic = (name: string) => setSelected((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      onReady(await api.createQuiz(courseId, { n, mode, topics: mode === "topic" ? selected : null }));
    } catch (e) {
      setError((e as Error).message);
      toast("Não foi possível gerar o quiz", { bad: true });
    } finally {
      setBusy(false);
    }
  };

  const hasTopics = (topics.data?.length ?? 0) > 0;
  const modeText: Record<QuizMode, string> = {
    adaptive: "Foca nos 3 tópicos em que você tem menor domínio, segundo suas respostas anteriores.",
    mixed: "Sorteia tópicos variados do material para uma revisão geral.",
    topic: "As questões são divididas entre os tópicos que você escolher.",
  };

  return (
    <Grid>
      <Col span={8}>
        <Panel title="Novo quiz">
          {!hasTopics && topics.data ? (
            <Empty icon={ListChecks} title="Nenhum tópico encontrado" text="Envie um material na aba Materiais para gerar quizzes." />
          ) : (
            <View style={{ gap: 18 }}>
              <Field label="Modo">
                <Seg<QuizMode>
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "adaptive", label: "Adaptativo" },
                    { value: "mixed", label: "Misto" },
                    { value: "topic", label: "Por tópico" },
                  ]}
                />
                <Txt size={11.5} tone={4}>
                  {modeText[mode]}
                </Txt>
              </Field>
              {mode === "topic" && (
                <Field
                  label="Tópicos"
                  required
                  hint={validN && selected.length > n ? `Com ${n} ${n === 1 ? "questão" : "questões"}, nem todos os ${selected.length} tópicos serão cobertos.` : undefined}
                >
                  <View style={[s.between, { flexWrap: "wrap" }]}>
                    <Txt size={11.5} tone={3}>
                      {selected.length === 0 ? "Nenhum selecionado" : selected.length === 1 ? "1 selecionado" : `${selected.length} selecionados`}
                    </Txt>
                    <View style={s.row}>
                      <Button variant="ghost" size="sm" label="Selecionar todos" onPress={() => setSelected((topics.data ?? []).map((tp) => tp.topic))} />
                      <Button variant="ghost" size="sm" label="Limpar" disabled={selected.length === 0} onPress={() => setSelected([])} />
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {topics.data?.map((tp) => {
                      const on = selected.includes(tp.topic);
                      return (
                        <Tile key={tp.topic} onPress={() => toggleTopic(tp.topic)} active={on} style={{ paddingVertical: 8 }}>
                          <View style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={tp.topic}>
                            {on && <Check size={14} strokeWidth={2} color={palette.accent} />}
                            <Txt size={12} weight={on ? "semibold" : "regular"}>
                              {tp.topic}
                            </Txt>
                          </View>
                        </Tile>
                      );
                    })}
                  </View>
                </Field>
              )}
              <Field label="Quantidade de questões" hint={`Escolha um atalho ou digite de 1 a ${MAX_QUESTIONS}. Quanto mais questões, mais demora para gerar.`}>
                <View style={[s.row, { flexWrap: "wrap" }]}>
                  <Seg<number>
                    value={n}
                    onChange={(v) => setNText(String(v))}
                    options={[5, 10, 15, 20].map((v) => ({ value: v, label: String(v) }))}
                  />
                  <Input
                    value={nText}
                    onChangeText={(v) => setNText(v.replace(/\D/g, "").slice(0, 2))}
                    keyboardType="number-pad"
                    accessibilityLabel="Quantidade de questões"
                    style={{ width: 72, textAlign: "center", borderColor: validN ? undefined : palette.danger }}
                  />
                </View>
              </Field>
              {error && <ErrorNote text={error} />}
              <View style={s.row}>
                <Button
                  variant="primary"
                  icon={Sparkles}
                  label={busy ? "Gerando questões..." : "Gerar quiz"}
                  loading={busy}
                  disabled={!validN || (mode === "topic" && selected.length === 0)}
                  onPress={generate}
                />
                {busy && (
                  <Txt size={11.5} tone={4} style={{ flex: 1 }}>
                    Buscando trechos do material e criando as questões.
                  </Txt>
                )}
              </View>
            </View>
          )}
        </Panel>
      </Col>
      <Col span={4}>
        <Panel title="Seu domínio">
          <View style={{ gap: 12 }}>
            {(topics.data ?? []).map((tp) => (
              <View key={tp.topic} style={{ gap: 5 }}>
                <View style={s.between}>
                  <Txt size={12} numberOfLines={1} style={{ flex: 1 }}>
                    {tp.topic}
                  </Txt>
                  <Txt size={11} tone={3} tabular>
                    {pct(tp.mastery)}
                  </Txt>
                </View>
                <Meter value={tp.mastery} color={tp.answered ? undefined : palette.accent} />
              </View>
            ))}
            {!topics.data?.length && (
              <Txt size={12} tone={4}>
                Sem dados ainda.
              </Txt>
            )}
          </View>
        </Panel>
      </Col>
    </Grid>
  );
}

function Play({ quiz, onDone, onCancel }: { quiz: Quiz; onDone: (r: QuizResult) => void; onCancel: () => void }) {
  const { toast } = useApp();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const q = quiz.questions[i];
  const allAnswered = quiz.questions.every((x) => answers[x.id] !== undefined);
  const last = i === quiz.questions.length - 1;

  const finish = async () => {
    setBusy(true);
    try {
      onDone(await api.answer(quiz.id, quiz.questions.map((x) => ({ question_id: x.id, chosen_index: answers[x.id] }))));
    } catch (e) {
      toast((e as Error).message, { bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 16, maxWidth: 860, width: "100%", alignSelf: "center" }}>
      <View style={s.between}>
        <Txt size={12} tone={3} tabular>
          Questão {i + 1} de {quiz.questions.length}
        </Txt>
        <Tag label={q.topic} tone="info" />
      </View>
      <Meter value={(Object.keys(answers).length || 0) / quiz.questions.length} color={palette.accent} />
      <Txt size={16} weight="semibold" style={{ lineHeight: 24 }}>
        {q.question}
      </Txt>
      <View style={{ gap: 10 }}>
        {q.options.map((opt, k) => (
          <Option key={k} index={k} text={opt} selected={answers[q.id] === k} onPress={() => setAnswers((a) => ({ ...a, [q.id]: k }))} />
        ))}
      </View>
      <View style={[s.between, { flexWrap: "wrap" }]}>
        <Button variant="ghost" label="Cancelar" onPress={onCancel} />
        <View style={s.row}>
          <Button icon={ArrowLeft} label="Anterior" disabled={i === 0} onPress={() => setI(i - 1)} />
          {last ? (
            <Button variant="primary" icon={CircleCheck} label="Finalizar" disabled={!allAnswered} loading={busy} onPress={finish} />
          ) : (
            <Button variant="primary" icon={ArrowRight} label="Próxima" disabled={answers[q.id] === undefined} onPress={() => setI(i + 1)} />
          )}
        </View>
      </View>
    </Card>
  );
}

function Result({ result, answeredAt, onNew, onAdaptive, onBack }: { result: QuizResult; answeredAt?: string; onNew: () => void; onAdaptive: () => void; onBack?: () => void }) {
  const t = useTheme();
  const tone = masteryTone(result.accuracy);
  return (
    <Grid>
      <Col span={4}>
        <Card style={{ gap: 14 }}>
          <View style={s.row}>
            <IconCircle icon={Target} size={52} color={tone === "ok" ? palette.success : tone === "warn" ? palette.warning : palette.danger} />
            <View>
              <Txt size={12} tone={3}>
                {answeredAt ? `Feito em ${new Date(answeredAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : "Resultado"}
              </Txt>
              <Txt size={28} weight="bold" color={palette.accent} tabular>
                {result.score}/{result.total}
              </Txt>
            </View>
          </View>
          <Meter value={result.accuracy} />
          <Txt size={12.5} tone={2}>
            {result.accuracy >= 0.8 ? "Mandou bem! Você domina esse conteúdo." : result.accuracy >= 0.5 ? "Bom caminho. Revise as explicações das que errou." : "Vale revisar esses tópicos com calma antes da prova."}
          </Txt>
          {result.weak_topics.length > 0 && (
            <View style={{ gap: 8 }}>
              <Txt size={11} weight="bold" tone={3} style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
                Reforçar
              </Txt>
              {result.weak_topics.map((w) => (
                <View key={w.topic} style={s.between}>
                  <Txt size={12.5} numberOfLines={1} style={{ flex: 1 }}>
                    {w.topic}
                  </Txt>
                  <Tag label={pct(w.accuracy)} tone={masteryTone(w.accuracy)} dot />
                </View>
              ))}
            </View>
          )}
          <Button variant="primary" icon={Sparkles} label="Quiz nos pontos fracos" onPress={onAdaptive} />
          <Button icon={RotateCcw} label="Configurar novo quiz" onPress={onNew} />
          {onBack && <Button variant="ghost" icon={Gauge} label="Voltar ao histórico" onPress={onBack} />}
        </Card>
      </Col>
      <Col span={8}>
        <View style={{ gap: 12 }}>
          {result.results.map((r, idx) => (
            <Card key={r.id} style={{ gap: 12, borderColor: r.correct ? t.line : tint(palette.danger, 0.35) }}>
              <View style={s.between}>
                <Txt size={12} tone={3}>
                  Questão {idx + 1} · {r.topic}
                </Txt>
                <Tag label={r.correct ? "Acertou" : "Errou"} tone={r.correct ? "ok" : "bad"} dot />
              </View>
              <Txt size={14} weight="semibold">
                {r.question}
              </Txt>
              <View style={{ gap: 8 }}>
                {r.options.map((opt, k) => (
                  <Option key={k} index={k} text={opt} selected={false} state={k === r.correct_index ? "right" : k === r.chosen_index ? "wrong" : undefined} />
                ))}
              </View>
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.surface2, gap: 10 }}>
                <Txt size={12.5} tone={2}>
                  <Txt size={12.5} weight="semibold">
                    Explicação:{" "}
                  </Txt>
                  {r.explanation}
                </Txt>
                <SourceList sources={r.sources} />
              </View>
            </Card>
          ))}
        </View>
      </Col>
    </Grid>
  );
}

export default function QuizScreen() {
  const params = useLocalSearchParams<{ modo?: string; revisar?: string }>();
  const router = useRouter();
  const { course, toast } = useApp();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [review, setReview] = useState<QuizReview | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [mode, setMode] = useState<QuizMode>(params.modo === "adaptive" ? "adaptive" : "mixed");
  const [key, setKey] = useState(0);

  useEffect(() => {
    setQuiz(null);
    setResult(null);
  }, [course?.id]);
  useEffect(() => {
    if (params.modo === "adaptive") setMode("adaptive");
  }, [params.modo]);

  // abre um quiz do histórico (/quiz?revisar=<id>)
  useEffect(() => {
    const id = Number(params.revisar);
    if (!id) {
      setReview(null);
      return;
    }
    let active = true;
    setLoadingReview(true);
    api
      .review(id)
      .then((r) => {
        if (active) setReview(r);
      })
      .catch((e) => {
        if (!active) return;
        toast((e as Error).message, { bad: true });
        router.setParams({ revisar: undefined });
      })
      .finally(() => {
        if (active) setLoadingReview(false);
      });
    return () => {
      active = false;
    };
  }, [params.revisar, router, toast]);

  // ao trocar de disciplina, sai da revisão de um quiz da disciplina anterior
  useEffect(() => {
    if (review && course && review.course_id !== course.id) router.setParams({ revisar: undefined });
  }, [course, review, router]);

  const reset = (m: QuizMode) => {
    setQuiz(null);
    setResult(null);
    setReview(null);
    if (params.revisar) router.setParams({ revisar: undefined });
    setMode(m);
    setKey((k) => k + 1);
  };

  return (
    <Page icon={ListChecks} title="Quiz" crumb={review ? "Revisão do quiz" : result ? "Resultado" : quiz ? "Respondendo" : "Gerado a partir do seu material"}>
      <Guard>
        {(c) =>
          params.revisar && (loadingReview || !review) ? (
            <Skeleton height={240} />
          ) : review ? (
            <Result result={review} answeredAt={review.answered_at} onNew={() => reset("mixed")} onAdaptive={() => reset("adaptive")} onBack={() => router.navigate("/")} />
          ) : result ? (
            <Result result={result} onNew={() => reset("mixed")} onAdaptive={() => reset("adaptive")} />
          ) : quiz ? (
            <Play quiz={quiz} onDone={setResult} onCancel={() => reset(mode)} />
          ) : (
            <Setup key={`${c.id}-${key}-${mode}`} courseId={c.id} initialMode={mode} onReady={setQuiz} />
          )
        }
      </Guard>
    </Page>
  );
}
