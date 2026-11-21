"""Executa `claude auth login` em segundo plano para o app conduzir a autenticação.

O próprio Claude Code abre a página de login no navegador padrão e recebe a autorização.
O backend só acompanha o processo, guarda o link (para abrir de novo) e repassa o código
quando a página pede para colar um. Nenhuma credencial passa pelo app.
"""
from __future__ import annotations

import os
import re
import subprocess
import tempfile
import threading
from urllib.parse import urlparse

TIMEOUT_SECONDS = 300
ALLOWED_HOSTS = ("claude.com", "claude.ai", "anthropic.com")


def _trusted_url(text: str) -> str | None:
    match = re.search(r"https://\S+", text)
    if not match:
        return None
    url = match.group(0)
    host = urlparse(url).hostname or ""
    return url if any(host == h or host.endswith(f".{h}") for h in ALLOWED_HOSTS) else None


class ClaudeLogin:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._proc: subprocess.Popen | None = None
        self._timer: threading.Timer | None = None
        self._state = "idle"  # idle | waiting | done | error
        self._url: str | None = None
        self._detail = ""

    def snapshot(self) -> dict:
        with self._lock:
            return {"state": self._state, "url": self._url, "detail": self._detail}

    def start(self, command: list[str]) -> dict:
        with self._lock:
            if self._proc and self._proc.poll() is None:
                return {"state": self._state, "url": self._url, "detail": self._detail}
            env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            try:
                proc = subprocess.Popen(
                    command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace", bufsize=1,
                    cwd=tempfile.gettempdir(), env=env, creationflags=flags,
                )
            except OSError as e:
                self._state, self._url, self._detail = "error", None, f"Não consegui iniciar o Claude Code: {e}"
                return {"state": self._state, "url": None, "detail": self._detail}
            self._proc, self._state, self._url, self._detail = proc, "waiting", None, ""
            self._timer = threading.Timer(TIMEOUT_SECONDS, self._expire, args=(proc,))
            self._timer.daemon = True
            self._timer.start()
            threading.Thread(target=self._watch, args=(proc,), daemon=True).start()
            return {"state": "waiting", "url": None, "detail": ""}

    def _watch(self, proc: subprocess.Popen) -> None:
        last = ""
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            url = _trusted_url(line)
            with self._lock:
                if self._proc is proc and url and not self._url:
                    self._url = url
            if not url and not line.startswith("Paste code"):
                last = line
        code = proc.wait()
        with self._lock:
            if self._proc is not proc:
                return
            if self._timer:
                self._timer.cancel()
            if self._state == "waiting":
                self._state = "done" if code == 0 else "error"
                self._detail = "" if code == 0 else (last[:300] or "O login não foi concluído.")

    def _expire(self, proc: subprocess.Popen) -> None:
        with self._lock:
            if self._proc is not proc or self._state != "waiting":
                return
            self._state, self._detail = "error", "O tempo para concluir o login acabou."
        proc.kill()

    def submit_code(self, code: str) -> dict:
        with self._lock:
            proc = self._proc
            if not proc or proc.poll() is not None or self._state != "waiting":
                raise RuntimeError("Não há login em andamento.")
            proc.stdin.write(code.strip() + "\n")
            proc.stdin.flush()
            return {"state": self._state, "url": self._url, "detail": self._detail}

    def cancel(self) -> dict:
        with self._lock:
            proc, self._proc = self._proc, None
            if self._timer:
                self._timer.cancel()
            self._state, self._url, self._detail = "idle", None, ""
        if proc and proc.poll() is None:
            proc.kill()
        return {"state": "idle", "url": None, "detail": ""}


login = ClaudeLogin()
