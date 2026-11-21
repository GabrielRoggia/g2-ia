"""API HTTP (FastAPI) do Revisa AI."""
from __future__ import annotations

import os
import re
import uuid
from typing import Literal

from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import db, llm, tutor
from . import settings as ai_settings
from .claude_login import login as claude_login
from .config import UPLOAD_DIR
from .ingest import SUPPORTED, chunk_document, extract_pages
from .llm import LLMError
from .store import store

app = FastAPI(title="Revisa AI", version="1.0.0", description="Tutor de estudos com RAG")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
db.init_db()


def _course_or_404(course_id: int) -> dict:
    c = db.row("SELECT * FROM courses WHERE id = ?", course_id)
    if not c:
        raise HTTPException(404, "Disciplina não encontrada")
    return c


def _llm_http(e: LLMError) -> HTTPException:
    return HTTPException(502, str(e))


# ───────────── Saúde ─────────────

@app.get("/health")
def health():
    s = ai_settings.get()
    check = {"ollama": llm.ollama_status, "claude_code": llm.claude_code_status}.get(
        s.provider, lambda: {"ok": bool(os.getenv("ANTHROPIC_API_KEY")), "detail": "ANTHROPIC_API_KEY não definida"}
    )()
    return {"ok": True, "provider": s.provider, "llm_ready": check["ok"], "llm_detail": check.get("detail", "")}


# ───────────── Configurações da IA ─────────────

def _local_only(request: Request) -> None:
    """Configurações e login só podem ser usados neste computador e pelo próprio app.
    Sem isso, um site aberto no navegador poderia trocar o executável do Claude Code."""
    client = request.client.host if request.client else ""
    origin = request.headers.get("origin")
    origin_host = urlparse(origin).hostname if origin else "localhost"
    if client not in ("127.0.0.1", "::1") or origin_host not in ("localhost", "127.0.0.1", "::1"):
        raise HTTPException(403, "As configurações da IA só podem ser alteradas no computador onde o backend está rodando.")


@app.get("/settings", dependencies=[Depends(_local_only)])
def get_settings():
    return llm.status()


@app.put("/settings", dependencies=[Depends(_local_only)])
def put_settings(body: ai_settings.AISettings):
    ai_settings.save(body)
    return llm.status()


class LoginCodeIn(BaseModel):
    code: str = Field(min_length=1, max_length=2000, pattern=r"^[^\r\n]+$")


@app.post("/settings/claude-login", dependencies=[Depends(_local_only)])
def claude_login_start():
    exe = llm.find_claude()
    if not exe:
        raise HTTPException(404, "Claude Code não encontrado neste computador.")
    return claude_login.start([exe, "auth", "login", "--claudeai"])


@app.get("/settings/claude-login", dependencies=[Depends(_local_only)])
def claude_login_status():
    return claude_login.snapshot()


@app.post("/settings/claude-login/code", dependencies=[Depends(_local_only)])
def claude_login_code(body: LoginCodeIn):
    try:
        return claude_login.submit_code(body.code)
    except RuntimeError as e:
        raise HTTPException(409, str(e))


@app.delete("/settings/claude-login", dependencies=[Depends(_local_only)])
def claude_login_cancel():
    return claude_login.cancel()


@app.post("/settings/test", dependencies=[Depends(_local_only)])
def test_settings():
    try:
        return llm.test()
    except LLMError as e:
        raise _llm_http(e)


# ───────────── Disciplinas ─────────────

class CourseIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@app.get("/courses")
def list_courses():
    return db.rows(
        """SELECT c.id, c.name, c.created_at,
                  (SELECT COUNT(*) FROM documents d WHERE d.course_id = c.id) AS documents
           FROM courses c ORDER BY c.id"""
    )


@app.post("/courses", status_code=201)
def create_course(body: CourseIn):
    cid = db.execute("INSERT INTO courses (name, created_at) VALUES (?, ?)", body.name.strip(), db.now())
    return db.row("SELECT * FROM courses WHERE id = ?", cid)


@app.delete("/courses/{course_id}", status_code=204)
def delete_course(course_id: int):
    _course_or_404(course_id)
    docs = db.rows("SELECT id, filename FROM documents WHERE course_id = ?", course_id)
    for d in docs:
        store.delete_document(course_id, d["id"])
    # o banco remove em cascata documentos, tópicos, quizzes, questões e respostas
    db.execute("DELETE FROM courses WHERE id = ?", course_id)
    for d in docs:
        (UPLOAD_DIR / d["filename"]).unlink(missing_ok=True)


# ───────────── Documentos ─────────────

@app.get("/courses/{course_id}/documents")
def list_documents(course_id: int):
    _course_or_404(course_id)
    return db.rows("SELECT * FROM documents WHERE course_id = ? ORDER BY id DESC", course_id)


