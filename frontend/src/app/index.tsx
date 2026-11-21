// Painel: visão geral do estudo na disciplina ativa.
import { useRouter } from "expo-router";
import { ChevronRight, CircleCheck, FileText, Gauge, Layers, ListChecks, Sparkles, Target, Trash2, TrendingUp } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { Guard, StatStrip, useCourseData } from "../components/common";
import { Page } from "../components/Shell";
import { Button, Card, Col, Empty, Grid, Meter, Panel, Skeleton, Tag, Txt, masteryTone, pct, s } from "../components/ui";
import { api, Dashboard } from "../lib/api";
import { useApp, useTheme } from "../lib/store";
import { palette, tint } from "../lib/theme";

const MODE_LABEL = { adaptive: "Adaptativo", mixed: "Misto", topic: "Por tópico" } as const;

function History({ data }: { data: Dashboard }) {
  const router = useRouter();
  const t = useTheme();
  if (!data.history.length) {
    return <Empty icon={TrendingUp} title="Nenhum quiz respondido" text="Sua evolução aparece aqui depois do primeiro quiz." />;
  }
  const open = (id: number) => router.navigate(`/quiz?revisar=${id}` as never);
  const numbered = data.history.map((h, i) => ({ ...h, n: i + 1 }));
  return (
    <View style={{ gap: 14 }}>
      <View style={{ height: 180, flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 12 }}>
        {numbered.map((h) => (
          <Pressable
            key={h.quiz_id}
            onPress={() => open(h.quiz_id)}
            accessibilityRole="button"
            accessibilityLabel={`Revisar quiz ${h.n}, ${pct(h.accuracy)} de acerto`}
            style={(st) => ({
              flex: 1,
              alignItems: "center",
              gap: 6,
              height: "100%",
              justifyContent: "flex-end",
              borderRadius: 8,
              backgroundColor: (st as { hovered?: boolean }).hovered ? t.hover : "transparent",
            })}
          >
            <Txt size={10.5} tone={3} tabular>
              {pct(h.accuracy)}
            </Txt>
            <View
              style={{
                width: "100%",
                maxWidth: 36,
                height: `${Math.max(4, h.accuracy * 78)}%`,
                borderRadius: 6,
                backgroundColor: h.accuracy >= 0.7 ? palette.success : h.accuracy >= 0.45 ? palette.warning : palette.danger,
                opacity: 0.85,
              }}
            />
            <Txt size={10} tone={4}>
              #{h.n}
            </Txt>
          </Pressable>
        ))}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: t.line }}>
        {numbered
          .slice()
          .reverse()
          .map((h) => (
            <Pressable
              key={h.quiz_id}
              onPress={() => open(h.quiz_id)}
              accessibilityRole="button"
              accessibilityLabel={`Revisar quiz ${h.n}`}
              style={(st) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
                paddingHorizontal: 6,
                borderBottomWidth: 1,
                borderBottomColor: t.lineSoft,
                backgroundColor: (st as { hovered?: boolean }).hovered ? t.hover : "transparent",
              })}
            >
              <Txt size={12} weight="semibold" tone={3} tabular style={{ width: 30 }}>
                #{h.n}
              </Txt>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt size={12.5} weight="medium" numberOfLines={1}>
                  {h.topics.join(" · ")}
                </Txt>
                <Txt size={11} tone={4} numberOfLines={1}>
                  {new Date(h.answered_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {MODE_LABEL[h.mode]}
                </Txt>
              </View>
              <Txt size={12} tone={2} tabular>
                {h.score}/{h.total}
              </Txt>
              <Tag label={pct(h.accuracy)} tone={masteryTone(h.accuracy)} dot />
              <ChevronRight size={16} strokeWidth={1.75} color={t.text4} />
            </Pressable>
          ))}
      </View>
    </View>
  );
}

