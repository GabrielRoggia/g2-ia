// Configurações: provedor e modelo de IA, indicador do modelo ativo e teste de conexão.
import { CircleAlert, CircleCheck, Cloud, Cpu, KeyRound, PlugZap, Save, Settings, Terminal } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { ClaudeLoginModal } from "../components/ClaudeLoginModal";
import { ErrorNote } from "../components/common";
import { Page } from "../components/Shell";
import { Button, Card, Col, Field, Grid, IconCircle, Input, Panel, Skeleton, Tag, Tile, Txt, s } from "../components/ui";
import { AISettings, api, Provider, SettingsState } from "../lib/api";
import { useApp, useTheme } from "../lib/store";
import { palette, radius, tint } from "../lib/theme";

const PROVIDERS: { id: Provider; title: string; text: string; icon: typeof Cpu }[] = [
  { id: "ollama", title: "Ollama (IA local)", text: "Modelo aberto rodando no seu computador. Grátis, sem chave e sem internet.", icon: Cpu },
  { id: "claude_code", title: "Claude Code (assinatura)", text: "Usa o Claude pelo login da sua assinatura neste computador, chamando o Claude Code por baixo. Uso pessoal.", icon: Terminal },
  { id: "anthropic", title: "API do Claude", text: "API oficial com chave (ANTHROPIC_API_KEY no backend/.env). Cobrança por uso.", icon: Cloud },
];

const CLAUDE_CODE_MODELS: { id: AISettings["claude_code_model"]; name: string; text: string }[] = [
  { id: "sonnet", name: "Claude Sonnet", text: "Equilibra qualidade e velocidade." },
  { id: "opus", name: "Claude Opus", text: "Melhor qualidade. Consome mais do limite da assinatura." },
  { id: "haiku", name: "Claude Haiku", text: "O mais rápido e econômico." },
];

const API_MODELS: { id: AISettings["anthropic_model"]; name: string; text: string }[] = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", text: "Melhor qualidade. US$ 4 de entrada e US$ 20 de saída por milhão de tokens." },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", text: "Equilibrado. US$ 2 de entrada e US$ 10 de saída por milhão de tokens." },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", text: "Rápido e barato. US$ 0,10 de entrada e US$ 0,50 de saída por milhão de tokens." },
];

const sameOllamaModel = (a: string, b: string) => a === b || a === `${b}:latest` || b === `${a}:latest`;

function modelOf(c: AISettings): string {
  if (c.provider === "ollama") return c.ollama_model;
  if (c.provider === "claude_code") return CLAUDE_CODE_MODELS.find((m) => m.id === c.claude_code_model)?.name ?? c.claude_code_model;
  return API_MODELS.find((m) => m.id === c.anthropic_model)?.name ?? c.anthropic_model;
}
const providerName = (id: Provider) => PROVIDERS.find((p) => p.id === id)?.title ?? id;

function Mono({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Txt size={11.5} style={{ fontFamily: "monospace", backgroundColor: t.surface2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
      {children}
    </Txt>
  );
}

/** Opção de modelo: marca o selecionado e mostra "Ativo" no que está em uso. */
function ModelOption({ name, text, selected, active, onPress }: { name: string; text?: string; selected: boolean; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      style={(st) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: radius.tile,
        borderWidth: 1,
        borderColor: selected ? palette.accent : t.line,
        backgroundColor: selected ? tint(palette.accent, 0.08) : (st as { hovered?: boolean }).hovered ? t.hover : t.surface2,
      })}
    >
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? palette.accent : t.lineStrong, alignItems: "center", justifyContent: "center" }}>
        {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={13} weight="semibold" numberOfLines={1}>
          {name}
        </Txt>
        {text ? (
          <Txt size={11.5} tone={3}>
            {text}
          </Txt>
        ) : null}
      </View>
      {active && <Tag label="Ativo" tone="ok" dot />}
    </Pressable>
  );
}

function ActiveModel({ state, form, dirty }: { state: SettingsState; form: AISettings; dirty: boolean }) {
  const saved = state.settings;
  const st = state.providers[saved.provider];
  return (
    <Card style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
      <IconCircle icon={state.ready ? CircleCheck : CircleAlert} size={52} color={state.ready ? palette.success : palette.warning} />
      <View style={{ flex: 1, minWidth: 200 }}>
        <Txt size={12} tone={3}>
          Modelo ativo
        </Txt>
        <Txt size={22} weight="bold" color={palette.accent} numberOfLines={1}>
          {modelOf(saved)}
        </Txt>
        <Txt size={12} tone={3} numberOfLines={2}>
          {providerName(saved.provider)}
          {!state.ready && st.detail ? ` · ${st.detail}` : ""}
        </Txt>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Tag label={state.ready ? "Pronto para usar" : "Não está pronto"} tone={state.ready ? "ok" : "warn"} dot />
        {dirty && (
          <Txt size={11.5} tone={3} numberOfLines={1}>
            Selecionado: {modelOf(form)} (não salvo)
          </Txt>
        )}
      </View>
    </Card>
  );
}

