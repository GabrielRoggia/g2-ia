"""Configurações da IA salvas no SQLite (alteradas pela tela de Configurações do app)."""
from __future__ import annotations

from typing import Literal, get_args

from pydantic import BaseModel

from . import db
from .config import LLM_MODEL

Provider = Literal["ollama", "claude_code", "anthropic"]
ClaudeCodeModel = Literal["sonnet", "opus", "haiku"]
AnthropicModel = Literal["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]


class AISettings(BaseModel):
    provider: Provider = "ollama"
    # Ollama (LLM local)
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"
    # Claude Code (usa o login da assinatura do Claude no computador)
    claude_code_path: str = ""   # vazio = procura automaticamente
    claude_code_model: ClaudeCodeModel = "sonnet"
    # API do Claude (usa ANTHROPIC_API_KEY)
    anthropic_model: AnthropicModel = "claude-opus-5-5"


def _ensure_table() -> None:
    with db.tx() as c:
        c.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")


def get() -> AISettings:
    _ensure_table()
    stored = {r["key"]: r["value"] for r in db.rows("SELECT key, value FROM settings")}
    if "anthropic_model" not in stored and LLM_MODEL in get_args(AnthropicModel):
        stored["anthropic_model"] = LLM_MODEL  # respeita o LLM_MODEL do .env até o usuário escolher outro
    return AISettings(**{k: v for k, v in stored.items() if k in AISettings.model_fields})


def save(new: AISettings) -> AISettings:
    _ensure_table()
    with db.tx() as c:
        for k, v in new.model_dump().items():
            c.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (k, str(v)))
    return get()