export default function Painel() {
  const router = useRouter();
  const t = useTheme();
  const { course, toast } = useApp();
  const { data, reload } = useCourseData((id) => api.dashboard(id));
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => setConfirming(false), [course?.id]);

  const clearHistory = async () => {
    if (!course) return;
    setClearing(true);
    try {
      await api.clearHistory(course.id);
      await reload();
      setConfirming(false);
      toast("Histórico limpo");
    } catch (e) {
      toast((e as Error).message, { bad: true });
    } finally {
      setClearing(false);
    }
  };

  return (
    <Page icon={Gauge} title="Painel" crumb="Visão geral do estudo">
      <Guard>
        {() =>
          !data ? (
            <View style={{ gap: 16 }}>
              <Skeleton height={96} />
              <Skeleton height={240} />
            </View>
          ) : (
            <Grid>
              <Col span={12}>
                <StatStrip
                  items={[
                    { label: "Materiais", value: String(data.documents), icon: FileText, onPress: () => router.navigate("/materiais") },
                    { label: "Trechos indexados", value: String(data.chunks), icon: Layers },
                    { label: "Questões respondidas", value: String(data.answered), icon: ListChecks, onPress: () => router.navigate("/quiz") },
                    { label: "Acerto geral", value: pct(data.accuracy), icon: CircleCheck },
                  ]}
                />
              </Col>

              <Col span={8}>
                <Panel title="Domínio por tópico" right={<Tag label={`${data.topics.length} tópicos`} />}>
                  {data.topics.length === 0 ? (
                    <Empty icon={Layers} title="Nenhum tópico ainda" text="Os tópicos são identificados pela IA quando você envia um material." action={<Button variant="primary" label="Enviar material" onPress={() => router.navigate("/materiais")} />} />
                  ) : (
                    <View style={{ gap: 14 }}>
                      {data.topics
                        .slice()
                        .sort((a, b) => a.topic.localeCompare(b.topic))
                        .map((tp) => (
                          <View key={tp.topic} style={{ gap: 6 }}>
                            <View style={s.between}>
                              <Txt size={12.5} weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                                {tp.topic}
                              </Txt>
                              <Txt size={11.5} tone={3} tabular>
                                {tp.answered ? `${tp.correct}/${tp.answered} · ` : "sem respostas · "}
                                {pct(tp.mastery)}
                              </Txt>
                            </View>
                            <Meter value={tp.mastery} color={tp.answered ? undefined : t.lineStrong} />
                          </View>
                        ))}
                    </View>
                  )}
                </Panel>
              </Col>

              <Col span={4}>
                <Panel title="Pontos fracos" right={<Target size={16} color={palette.accent} strokeWidth={1.75} />}>
                  {data.weak_topics.length === 0 ? (
                    data.answered ? (
                      <Empty icon={Target} title="Nenhum ponto fraco agora" text="Todos os tópicos respondidos estão com 70% de acerto ou mais. Continue treinando os que faltam." />
                    ) : (
                      <Empty icon={Target} title="Sem diagnóstico ainda" text="Responda um quiz para o tutor descobrir onde você precisa reforçar." />
                    )
                  ) : (
                    <View style={{ gap: 10 }}>
                      {data.weak_topics.map((w) => (
                        <Card key={w.topic} style={{ padding: 12, borderRadius: 12, backgroundColor: t.surface2, borderWidth: 0 }}>
                          <View style={s.between}>
                            <Txt size={12.5} weight="semibold" numberOfLines={2} style={{ flex: 1 }}>
                              {w.topic}
                            </Txt>
                            <Tag label={pct(w.accuracy)} tone={masteryTone(w.accuracy)} dot />
                          </View>
                          {w.description ? (
                            <Txt size={11.5} tone={3} numberOfLines={2} style={{ marginTop: 4 }}>
                              {w.description}
                            </Txt>
                          ) : null}
                        </Card>
                      ))}
                    </View>
                  )}
                  <Button
                    variant="primary"
                    icon={Sparkles}
                    label="Treinar pontos fracos"
                    style={{ marginTop: 14 }}
                    disabled={data.topics.length === 0}
                    onPress={() => router.navigate("/quiz?modo=adaptive")}
                  />
                </Panel>
              </Col>

              <Col span={12}>
                <Panel
                  title="Histórico de quizzes"
                  right={
                    data.history.length > 0 ? (
                      <View style={s.row}>
                        <Txt size={11} tone={4} numberOfLines={1}>
                          clique para revisar
                        </Txt>
                        <Button variant="ghost" size="sm" icon={Trash2} label="Limpar histórico" onPress={() => setConfirming(true)} />
                      </View>
                    ) : undefined
                  }
                >
                  {confirming && (
                    <View style={{ gap: 10, padding: 12, marginBottom: 14, borderRadius: 12, backgroundColor: tint(palette.danger, 0.1), borderWidth: 1, borderColor: tint(palette.danger, 0.3) }}>
                      <Txt size={13} weight="semibold">
                        Limpar o histórico desta disciplina?
                      </Txt>
                      <Txt size={12} tone={2}>
                        Apaga {data.quizzes === 1 ? "1 quiz" : `${data.quizzes} quizzes`} com as respostas e zera o acerto, o domínio por tópico e os pontos fracos. Os materiais e os tópicos continuam. Não dá para desfazer.
                      </Txt>
                      <View style={[s.row, { justifyContent: "flex-end" }]}>
                        <Button size="sm" label="Cancelar" disabled={clearing} onPress={() => setConfirming(false)} />
                        <Button size="sm" variant="danger" icon={Trash2} label="Limpar" loading={clearing} onPress={clearHistory} />
                      </View>
                    </View>
                  )}
                  <History data={data} />
                </Panel>
              </Col>
            </Grid>
          )
        }
      </Guard>
    </Page>
  );
}