export default function Configuracoes() {
  const { toast, refreshHealth } = useApp();
  const [state, setState] = useState<SettingsState | null>(null);
  const [form, setForm] = useState<AISettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const st = await api.settings();
      setState(st);
      setForm(st.settings);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof AISettings>(k: K, v: AISettings[K]) => {
    setTestResult(null);
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };

  const save = async (quiet = false) => {
    if (!form) return false;
    setSaving(true);
    try {
      const st = await api.saveSettings(form);
      setState(st);
      setForm(st.settings);
      refreshHealth();
      if (!quiet) {
        toast(`Modelo ativo: ${modelOf(st.settings)}`);
        if (st.settings.provider === "claude_code" && st.providers.claude_code.path && !st.providers.claude_code.ok) setLoginOpen(true);
      }
      return true;
    } catch (e) {
      toast((e as Error).message, { bad: true });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const test = async (offerLogin = true) => {
    setTestResult(null);
    if (!(await save(true))) return;
    setTesting(true);
    try {
      const r = await api.testSettings();
      setTestResult({ ok: true, text: `Funcionando em ${r.seconds}s: "${r.message}"` });
    } catch (e) {
      const text = (e as Error).message;
      setTestResult({ ok: false, text });
      if (offerLogin && form?.provider === "claude_code" && /login|autentic/i.test(text)) setLoginOpen(true);
    } finally {
      setTesting(false);
    }
  };

  // depois do login, confirma com uma chamada real ao Claude
  const onLoggedIn = async () => {
    setLoginOpen(false);
    toast("Login no Claude concluído");
    await test(false); // sem reabrir o pop-up, para não entrar em ciclo se o teste ainda falhar
    refreshHealth();
  };

  const status = (id: Provider) => state?.providers[id];
  const saved = state?.settings;
  const dirty = !!form && !!saved && (Object.keys(form) as (keyof AISettings)[]).some((k) => form[k] !== saved[k]);
  const installed = status("ollama")?.models ?? [];
  const ollamaInstalled = !!form && installed.some((m) => sameOllamaModel(m, form.ollama_model));

  return (
    <Page icon={Settings} title="Configurações" crumb="Modelo de IA">
      <ClaudeLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onDone={onLoggedIn} />
      {error && <ErrorNote text={error} />}
      {!form || !state || !saved ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : (
        <Grid>
          <Col span={12}>
            <ActiveModel state={state} form={form} dirty={dirty} />
          </Col>
          <Col span={8}>
            <Panel title="Provedor de IA">
              <View style={{ gap: 10 }}>
                {PROVIDERS.map((p) => {
                  const st = status(p.id);
                  return (
                    <Tile key={p.id} active={form.provider === p.id} onPress={() => set("provider", p.id)} style={{ padding: 14 }}>
                      <View style={[s.row, { alignItems: "flex-start", gap: 12 }]}>
                        <IconCircle icon={p.icon} size={40} color={form.provider === p.id ? palette.accent : palette.chart[1]} />
                        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                          <View style={[s.between, { flexWrap: "wrap" }]}>
                            <Txt size={13.5} weight="semibold">
                              {p.title}
                            </Txt>
                            <View style={s.row}>
                              {saved.provider === p.id && <Tag label="Ativo" tone="accent" />}
                              {st && <Tag label={st.ok ? "Disponível" : "Indisponível"} tone={st.ok ? "ok" : "bad"} dot />}
                            </View>
                          </View>
                          <Txt size={12} tone={3}>
                            {p.text}
                          </Txt>
                          {st?.detail ? (
                            <Txt size={11.5} tone={4}>
                              {st.detail}
                            </Txt>
                          ) : null}
                        </View>
                      </View>
                    </Tile>
                  );
                })}
              </View>

              <View style={{ gap: 16, marginTop: 20 }}>
                {form.provider === "ollama" && (
                  <>
                    <Field label="Modelo instalado" required>
                      {installed.length ? (
                        <View style={{ gap: 8 }}>
                          {installed.map((m) => (
                            <ModelOption
                              key={m}
                              name={m}
                              selected={sameOllamaModel(form.ollama_model, m)}
                              active={saved.provider === "ollama" && sameOllamaModel(saved.ollama_model, m)}
                              onPress={() => set("ollama_model", m)}
                            />
                          ))}
                        </View>
                      ) : (
                        <Txt size={12} tone={3}>
                          Nenhum modelo encontrado. Abra o Ollama e baixe um com <Mono>ollama pull qwen2.5:3b</Mono>.
                        </Txt>
                      )}
                    </Field>
                    <Field label="Outro modelo" hint="Para 4 GB de GPU: qwen2.5:3b. Mais qualidade, porém mais lento: qwen2.5:7b.">
                      <Input value={form.ollama_model} onChangeText={(v) => set("ollama_model", v.trim())} placeholder="qwen2.5:3b" autoCapitalize="none" autoCorrect={false} />
                      {!!form.ollama_model && !!status("ollama")?.running && !ollamaInstalled && (
                        <Txt size={11.5} color={palette.warning}>
                          Este modelo não está instalado. Rode: ollama pull {form.ollama_model}
                        </Txt>
                      )}
                    </Field>
                    <Field label="Endereço do Ollama">
                      <Input value={form.ollama_url} onChangeText={(v) => set("ollama_url", v)} autoCapitalize="none" autoCorrect={false} />
                    </Field>
                  </>
                )}
                {form.provider === "claude_code" && (
                  <>
                    {status("claude_code")?.path && !status("claude_code")?.ok && (
                      <Button variant="primary" icon={KeyRound} label="Entrar no Claude" style={{ alignSelf: "flex-start" }} onPress={() => setLoginOpen(true)} />
                    )}
                    <Field label="Modelo" hint="Cada chamada consome o limite de uso da sua assinatura.">
                      <View style={{ gap: 8 }}>
                        {CLAUDE_CODE_MODELS.map((m) => (
                          <ModelOption
                            key={m.id}
                            name={m.name}
                            text={m.text}
                            selected={form.claude_code_model === m.id}
                            active={saved.provider === "claude_code" && saved.claude_code_model === m.id}
                            onPress={() => set("claude_code_model", m.id)}
                          />
                        ))}
                      </View>
                    </Field>
                    <Field label="Caminho do executável" hint={`Deixe vazio para detectar sozinho.${status("claude_code")?.path ? ` Detectado: ${status("claude_code")!.path}` : ""}`}>
                      <Input value={form.claude_code_path} onChangeText={(v) => set("claude_code_path", v)} placeholder="claude" autoCapitalize="none" autoCorrect={false} />
                    </Field>
                  </>
                )}
                {form.provider === "anthropic" && (
                  <>
                    <Field label="Modelo">
                      <View style={{ gap: 8 }}>
                        {API_MODELS.map((m) => (
                          <ModelOption
                            key={m.id}
                            name={m.name}
                            text={m.text}
                            selected={form.anthropic_model === m.id}
                            active={saved.provider === "anthropic" && saved.anthropic_model === m.id}
                            onPress={() => set("anthropic_model", m.id)}
                          />
                        ))}
                      </View>
                    </Field>
                    <Txt size={12.5} tone={2}>
                      Defina <Mono>ANTHROPIC_API_KEY</Mono> no arquivo <Mono>backend/.env</Mono> e reinicie o backend.
                    </Txt>
                  </>
                )}

                {testResult && (
                  <Tile style={{ borderColor: testResult.ok ? palette.success : palette.danger }}>
                    <Txt size={12.5} weight="medium" color={testResult.ok ? palette.success : palette.danger}>
                      {testResult.ok ? "✓ " : "✕ "}
                      {testResult.text}
                    </Txt>
                  </Tile>
                )}

                <View style={[s.row, { justifyContent: "flex-end", flexWrap: "wrap" }]}>
                  {dirty && <Button variant="ghost" label="Descartar" onPress={() => { setForm(saved); setTestResult(null); }} />}
                  <Button icon={PlugZap} label={testing ? "Testando..." : dirty ? "Ativar e testar" : "Testar conexão"} loading={testing} onPress={() => test()} />
                  <Button variant="primary" icon={Save} label={dirty ? "Ativar modelo" : "Salvar"} loading={saving} onPress={() => save()} />
                </View>
              </View>
            </Panel>
          </Col>
          <Col span={4}>
            <Panel title="Como preparar">
              <View style={{ gap: 14 }}>
                <View style={{ gap: 6 }}>
                  <Txt size={12.5} weight="semibold">
                    Ollama
                  </Txt>
                  <Txt size={12} tone={3}>
                    1. Instale pelo site ollama.com.{"\n"}2. Num terminal, rode <Mono>ollama pull qwen2.5:3b</Mono>.{"\n"}3. Deixe o Ollama aberto e clique em Testar conexão.
                  </Txt>
                </View>
                <View style={{ gap: 6 }}>
                  <Txt size={12.5} weight="semibold">
                    Claude Code
                  </Txt>
                  <Txt size={12} tone={3}>
                    Clique em Entrar no Claude e autorize com a conta da assinatura. O backend chama <Mono>claude -p</Mono> por baixo, com saída em JSON.
                  </Txt>
                </View>
                <View style={{ gap: 6 }}>
                  <Txt size={12.5} weight="semibold">
                    Sem IA disponível
                  </Txt>
                  <Txt size={12} tone={3}>
                    A busca nos materiais e o painel continuam funcionando. Só a geração de quizzes, tópicos e respostas fica parada.
                  </Txt>
                </View>
              </View>
            </Panel>
          </Col>
        </Grid>
      )}
    </Page>
  );
}
