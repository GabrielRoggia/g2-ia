"""Testa o controle do processo de login com um CLI falso (não abre navegador nem autentica).

Executar (dentro de backend/):  python -m tests.test_claude_login
"""
import sys
import time

from app.claude_login import ClaudeLogin, _trusted_url

FAKE_CLI = r"""
import sys
print("Opening browser to sign in...", flush=True)
print("If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?state=abc", flush=True)
code = sys.stdin.readline().strip()
if code == "certo":
    print("Login successful", flush=True)
    sys.exit(0)
print("Invalid code", flush=True)
sys.exit(1)
"""


def wait(login: ClaudeLogin, check, seconds: float = 8) -> dict:
    end = time.time() + seconds
    while time.time() < end:
        snap = login.snapshot()
        if check(snap):
            return snap
        time.sleep(0.05)
    raise AssertionError(f"estado inesperado: {login.snapshot()}")


def main() -> None:
    cmd = [sys.executable, "-c", FAKE_CLI]

    assert _trusted_url("visit: https://claude.com/x?y=1") == "https://claude.com/x?y=1"
    assert _trusted_url("visit: https://claude.com.evil.example/x") is None, "domínio falso não pode virar link"

    ok = ClaudeLogin()
    ok.start(cmd)
    snap = wait(ok, lambda s: s["url"])
    assert snap["state"] == "waiting" and "claude.com" in snap["url"]
    ok.submit_code("certo")
    wait(ok, lambda s: s["state"] == "done")

    bad = ClaudeLogin()
    bad.start(cmd)
    wait(bad, lambda s: s["url"])
    bad.submit_code("errado")
    snap = wait(bad, lambda s: s["state"] == "error")
    assert "Invalid code" in snap["detail"]

    cancelled = ClaudeLogin()
    cancelled.start(cmd)
    wait(cancelled, lambda s: s["url"])
    proc = cancelled._proc
    cancelled.cancel()
    proc.wait(timeout=5)
    time.sleep(0.2)
    assert cancelled.snapshot()["state"] == "idle", "cancelar não pode virar erro"
    print("OK: login concluído, código inválido, cancelamento e validação do link")


if __name__ == "__main__":
    main()
