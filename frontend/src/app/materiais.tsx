// Materiais: disciplinas, envio de PDF/PPTX/TXT, documentos indexados e tópicos.
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ExternalLink, FileText, Layers, Library, Plus, RefreshCw, Trash2, Upload } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";

import { ErrorNote, Guard, useCourseData } from "../components/common";
import { Drawer } from "../components/Drawer";
import { DropZone } from "../components/DropZone";
import { Page } from "../components/Shell";
import { Button, Col, Empty, Field, Grid, Input, Panel, Skeleton, Tag, Tile, Txt, s } from "../components/ui";
import { api, Doc, openDocument, TopicStat } from "../lib/api";
import { useApp, useTheme } from "../lib/store";
import { font, ICON, palette } from "../lib/theme";

function NewCourse({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reloadCourses, setCourseId, toast } = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await api.createCourse(name.trim());
      await reloadCourses();
      setCourseId(c.id);
      toast(`Disciplina "${c.name}" criada`);
      setName("");
      onClose();
    } catch (e) {
      toast((e as Error).message, { bad: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Nova disciplina"
      footer={
        <>
          <Button label="Cancelar" onPress={onClose} />
          <Button variant="primary" label="Salvar" onPress={save} loading={busy} disabled={!name.trim()} />
        </>
      }
    >
      <Field label="Nome" required hint="Ex.: Inteligência Artificial II">
        <Input value={name} onChangeText={setName} placeholder="Nome da disciplina" autoFocus onSubmitEditing={save} />
      </Field>
    </Drawer>
  );
}

function DocsTable({ docs, onDelete }: { docs: Doc[]; onDelete: (d: Doc) => void }) {
  const t = useTheme();
  const cols = [
    { k: "name", label: "Documento", w: 300 },
    { k: "pages", label: "Páginas", w: 90 },
    { k: "chunks", label: "Trechos", w: 90 },
    { k: "created_at", label: "Enviado em", w: 130 },
    { k: "act", label: "", w: 60 },
  ];
  const cell = { fontFamily: font.table, fontSize: 13, color: t.text1 };
  return (
    <ScrollView horizontal contentContainerStyle={{ minWidth: "100%" }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", backgroundColor: t.surface2, borderBottomWidth: 1, borderBottomColor: t.line }}>
          {cols.map((c) => (
            <Txt key={c.k} size={12} weight="semibold" tone={2} style={{ width: c.w, flexGrow: c.k === "name" ? 1 : 0, paddingVertical: 10, paddingHorizontal: 16, fontFamily: font.tableSemi }}>
              {c.label}
            </Txt>
          ))}
        </View>
        {docs.map((d) => (
          <View key={d.id} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: t.line }}>
            <Pressable
              onPress={() => openDocument(d.id)}
              accessibilityRole="link"
              accessibilityLabel={`Abrir ${d.name} em outra guia`}
              style={(st) => ({
                width: 300,
                flexGrow: 1,
                paddingVertical: 13,
                paddingHorizontal: 16,
                flexDirection: "row",
                gap: 10,
                alignItems: "center",
                backgroundColor: (st as { hovered?: boolean }).hovered ? t.hover : "transparent",
              })}
            >
              <FileText size={16} strokeWidth={ICON.stroke} color={palette.accent} />
              <Txt style={[cell, { flexShrink: 1 }]} numberOfLines={1}>
                {d.name}
              </Txt>
              <ExternalLink size={13} strokeWidth={ICON.stroke} color={t.text4} />
            </Pressable>
            <Txt style={[cell, { width: 90, paddingHorizontal: 16 }]} tabular>
              {d.pages}
            </Txt>
            <Txt style={[cell, { width: 90, paddingHorizontal: 16 }]} tabular>
              {d.chunks}
            </Txt>
            <Txt style={[cell, { width: 130, paddingHorizontal: 16, color: t.text3 }]}>{new Date(d.created_at).toLocaleDateString("pt-BR")}</Txt>
            <View style={{ width: 60, alignItems: "center" }}>
              <Button variant="ghost" size="sm" icon={Trash2} accessibilityLabel={`Excluir ${d.name}`} onPress={() => onDelete(d)} />
            </View>
          </View>
        ))}
        <Txt size={11.5} tone={4} style={{ padding: 12, paddingHorizontal: 16 }}>
          Mostrando {docs.length} {docs.length === 1 ? "documento" : "documentos"}
        </Txt>
      </View>
    </ScrollView>
  );
}

async function pickedToForm(asset: DocumentPicker.DocumentPickerAsset): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === "web" && asset.file) {
    form.append("file", asset.file, asset.name);
  } else {
    // React Native aceita { uri, name, type } como arquivo no FormData
    form.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/octet-stream" } as unknown as Blob);
  }
  return form;
}

const ACCEPTED = [".pdf", ".pptx", ".txt", ".md"];

