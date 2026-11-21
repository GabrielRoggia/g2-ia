// Perguntar: dúvidas livres respondidas só com o material da disciplina, com fontes citadas.
import { BookOpen, ExternalLink, MessageCircleQuestion, Send } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { View } from "react-native";

import { Guard } from "../components/common";
import { Page } from "../components/Shell";
import { Button, Card, Empty, Input, Skeleton, Tile, Txt, s } from "../components/ui";
import { api, openDocument, Source, sourceDocId } from "../lib/api";
import { useApp, useTheme } from "../lib/store";
import { ICON, palette } from "../lib/theme";

type Turn = { q: string; a?: string; sources?: Source[]; error?: string };

const SUGGESTIONS = ["Qual a diferença entre overfitting e underfitting?", "Como funciona o backpropagation?", "Para que serve a função de ativação?"];

function Sources({ sources }: { sources: Source[] }) {
  const t = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={{ gap: 6 }}>
      <Txt size={11} weight="bold" tone={3} style={{ textTransform: "uppercase", letterSpacing: 0.8 }}>
        Fontes
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {sources.map((src) => (
          <Tile key={src.id} onPress={() => setOpen(open === src.n ? null : src.n ?? null)} active={open === src.n} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
            <View style={s.row}>
              <Txt size={11.5} weight="bold" color={palette.accent}>
                [{src.n}]
              </Txt>
              <Txt size={11.5} tone={2} numberOfLines={1}>
                {src.doc_name}, p. {src.page}
              </Txt>
            </View>
          </Tile>
        ))}
      </View>
      {open != null && (
        <View style={{ padding: 10, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: palette.accent, backgroundColor: t.surface2 }}>
          <Txt size={12} tone={2}>
            “{sources.find((x) => x.n === open)?.excerpt}…”
          </Txt>
          <Button
            variant="ghost"
            size="sm"
            icon={ExternalLink}
            label="Abrir documento"
            style={{ alignSelf: "flex-start", marginTop: 4 }}
            onPress={() => {
              const src = sources.find((x) => x.n === open);
              if (src) openDocument(sourceDocId(src), src.page);
            }}
          />
        </View>
      )}
    </View>
  );
}

export default function Perguntar() {
  const t = useTheme();
  const { course } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setTurns([]), [course?.id]);

  const send = async (question?: string) => {
    const q = (question ?? text).trim();
    if (!q || !course || busy) return;
    setText("");
    setBusy(true);
    setTurns((ts) => [...ts, { q }]);
    try {
      const r = await api.ask(course.id, q);
      setTurns((ts) => ts.map((x, i) => (i === ts.length - 1 ? { ...x, a: r.answer, sources: r.sources } : x)));
    } catch (e) {
      setTurns((ts) => ts.map((x, i) => (i === ts.length - 1 ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page icon={MessageCircleQuestion} title="Perguntar" crumb="Respostas só com base no seu material">
      <Guard>
        {() => (
          <View style={{ gap: 16, maxWidth: 900, width: "100%", alignSelf: "center" }}>
            {turns.length === 0 ? (
              <Card>
                <Empty icon={MessageCircleQuestion} title="Tire uma dúvida sobre a matéria" text="O tutor busca os trechos mais relevantes dos seus materiais e responde citando a página de onde tirou cada informação." />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {SUGGESTIONS.map((sug) => (
                    <Tile key={sug} onPress={() => send(sug)} style={{ paddingVertical: 8 }}>
                      <Txt size={12} tone={2}>
                        {sug}
                      </Txt>
                    </Tile>
                  ))}
                </View>
              </Card>
            ) : (
              turns.map((turn, i) => (
                <View key={i} style={{ gap: 10 }}>
                  <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: palette.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderBottomRightRadius: 4 }}>
                    <Txt size={13} color="#fff">
                      {turn.q}
                    </Txt>
                  </View>
                  <Card style={{ gap: 12, maxWidth: "95%" }}>
                    <View style={s.row}>
                      <BookOpen size={16} strokeWidth={ICON.stroke} color={palette.accent} />
                      <Txt size={12} weight="semibold" tone={2}>
                        Tutor
                      </Txt>
                    </View>
                    {turn.error ? (
                      <Txt size={13} color={t.badText}>
                        {turn.error}
                      </Txt>
                    ) : turn.a ? (
                      <>
                        <Txt size={13.5} style={{ lineHeight: 21 }}>
                          {turn.a}
                        </Txt>
                        {turn.sources?.length ? <Sources sources={turn.sources} /> : null}
                      </>
                    ) : (
                      <View style={{ gap: 8 }}>
                        <Skeleton height={12} />
                        <Skeleton height={12} width="80%" />
                        <Skeleton height={12} width="60%" />
                      </View>
                    )}
                  </Card>
                </View>
              ))
            )}
            <View style={[s.row, { alignItems: "flex-end" }]}>
              <Input
                value={text}
                onChangeText={setText}
                placeholder="Escreva sua dúvida..."
                onSubmitEditing={() => send()}
                returnKeyType="send"
                style={{ flex: 1 }}
              />
              <Button variant="primary" icon={Send} label="Enviar" onPress={() => send()} loading={busy} disabled={!text.trim()} />
            </View>
          </View>
        )}
      </Guard>
    </Page>
  );
}
