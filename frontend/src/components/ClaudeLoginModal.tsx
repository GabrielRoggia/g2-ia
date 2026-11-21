// Pop-up que executa `claude auth login`: o Claude Code abre a página de login em outra guia
// e o app acompanha até a autorização terminar.
import { CircleAlert, ExternalLink, KeyRound, RotateCcw, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, View } from "react-native";

import { api, ClaudeLoginState } from "../lib/api";
import { useTheme } from "../lib/store";
import { ICON, palette, radius } from "../lib/theme";
import { Button, Field, IconCircle, Input, Txt, s } from "./ui";

export function ClaudeLoginModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTheme();
  const [login, setLogin] = useState<ClaudeLoginState>({ state: "waiting", url: null, detail: "" });
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const finished = useRef(onDone);
  finished.current = onDone;

  useEffect(() => {
    if (!open) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const apply = (next: ClaudeLoginState) => {
      if (!active) return;
      setLogin(next);
      if (next.state !== "waiting" && timer) clearInterval(timer);
      if (next.state === "done") {
        api.claudeLoginCancel().catch(() => undefined); // limpa o estado para o próximo login
        finished.current();
      }
    };
    const fail = (e: unknown) => apply({ state: "error", url: null, detail: (e as Error).message });

    setLogin({ state: "waiting", url: null, detail: "" });
    setCode("");
    api
      .claudeLoginStart()
      .then((first) => {
        apply(first);
        if (active && first.state === "waiting") {
          timer = setInterval(() => api.claudeLoginStatus().then(apply).catch(fail), 1500);
        }
      })
      .catch(fail);
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [open, attempt]);

  const close = () => {
    api.claudeLoginCancel().catch(() => undefined);
    onClose();
  };

  const retry = async () => {
    await api.claudeLoginCancel().catch(() => undefined);
    setAttempt((a) => a + 1);
  };

  const openPage = () => {
    if (!login.url) return;
    if (Platform.OS === "web") window.open(login.url, "_blank", "noopener");
    else Linking.openURL(login.url);
  };

  const sendCode = async () => {
    if (!code.trim()) return;
    setSending(true);
    try {
      setLogin(await api.claudeLoginCode(code.trim()));
      setCode("");
    } catch (e) {
      setLogin({ state: "error", url: login.url, detail: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  const failed = login.state === "error";

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <Pressable onPress={close} accessibilityLabel="Fechar" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.55)" }} />
        <View style={{ width: "100%", maxWidth: 460, gap: 16, padding: 20, borderRadius: radius.float, borderWidth: 1, borderColor: t.islLine, backgroundColor: t.dark ? "rgba(29,32,39,0.98)" : "rgba(255,255,255,0.98)" }}>
          <View style={[s.between, { alignItems: "flex-start" }]}>
            <View style={[s.row, { flex: 1, gap: 12 }]}>
              <IconCircle icon={failed ? CircleAlert : KeyRound} size={40} color={failed ? palette.danger : palette.accent} />
              <View style={{ flex: 1 }}>
                <Txt size={15} weight="semibold" color={t.islStrong}>
                  {failed ? "Não foi possível entrar" : "Entrar no Claude"}
                </Txt>
                <Txt size={12} tone={3}>
                  Autenticação da sua assinatura
                </Txt>
              </View>
            </View>
            <Pressable onPress={close} accessibilityLabel="Fechar" style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: t.hover }}>
              <X size={16} strokeWidth={ICON.stroke} color={t.text2} />
            </Pressable>
          </View>

          {failed ? (
            <Txt size={12.5} color={t.badText}>
              {login.detail}
            </Txt>
          ) : (
            <>
              <View style={[s.row, { padding: 12, borderRadius: radius.tile, backgroundColor: t.surface2 }]}>
                <ActivityIndicator size="small" color={palette.accent} />
                <Txt size={12.5} style={{ flex: 1 }}>
                  {login.url ? "A página de login foi aberta em outra guia. Autorize o acesso e volte para cá." : "Abrindo a página de login do Claude..."}
                </Txt>
              </View>
              <Field label="Código de autorização" hint="Só é necessário se a página mostrar um código para colar.">
                <View style={s.row}>
                  <Input value={code} onChangeText={setCode} onSubmitEditing={sendCode} placeholder="Cole o código aqui" autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} />
                  <Button label="Enviar" loading={sending} disabled={!code.trim()} onPress={sendCode} />
                </View>
              </Field>
            </>
          )}

          <View style={[s.row, { justifyContent: "flex-end", flexWrap: "wrap" }]}>
            <Button label="Cancelar" onPress={close} />
            {failed ? (
              <Button variant="primary" icon={RotateCcw} label="Tentar de novo" onPress={retry} />
            ) : (
              <Button variant="primary" icon={ExternalLink} label="Abrir página de login" disabled={!login.url} onPress={openPage} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