type QueueItem = { id: string; courseId: number; name: string; status: "waiting" | "sending" | "done" | "error"; detail?: string };
type Job = { id: string; courseId: number; toForm: () => Promise<FormData> };

function UploadQueue({ items, updatingTopics, onClear }: { items: QueueItem[]; updatingTopics: boolean; onClear?: () => void }) {
  const t = useTheme();
  const done = items.filter((i) => i.status === "done").length;
  const label = { waiting: "Na fila", sending: "Enviando", done: "Concluído", error: "Erro" } as const;
  const tone = { waiting: "none", sending: "accent", done: "ok", error: "bad" } as const;
  return (
    <Panel
      title={`Envio · ${done} de ${items.length}`}
      right={onClear ? <Button variant="ghost" size="sm" label="Limpar" onPress={onClear} /> : updatingTopics ? <Tag label="Atualizando tópicos" /> : undefined}
      bodyStyle={{ padding: 0 }}
    >
      {items.map((item, i) => (
        <View key={item.id} style={[s.between, { paddingHorizontal: 16, paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }]}>
          <View style={[s.row, { flex: 1, minWidth: 0 }]}>
            <FileText size={16} strokeWidth={ICON.stroke} color={item.status === "error" ? t.badText : palette.accent} />
            <Txt size={12.5} numberOfLines={1} style={{ flexShrink: 1 }}>
              {item.name}
            </Txt>
            {item.detail ? (
              <Txt size={11.5} tone={item.status === "error" ? undefined : 4} color={item.status === "error" ? t.badText : undefined} numberOfLines={1} style={{ flexShrink: 1 }}>
                {item.detail}
              </Txt>
            ) : null}
          </View>
          <Tag label={label[item.status]} tone={tone[item.status]} dot />
        </View>
      ))}
    </Panel>
  );
}

