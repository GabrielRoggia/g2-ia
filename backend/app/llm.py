"""Camada de LLM com três provedores intercambiáveis (escolhidos na tela de Configurações):

- ollama:      modelo aberto rodando localmente (grátis, sem chave, sem internet).
- claude_code: chama o Claude Code em modo não interativo (`claude -p`), que usa o
               login da assinatura do Claude neste computador. Uso pessoal/local.
- anthropic:   API oficial do Claude via SDK, com a ANTHROPIC_API_KEY do .env.

Todos devolvem saída estruturada: o JSON gerado é validado pelo mesmo modelo Pydantic,
então o resto do sistema não sabe (nem precisa saber) qual provedor respondeu.
"""
from __future__ import annotations

import glob
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from . import settings as cfg
from .config import LLM_EFFORT

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    pass


# ───────────────────────── utilidades ─────────────────────────

def inline_schema(model: type[BaseModel]) -> dict:
    """JSON Schema do Pydantic com os $ref resolvidos (Ollama e Claude Code preferem assim)."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def resolve(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(defs[node["$ref"].split("/")[-1]])
            return {k: resolve(v) for k, v in node.items() if k != "title"}
        if isinstance(node, list):
            return [resolve(v) for v in node]
        return node

    return resolve(schema)


def _parse_json(text: str, schema: type[T]) -> T:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    start = min([i for i in (text.find("{"), text.find("[")) if i != -1], default=0)
    return schema.model_validate_json(text[start:])


# ───────────────────────── Ollama ─────────────────────────

def _ollama_post(path: str, body: dict, timeout: int = 600) -> dict:
    s = cfg.get()
    req = urllib.request.Request(
        s.ollama_url.rstrip("/") + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="ignore")
        if "not found" in detail:
            raise LLMError(f"Modelo '{s.ollama_model}' não está instalado. Rode: ollama pull {s.ollama_model}") from e
        raise LLMError(f"Ollama respondeu com erro {e.code}: {detail[:200]}") from e
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise LLMError(f"Ollama não está rodando em {s.ollama_url}. Instale em ollama.com e abra o aplicativo.") from e


def _ollama_chat(system: str, user: str, fmt: dict | None) -> str:
    s = cfg.get()
    body = {
        "model": s.ollama_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": False,
        "options": {"temperature": 0.4, "num_ctx": 8192},
    }
    if fmt is not None:
        body["format"] = fmt
    return _ollama_post("/api/chat", body)["message"]["content"]


def ollama_status() -> dict:
    s = cfg.get()
    try:
        req = urllib.request.Request(s.ollama_url.rstrip("/") + "/api/tags")
        with urllib.request.urlopen(req, timeout=3) as r:
            models = [m["name"] for m in json.loads(r.read()).get("models", [])]
        has = any(m == s.ollama_model or m.split(":")[0] == s.ollama_model for m in models)
        return {
            "ok": has,
            "running": True,
            "models": models,
            "detail": "Pronto" if has else f"Modelo {s.ollama_model} não instalado. Rode: ollama pull {s.ollama_model}",
        }
    except Exception:
        return {"ok": False, "running": False, "models": [], "detail": f"Ollama não encontrado em {s.ollama_url}"}


# ───────────────────────── Claude Code ─────────────────────────

def find_claude() -> str | None:
    s = cfg.get()
    if s.claude_code_path and os.path.exists(s.claude_code_path):
        return s.claude_code_path
    found = shutil.which("claude")
    if found:
        return found
    # o app desktop do Claude traz o Claude Code embutido
    local = os.environ.get("LOCALAPPDATA", "")
    candidates = glob.glob(os.path.join(local, "Claude-Data", "*", "claude-code", "*", "*", "claude.exe"))
    candidates += glob.glob(os.path.join(os.path.expanduser("~"), ".local", "bin", "claude*"))
    return sorted(candidates, key=os.path.getmtime)[-1] if candidates else None


def _claude_code(system: str, user: str, schema: dict | None) -> dict:
    exe = find_claude()
    if not exe:
        raise LLMError("Claude Code não encontrado. Instale (npm i -g @anthropic-ai/claude-code) ou informe o caminho nas Configurações.")
    s = cfg.get()
    args = [exe, "-p", "--output-format", "json", "--system-prompt", system,
            "--tools", "", "--no-session-persistence"]
    if s.claude_code_model:
        args += ["--model", s.claude_code_model]
    if schema is not None:
        args += ["--json-schema", json.dumps(schema, ensure_ascii=False)]
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    try:
        proc = subprocess.run(
            args, input=user, capture_output=True, text=True, encoding="utf-8",
            timeout=600, cwd=tempfile.gettempdir(), env=env,
        )
    except subprocess.TimeoutExpired as e:
        raise LLMError("O Claude Code demorou demais para responder.") from e
    try:
        out = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise LLMError(f"Resposta inesperada do Claude Code: {(proc.stderr or proc.stdout)[:300]}") from e
    if out.get("is_error"):
        msg = str(out.get("result", "erro desconhecido"))
        if "auth" in msg.lower() or "login" in msg.lower():
            msg = "Login do Claude Code expirado. Abra um terminal e rode: claude auth login"
        raise LLMError(f"Claude Code: {msg}")
    return out


def claude_code_status() -> dict:
    exe = find_claude()
    if not exe:
        return {"ok": False, "path": None, "detail": "Claude Code não encontrado neste computador"}
    try:
        proc = subprocess.run([exe, "auth", "status"], capture_output=True, text=True, encoding="utf-8", timeout=20)
        info = json.loads(proc.stdout)
        logged = bool(info.get("loggedIn"))
        method = info.get("authMethod", "")
        detail = f"Logado ({'assinatura claude.ai' if method == 'claude.ai' else method})" if logged else "Não logado. Rode: claude auth login"
        return {"ok": logged, "path": exe, "detail": detail}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "path": exe, "detail": f"Não consegui verificar o login: {e}"}


# ───────────────────────── API Anthropic ─────────────────────────

_client = None


def _anthropic():
    global _client
    import anthropic

    if not os.getenv("ANTHROPIC_API_KEY"):
        raise LLMError("ANTHROPIC_API_KEY não configurada em backend/.env.")
    if _client is None:
        _client = anthropic.Anthropic()
    return _client, anthropic


def _anthropic_call(system: str, user: str, schema: type[T] | None, max_tokens: int, effort: str | None):
    client, anthropic = _anthropic()
    model = cfg.get().anthropic_model
    kwargs = dict(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": effort or LLM_EFFORT},
    )
    if "haiku" not in model:  # o Haiku não tem fallback no servidor
        kwargs.update(betas=["server-side-fallback-2026-07-01"], fallbacks="default")
    try:
        if schema is not None:
            resp = client.beta.messages.parse(**kwargs, output_format=schema)
        else:
            resp = client.beta.messages.create(**kwargs)
    except anthropic.AuthenticationError as e:
        raise LLMError("Chave da API inválida (ANTHROPIC_API_KEY).") from e
    except anthropic.APIConnectionError as e:
        raise LLMError("Sem conexão com a API do Claude.") from e
    except anthropic.APIStatusError as e:
        raise LLMError(f"Erro da API ({e.status_code}): {e.message}") from e
    if resp.stop_reason == "refusal":
        raise LLMError("O modelo recusou a solicitação.")
    if resp.stop_reason == "max_tokens":
        raise LLMError("A resposta do modelo foi cortada (max_tokens).")
    if schema is not None:
        if resp.parsed_output is None:
            raise LLMError("O modelo não retornou uma saída válida.")
        return resp.parsed_output
    return "".join(b.text for b in resp.content if b.type == "text").strip()


# ───────────────────────── interface única ─────────────────────────

JSON_HINT = "\n\nResponda APENAS com um objeto JSON válido que siga o schema pedido, sem texto antes ou depois."


def structured(system: str, user: str, schema: type[T], max_tokens: int = 16000, effort: str | None = None) -> T:
    provider = cfg.get().provider
    if provider == "anthropic":
        return _anthropic_call(system, user, schema, max_tokens, effort)

    fmt = inline_schema(schema)
    last_err: Exception | None = None
    for _ in range(2):  # modelos locais às vezes erram o formato: tenta de novo uma vez
        try:
            if provider == "ollama":
                return _parse_json(_ollama_chat(system + JSON_HINT, user, fmt), schema)
            out = _claude_code(system + JSON_HINT, user, fmt)
            data = out.get("structured_output")
            if data is not None:
                return schema.model_validate(data)
            return _parse_json(str(out.get("result", "")), schema)
        except (ValidationError, ValueError) as e:
            last_err = e
    raise LLMError(f"O modelo não devolveu um JSON válido: {str(last_err)[:200]}")


def text(system: str, user: str, max_tokens: int = 8000, effort: str | None = None) -> str:
    provider = cfg.get().provider
    if provider == "anthropic":
        return _anthropic_call(system, user, None, max_tokens, effort)
    if provider == "ollama":
        return _ollama_chat(system, user, None).strip()
    return str(_claude_code(system, user, None).get("result", "")).strip()


def status() -> dict:
    s = cfg.get()
    providers = {
        "ollama": ollama_status(),
        "claude_code": claude_code_status(),
        "anthropic": {"ok": bool(os.getenv("ANTHROPIC_API_KEY")), "detail": "Chave configurada" if os.getenv("ANTHROPIC_API_KEY") else "ANTHROPIC_API_KEY não definida no .env"},
    }
    return {"settings": s.model_dump(), "providers": providers, "ready": providers[s.provider]["ok"]}


class _Ping(BaseModel):
    ok: bool
    mensagem: str


def test() -> dict:
    t0 = time.time()
    r = structured("Você é um teste de conexão.", "Responda ok=true e uma mensagem curta em português dizendo que está funcionando.", _Ping, max_tokens=500, effort="low")
    return {"ok": r.ok, "message": r.mensagem, "seconds": round(time.time() - t0, 1), "provider": cfg.get().provider}