@app.post("/courses/{course_id}/documents", status_code=201)
def upload_document(course_id: int, file: UploadFile = File(...), update_topics: bool = True):
    """Indexa um arquivo. Em envios múltiplos, o app usa update_topics=false e
    atualiza os tópicos uma única vez, ao final, sobre todo o material."""
    _course_or_404(course_id)
    name = file.filename or "material"
    ext = os.path.splitext(name)[1].lower()
    if ext not in SUPPORTED:
        raise HTTPException(400, f"Formato não suportado. Envie {', '.join(sorted(SUPPORTED))}.")
    safe = re.sub(r"[^\w.\-]+", "_", name)
    path = UPLOAD_DIR / f"{uuid.uuid4().hex[:8]}_{safe}"
    path.write_bytes(file.file.read())

    try:
        pages = extract_pages(path)
        chunks = chunk_document(path)
    except Exception as e:  # PDF corrompido, protegido etc.
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"Não consegui ler o arquivo: {e}")
    if not chunks:
        path.unlink(missing_ok=True)
        raise HTTPException(400, "O arquivo não tem texto extraível (PDF escaneado?).")

    doc_id = db.execute(
        "INSERT INTO documents (course_id, name, filename, pages, chunks, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        course_id, name, path.name, len(pages), len(chunks), db.now(),
    )
    store.add_chunks(course_id, doc_id, name, chunks)

    warning, topics = None, []
    if update_topics:
        try:
            topics = tutor.extract_topics(course_id)
        except LLMError as e:
            warning = f"Material indexado, mas os tópicos não foram gerados: {e}"
    doc = db.row("SELECT * FROM documents WHERE id = ?", doc_id)
    return {"document": doc, "topics": topics, "warning": warning}


MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
}


@app.get("/documents/{doc_id}/file")
def open_document(doc_id: int):
    """Entrega o arquivo original para abrir no navegador."""
    d = db.row("SELECT * FROM documents WHERE id = ?", doc_id)
    path = UPLOAD_DIR / d["filename"] if d else None
    if not path or not path.exists():
        raise HTTPException(404, "Arquivo não encontrado")
    return FileResponse(
        path,
        media_type=MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream"),
        filename=d["name"],
        content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: int):
    d = db.row("SELECT * FROM documents WHERE id = ?", doc_id)
    if not d:
        raise HTTPException(404, "Documento não encontrado")
    store.delete_document(d["course_id"], doc_id)
    db.execute("DELETE FROM documents WHERE id = ?", doc_id)
    (UPLOAD_DIR / d["filename"]).unlink(missing_ok=True)


# ───────────── Tópicos e busca ─────────────

@app.get("/courses/{course_id}/topics")
def get_topics(course_id: int):
    _course_or_404(course_id)
    return tutor.topic_stats(course_id)


@app.post("/courses/{course_id}/topics/refresh")
def refresh_topics(course_id: int):
    _course_or_404(course_id)
    try:
        return tutor.extract_topics(course_id)
    except LLMError as e:
        raise _llm_http(e)


@app.get("/courses/{course_id}/search")
def search(course_id: int, q: str, mode: Literal["vector", "bm25", "hybrid"] = "hybrid", k: int = 6):
    _course_or_404(course_id)
    return [h.as_dict() for h in store.search(course_id, q, k=k, mode=mode)]


# ───────────── Quiz ─────────────

class QuizIn(BaseModel):
    n: int = Field(10, ge=1, le=tutor.MAX_QUESTIONS)
    mode: Literal["topic", "adaptive", "mixed"] = "mixed"
    topic: str | None = None
    topics: list[str] | None = Field(None, max_length=30)


class AnswerIn(BaseModel):
    question_id: int
    chosen_index: int = Field(ge=0, le=3)


class AnswersIn(BaseModel):
    answers: list[AnswerIn]


@app.post("/courses/{course_id}/quizzes", status_code=201)
def create_quiz(course_id: int, body: QuizIn):
    _course_or_404(course_id)
    try:
        return tutor.generate_quiz(course_id, n=body.n, mode=body.mode, topic=body.topic, topics=body.topics)
    except LLMError as e:
        raise _llm_http(e)


@app.get("/quizzes/{quiz_id}")
def read_quiz(quiz_id: int):
    try:
        return tutor.get_quiz(quiz_id, reveal=False)
    except KeyError:
        raise HTTPException(404, "Quiz não encontrado")


@app.get("/quizzes/{quiz_id}/review")
def review_quiz(quiz_id: int):
    try:
        return tutor.review_quiz(quiz_id)
    except KeyError:
        raise HTTPException(404, "Quiz não encontrado")
    except ValueError as e:
        raise HTTPException(409, str(e))


@app.post("/quizzes/{quiz_id}/answers")
def answer_quiz(quiz_id: int, body: AnswersIn):
    try:
        return tutor.submit_answers(quiz_id, [a.model_dump() for a in body.answers])
    except KeyError:
        raise HTTPException(404, "Quiz não encontrado")


# ───────────── Pergunta livre e painel ─────────────

class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=1000)


@app.post("/courses/{course_id}/ask")
def ask(course_id: int, body: AskIn):
    _course_or_404(course_id)
    try:
        return tutor.ask(course_id, body.question)
    except LLMError as e:
        raise _llm_http(e)


@app.get("/courses/{course_id}/dashboard")
def dashboard(course_id: int):
    _course_or_404(course_id)
    return tutor.dashboard(course_id)


@app.delete("/courses/{course_id}/history")
def clear_history(course_id: int):
    """Apaga quizzes e respostas da disciplina. Materiais e tópicos continuam."""
    _course_or_404(course_id)
    return {"removed": tutor.clear_history(course_id)}