export default function Materiais() {
  const params = useLocalSearchParams<{ nova?: string }>();
  const router = useRouter();
  const { course, toast, reloadCourses } = useApp();
  const [newOpen, setNewOpen] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [updatingTopics, setUpdatingTopics] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const docs = useCourseData((id) => api.documents(id));
  const topics = useCourseData((id) => api.topics(id));
  const pending = useRef<Job[]>([]);
  const running = useRef(false);
  const latest = useRef({ docs, topics });
  latest.current = { docs, topics };
  const uploading = updatingTopics || queue.some((q) => q.status === "waiting" || q.status === "sending");

  useEffect(() => {
    if (params.nova) {
      setNewOpen(true);
      router.setParams({ nova: undefined });
    }
  }, [params.nova, router]);

  const patch = (id: string, change: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...change } : x)));

  // Envia um arquivo por vez e, no fim, atualiza os tópicos uma única vez com todo o material.
  const runQueue = async () => {
    if (running.current) return;
    running.current = true;
    do {
      const touched = new Set<number>();
      let sent = 0;
      for (let job = pending.current.shift(); job; job = pending.current.shift()) {
        patch(job.id, { status: "sending" });
        try {
          const out = await api.upload(job.courseId, await job.toForm(), false);
          patch(job.id, { status: "done", detail: `${out.document.chunks} ${out.document.chunks === 1 ? "trecho" : "trechos"}` });
          touched.add(job.courseId);
          sent += 1;
          await Promise.all([latest.current.docs.reload(), reloadCourses()]);
        } catch (e) {
          patch(job.id, { status: "error", detail: (e as Error).message });
        }
      }
      if (touched.size) {
        setUpdatingTopics(true);
        for (const id of touched) {
          try {
            await api.refreshTopics(id);
          } catch (e) {
            toast(`Material indexado, mas os tópicos não foram gerados: ${(e as Error).message}`, { bad: true });
          }
        }
        setUpdatingTopics(false);
        await latest.current.topics.reload();
        toast(sent === 1 ? "1 material adicionado" : `${sent} materiais adicionados`);
      }
    } while (pending.current.length);
    running.current = false;
  };

  const enqueue = (files: { name: string; toForm: () => Promise<FormData> }[]) => {
    if (!course) return;
    const known = new Set([
      ...(docs.data ?? []).map((d) => d.name.toLowerCase()),
      ...queue.filter((q) => q.courseId === course.id && q.status !== "error").map((q) => q.name.toLowerCase()),
    ]);
    const items: QueueItem[] = [];
    for (const f of files) {
      const id = `${Date.now()}-${Math.random()}`;
      const key = f.name.toLowerCase();
      const ext = key.slice(key.lastIndexOf("."));
      if (!ACCEPTED.includes(ext)) {
        items.push({ id, courseId: course.id, name: f.name, status: "error", detail: "Formato não aceito" });
      } else if (known.has(key)) {
        items.push({ id, courseId: course.id, name: f.name, status: "error", detail: "Já existe nesta disciplina" });
      } else {
        known.add(key);
        items.push({ id, courseId: course.id, name: f.name, status: "waiting" });
        pending.current.push({ id, courseId: course.id, toForm: f.toForm });
      }
    }
    setQueue((q) => [...q.filter((x) => x.status === "waiting" || x.status === "sending"), ...items]);
    runQueue();
  };

  const onDrop = (files: File[]) =>
    enqueue(
      files.map((file) => ({
        name: file.name,
        toForm: async () => {
          const form = new FormData();
          form.append("file", file, file.name);
          return form;
        },
      })),
    );

  const upload = async () => {
    if (!course) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/markdown", "*/*"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    enqueue(res.assets.map((asset) => ({ name: asset.name, toForm: () => pickedToForm(asset) })));
  };

  const remove = async (d: Doc) => {
    try {
      await api.deleteDocument(d.id);
      toast(`"${d.name}" removido`);
      await Promise.all([docs.reload(), reloadCourses()]);
    } catch (e) {
      toast((e as Error).message, { bad: true });
    }
  };

  const refresh = async () => {
    if (!course) return;
    setRefreshing(true);
    try {
      await api.refreshTopics(course.id);
      await topics.reload();
      toast("Tópicos atualizados");
    } catch (e) {
      toast((e as Error).message, { bad: true });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Page icon={Library} title="Materiais" crumb={course ? `Disciplina · ${course.name}` : "Disciplinas e documentos"}>
      <NewCourse open={newOpen} onClose={() => setNewOpen(false)} />
      <Guard>
        {(c) => (
          <View style={{ gap: 16 }}>
            <View style={[s.between, { flexWrap: "wrap" }]}>
              <Txt size={12.5} tone={3} style={{ flex: 1, minWidth: 220 }}>
                Envie os slides e PDFs da disciplina. O texto é dividido em trechos, indexado para busca e a IA identifica os tópicos.
              </Txt>
              <View style={s.row}>
                <Button icon={Plus} label="Nova disciplina" onPress={() => setNewOpen(true)} />
                <Button variant="primary" icon={Upload} label={uploading ? "Enviando..." : "Enviar material"} onPress={upload} />
              </View>
            </View>
            {queue.length > 0 && <UploadQueue items={queue} updatingTopics={updatingTopics} onClear={uploading ? undefined : () => setQueue([])} />}
            {docs.error && <ErrorNote text={docs.error} />}
            <Grid>
              <Col span={8}>
                <DropZone onFiles={onDrop}>
                  <Panel title="Documentos" right={<Tag label={`${c.documents}`} />} bodyStyle={{ padding: 0 }}>
                    {!docs.data ? (
                      <View style={{ padding: 16, gap: 10 }}>
                        {[0, 1, 2].map((i) => (
                          <Skeleton key={i} height={18} />
                        ))}
                      </View>
                    ) : docs.data.length === 0 ? (
                      <Empty
                        icon={FileText}
                        title={Platform.OS === "web" ? "Arraste os arquivos para cá" : "Nenhum documento encontrado"}
                        text={Platform.OS === "web" ? "Ou clique para escolher um ou vários. Formatos aceitos: PDF, PPTX, TXT e MD." : "Formatos aceitos: PDF, PPTX, TXT e MD."}
                        action={<Button variant="primary" icon={Upload} label="Enviar material" onPress={upload} />}
                      />
                    ) : (
                      <>
                        <DocsTable docs={docs.data} onDelete={remove} />
                        {Platform.OS === "web" && (
                          <Txt size={11.5} tone={4} style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                            Arraste mais arquivos para esta área para adicionar.
                          </Txt>
                        )}
                      </>
                    )}
                  </Panel>
                </DropZone>
              </Col>
              <Col span={4}>
                <Panel title="Tópicos identificados" right={<Button variant="ghost" size="sm" icon={RefreshCw} accessibilityLabel="Atualizar tópicos" loading={refreshing} onPress={refresh} />}>
                  {!topics.data ? (
                    <Skeleton height={80} />
                  ) : topics.data.length === 0 ? (
                    <Empty icon={Layers} title="Nenhum tópico ainda" text="Aparecem depois do primeiro envio." />
                  ) : (
                    <View style={{ gap: 8 }}>
                      {topics.data.map((tp: TopicStat) => (
                        <Tile key={tp.topic}>
                          <Txt size={12.5} weight="semibold">
                            {tp.topic}
                          </Txt>
                          {tp.description ? (
                            <Txt size={11.5} tone={3} style={{ marginTop: 2 }}>
                              {tp.description}
                            </Txt>
                          ) : null}
                        </Tile>
                      ))}
                    </View>
                  )}
                </Panel>
              </Col>
            </Grid>
          </View>
        )}
      </Guard>
    </Page>
  );
}
