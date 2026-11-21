"""Lógica do tutor: tópicos do material, geração de quiz com RAG, correção,
diagnóstico de pontos fracos e perguntas livres com citação da fonte."""
from __future__ import annotations

import json
import math
import random
from typing import Literal

from pydantic import BaseModel, Field

from . import db
from .llm import LLMError, structured, text
from .store import Hit, store

QuizMode = Literal["topic", "adaptive", "mixed"]


# ───────────────────────── Schemas da saída do LLM ─────────────────────────

class TopicOut(BaseModel):
    name: str = Field(description="Nome curto do tópico, 2 a 5 palavras")
    description: str = Field(description="Uma frase dizendo o que o tópico cobre")


class TopicsOut(BaseModel):
    topics: list[TopicOut]


class QuestionOut(BaseModel):
    topic: str
    difficulty: Literal["facil", "media", "dificil"]
    question: str
    options: list[str] = Field(description="Exatamente 4 alternativas, sem letras no início")
    correct_index: int = Field(description="Índice (0 a 3) da alternativa correta")
    explanation: str = Field(description="Por que a correta está certa e o erro comum nas outras")
    source_ids: list[str] = Field(description="IDs dos trechos usados, ex.: ['12-3']")


class QuizOut(BaseModel):
    questions: list[QuestionOut]


# ───────────────────────── Tópicos ─────────────────────────

TOPICS_SYSTEM = """Você organiza material de estudo universitário em tópicos.
Regras:
- Devolva de 4 a 10 tópicos que cubram o conteúdo dos trechos, sem sobreposição entre eles.
- Use SOMENTE assuntos que aparecem nos trechos. Não acrescente assuntos de fora.
- name: 2 a 5 palavras. description: UMA frase curta, com no máximo 15 palavras. Não copie parágrafos.
- Ignore trechos administrativos (datas, notas, regras da disciplina).
- Escreva em português do Brasil."""


def _short(text: str, limit: int = 140) -> str:
    """Corta descrições longas (modelos pequenos às vezes copiam parágrafos inteiros)."""
    text = " ".join(text.split())
    first = text.split(". ")[0].rstrip(".")
    if len(first) > limit:
        first = first[:limit].rsplit(" ", 1)[0] + "…"
    return first


def extract_topics(course_id: int) -> list[dict]:
    ids, docs, metas = store.course_chunks(course_id)
    if not docs:
        db.execute("DELETE FROM topics WHERE course_id = ?", course_id)
        return []
    step = max(1, len(docs) // 50)
    sample = [f"[{metas[i]['doc_name']} p.{metas[i]['page']}] {docs[i][:450]}" for i in range(0, len(docs), step)][:50]
    out = structured(TOPICS_SYSTEM, "Trechos do material:\n\n" + "\n\n".join(sample), TopicsOut, max_tokens=4000, effort="low")
    with db.tx() as c:
        c.execute("DELETE FROM topics WHERE course_id = ?", (course_id,))
        seen = set()
        for t in out.topics[:10]:
            name = t.name.strip().rstrip(".")
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            c.execute(
                "INSERT INTO topics (course_id, name, description) VALUES (?, ?, ?)",
                (course_id, name, _short(t.description)),
            )
    return list_topics(course_id)


def list_topics(course_id: int) -> list[dict]:
    return db.rows("SELECT id, name, description FROM topics WHERE course_id = ? ORDER BY id", course_id)


# ───────────────────────── Desempenho ─────────────────────────

def topic_stats(course_id: int) -> list[dict]:
    """Acerto por tópico. O "domínio" usa suavização de Laplace ((acertos+1)/(total+2)),
    então um tópico nunca respondido fica em 50% e um erro isolado não derruba tudo."""
    stats = {t["name"]: {"topic": t["name"], "description": t["description"], "answered": 0, "correct": 0} for t in list_topics(course_id)}
    for r in db.rows(
        """SELECT q.topic, COUNT(a.id) AS answered, COALESCE(SUM(a.correct), 0) AS correct
           FROM answers a JOIN questions q ON q.id = a.question_id
           JOIN quizzes z ON z.id = q.quiz_id
           WHERE z.course_id = ? GROUP BY q.topic""",
        course_id,
    ):
        s = stats.setdefault(r["topic"], {"topic": r["topic"], "description": "", "answered": 0, "correct": 0})
        s["answered"], s["correct"] = r["answered"], r["correct"]
    out = []
    for s in stats.values():
        s["accuracy"] = round(s["correct"] / s["answered"], 3) if s["answered"] else None
        s["mastery"] = round((s["correct"] + 1) / (s["answered"] + 2), 3)
        out.append(s)
    return sorted(out, key=lambda s: s["mastery"])


def pick_topics(course_id: int, mode: QuizMode, topic: str | None, n: int, selected: list[str] | None = None) -> list[str]:
    topics = [t["name"] for t in list_topics(course_id)]
    if not topics:
        raise LLMError("Nenhum tópico encontrado. Envie um material ou atualize os tópicos na aba Materiais.")
    if mode == "topic":
        wanted = list(dict.fromkeys((selected or []) + ([topic] if topic else [])))
        # a tela também lista tópicos antigos que só existem no histórico de respostas
        known = {s["topic"] for s in topic_stats(course_id)}
        valid = [t for t in wanted if t in known]
        if not valid:
            raise LLMError("Selecione ao menos um tópico da disciplina.")
        return valid
    if mode == "adaptive":
        # prioriza os 3 tópicos de menor domínio
        weakest = [s["topic"] for s in topic_stats(course_id) if s["topic"] in topics][:3]
        return weakest or topics[:3]
    return random.sample(topics, k=min(len(topics), max(2, math.ceil(n / 2))))


# ───────────────────────── Geração do quiz ─────────────────────────

QUIZ_SYSTEM = """Você é um professor que cria questões de múltipla escolha para revisão de prova.
Regras:
- Use SOMENTE as informações dos trechos fornecidos. Nada de conhecimento externo.
- Cada questão tem exatamente 4 alternativas plausíveis e só uma correta.
- Distratores devem refletir erros conceituais comuns, não absurdos.
- Prefira entender o conceito a decorar definições. Varie a dificuldade.
- Não use "todas as anteriores" nem "nenhuma das anteriores".
- A explicação diz por que a correta está certa e qual confusão leva às erradas.
- Em source_ids, liste os IDs dos trechos que sustentam a resposta.
- O campo topic deve ser o tópico do qual a questão realmente trata.
- Apenas UMA alternativa pode ser defendida como correta; as outras devem estar claramente erradas segundo os trechos.
- Escreva em português do Brasil."""


def _context_block(hits: list[Hit]) -> str:
    return "\n\n".join(f"<trecho id=\"{h.id}\" fonte=\"{h.doc_name}, p. {h.page}\">\n{h.text}\n</trecho>" for h in hits)


MAX_QUESTIONS = 30
BATCH_SIZE = 5  # modelos locais erram menos gerando poucas questões por chamada


def _generate_batch(course_id: int, n: int, topics: list[str], descriptions: dict, avoid: list[str], allowed: set[str]) -> list[dict]:
    hits: dict[str, Hit] = {}
    for t in topics:
        # sorteia entre os melhores trechos para os lotes não repetirem o mesmo contexto
        pool = store.search(course_id, f"{t}. {descriptions.get(t, '')}", k=12)
        for h in random.sample(pool, k=min(6 if len(topics) == 1 else 4, len(pool))):
            hits.setdefault(h.id, h)
    if not hits:
        raise LLMError("Não encontrei trechos do material para esses tópicos.")

    user = (
        f"Crie {n} questões distribuídas entre estes tópicos: {', '.join(topics)}.\n"
        f"Use o nome exato do tópico no campo topic.\n\n"
        f"Trechos do material:\n{_context_block(list(hits.values()))}\n\n"
        + ("Evite repetir estas questões já feitas:\n- " + "\n- ".join(avoid[-25:]) if avoid else "")
    )
    out = structured(QUIZ_SYSTEM, user, QuizOut, max_tokens=16000)

    questions = []
    for q in out.questions:
        if len(q.options) != 4 or not 0 <= q.correct_index < 4:
            continue
        src_ids = [s for s in q.source_ids if s in hits] or list(hits)[:1]
        # embaralha as alternativas para o gabarito não ficar sempre na mesma letra
        order = list(range(4))
        random.shuffle(order)
        questions.append({
            "topic": q.topic if q.topic in allowed else topics[0],
            "difficulty": q.difficulty,
            "question": q.question.strip(),
            "options": [q.options[i] for i in order],
            "correct_index": order.index(q.correct_index),
            "explanation": q.explanation.strip(),
            "sources": [
                {"id": hits[s].id, "doc_name": hits[s].doc_name, "page": hits[s].page, "excerpt": hits[s].text[:400]}
                for s in src_ids
            ],
        })
    return questions


def generate_quiz(course_id: int, n: int = 10, mode: QuizMode = "mixed", topic: str | None = None,
                  topics: list[str] | None = None) -> dict:
    n = max(1, min(n, MAX_QUESTIONS))
    chosen = pick_topics(course_id, mode, topic, n, topics)
    descriptions = {t["name"]: t["description"] for t in list_topics(course_id)}
    allowed = set(descriptions) | set(chosen)
    recent = [r["question"] for r in db.rows(
        """SELECT q.question FROM questions q JOIN quizzes z ON z.id = q.quiz_id
           WHERE z.course_id = ? ORDER BY q.id DESC LIMIT 25""", course_id)]

    questions: list[dict] = []
    seen: set[str] = set()

    def fill(target: int, batch_topics_for_round, batch_allowed: set[str]) -> None:
        """Gera em lotes até somar `target` questões novas; rodadas extras repõem as descartadas."""
        added = 0
        for round_no in range(math.ceil(target / BATCH_SIZE) + 2):
            if added >= target:
                return
            try:
                batch = _generate_batch(course_id, min(target - added, BATCH_SIZE), batch_topics_for_round(round_no),
                                        descriptions, recent + [q["question"] for q in questions], batch_allowed)
            except LLMError:
                if questions:  # falha num lote posterior: entrega o que já foi gerado
                    return
                raise
            for q in batch:
                key = " ".join(q["question"].lower().split())
                if key not in seen and added < target:
                    seen.add(key)
                    questions.append(q)
                    added += 1

    if mode == "topic":
        # cota por tópico: o modelo tende a concentrar as questões no primeiro da lista
        base, extra = divmod(n, len(chosen))
        for i, name in enumerate(chosen):
            quota = base + (1 if i < extra else 0)
            if quota:
                fill(quota, lambda _round, t=name: [t], {name})
        random.shuffle(questions)
    else:
        per_batch = min(len(chosen), 3)
        fill(n, lambda r: [chosen[(r * per_batch + j) % len(chosen)] for j in range(per_batch)], allowed)
    if not questions:
        raise LLMError("O modelo não gerou questões válidas. Tente novamente.")

    with db.tx() as c:
        quiz_id = c.execute(
            "INSERT INTO quizzes (course_id, mode, topics, created_at) VALUES (?, ?, ?, ?)",
            (course_id, mode, json.dumps(chosen, ensure_ascii=False), db.now()),
        ).lastrowid
        for q in questions:
            q["id"] = c.execute(
                """INSERT INTO questions (quiz_id, topic, difficulty, question, options, correct_index, explanation, sources)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (quiz_id, q["topic"], q["difficulty"], q["question"], json.dumps(q["options"], ensure_ascii=False),
                 q["correct_index"], q["explanation"], json.dumps(q["sources"], ensure_ascii=False)),
            ).lastrowid
    return get_quiz(quiz_id, reveal=False)


def get_quiz(quiz_id: int, reveal: bool) -> dict:
    z = db.row("SELECT * FROM quizzes WHERE id = ?", quiz_id)
    if not z:
        raise KeyError(quiz_id)
    qs = db.rows("SELECT * FROM questions WHERE quiz_id = ? ORDER BY id", quiz_id)
    return {
        "id": z["id"], "course_id": z["course_id"], "mode": z["mode"],
        "topics": json.loads(z["topics"]), "created_at": z["created_at"],
        "questions": [db.question_row_to_dict(q, reveal) for q in qs],
    }


def submit_answers(quiz_id: int, answers: list[dict]) -> dict:
    quiz = get_quiz(quiz_id, reveal=True)
    by_id = {q["id"]: q for q in quiz["questions"]}
    results, correct_total = [], 0
    with db.tx() as c:
        for a in answers:
            q = by_id.get(a["question_id"])
            if q is None:
                continue
            ok = int(a["chosen_index"] == q["correct_index"])
            correct_total += ok
            c.execute(
                "INSERT INTO answers (question_id, chosen_index, correct, answered_at) VALUES (?, ?, ?, ?)",
                (q["id"], a["chosen_index"], ok, db.now()),
            )
            results.append({**q, "chosen_index": a["chosen_index"], "correct": bool(ok)})
    total = len(results)
    return {
        "quiz_id": quiz_id,
        "score": correct_total,
        "total": total,
        "accuracy": round(correct_total / total, 3) if total else 0,
        "results": results,
        "weak_topics": weak_topics(topic_stats(quiz["course_id"])),
    }


def weak_topics(stats: list[dict]) -> list[dict]:
    """Até 3 tópicos já respondidos com acerto abaixo de 70%, do mais fraco ao mais forte."""
    return [s for s in stats if s["answered"] and s["accuracy"] < 0.7][:3]


# ───────────────────────── Pergunta livre (RAG) ─────────────────────────

ASK_SYSTEM = """Você é um tutor que responde dúvidas usando SOMENTE os trechos do material da disciplina.
- Responda em português do Brasil, de forma clara e didática, em até 3 parágrafos curtos.
- Cite as fontes no texto com o número do trecho entre colchetes, ex.: [1] ou [2][3].
- Se os trechos não trazem a resposta, diga que o material não cobre isso e não invente."""


def ask(course_id: int, question: str) -> dict:
    hits = store.search(course_id, question, k=6)
    if not hits:
        return {"answer": "Ainda não há material nesta disciplina. Envie um PDF ou PPTX primeiro.", "sources": []}
    ctx = "\n\n".join(f"[{i + 1}] ({h.doc_name}, p. {h.page})\n{h.text}" for i, h in enumerate(hits))
    answer = text(ASK_SYSTEM, f"Trechos:\n{ctx}\n\nPergunta do aluno: {question}", max_tokens=4000, effort="low")
    return {
        "answer": answer,
        "sources": [{"n": i + 1, "id": h.id, "doc_name": h.doc_name, "page": h.page, "excerpt": h.text[:400]} for i, h in enumerate(hits)],
    }


# ───────────────────────── Painel ─────────────────────────

def quiz_history(course_id: int, limit: int = 12) -> list[dict]:
    """Quizzes já respondidos, do mais recente ao mais antigo (vale a última resposta de cada questão)."""
    out = db.rows(
        """SELECT z.id AS quiz_id, z.created_at, z.mode, z.topics, MAX(a.answered_at) AS answered_at,
                  COUNT(a.id) AS total, COALESCE(SUM(a.correct), 0) AS score
           FROM quizzes z JOIN questions q ON q.quiz_id = z.id JOIN answers a ON a.question_id = q.id
           WHERE z.course_id = ? AND a.id IN (SELECT MAX(id) FROM answers GROUP BY question_id)
           GROUP BY z.id ORDER BY z.id DESC LIMIT ?""", course_id, limit)
    for h in out:
        h["topics"] = json.loads(h["topics"])
        h["accuracy"] = round(h["score"] / h["total"], 3)
    return out


def review_quiz(quiz_id: int) -> dict:
    """Quiz já respondido com as respostas dadas, o gabarito, as explicações e as fontes."""
    quiz = get_quiz(quiz_id, reveal=True)
    ids = [q["id"] for q in quiz["questions"]]
    marks = ",".join("?" * len(ids))
    answers = db.rows(
        f"""SELECT question_id, chosen_index, correct, answered_at FROM answers
            WHERE id IN (SELECT MAX(id) FROM answers WHERE question_id IN ({marks}) GROUP BY question_id)""", *ids)
    if not answers:
        raise ValueError("Este quiz ainda não foi respondido.")
    by_q = {a["question_id"]: a for a in answers}
    results = [
        {**q, "chosen_index": by_q[q["id"]]["chosen_index"], "correct": bool(by_q[q["id"]]["correct"])}
        for q in quiz["questions"] if q["id"] in by_q
    ]
    score = sum(r["correct"] for r in results)
    return {
        "quiz_id": quiz_id,
        "course_id": quiz["course_id"],
        "mode": quiz["mode"],
        "topics": quiz["topics"],
        "answered_at": max(a["answered_at"] for a in answers),
        "score": score,
        "total": len(results),
        "accuracy": round(score / len(results), 3),
        "results": results,
        "weak_topics": weak_topics(topic_stats(quiz["course_id"])),
    }


def clear_history(course_id: int) -> int:
    """Remove os quizzes da disciplina; questões e respostas saem em cascata."""
    with db.tx() as c:
        return c.execute("DELETE FROM quizzes WHERE course_id = ?", (course_id,)).rowcount


def dashboard(course_id: int) -> dict:
    totals = db.row(
        """SELECT COUNT(a.id) AS answered, COALESCE(SUM(a.correct), 0) AS correct
           FROM answers a JOIN questions q ON q.id = a.question_id JOIN quizzes z ON z.id = q.quiz_id
           WHERE z.course_id = ?""", course_id)
    history = quiz_history(course_id)
    done = db.row(
        """SELECT COUNT(DISTINCT z.id) AS n FROM quizzes z JOIN questions q ON q.quiz_id = z.id
           JOIN answers a ON a.question_id = q.id WHERE z.course_id = ?""", course_id)
    docs = db.row("SELECT COUNT(*) AS n, COALESCE(SUM(chunks), 0) AS chunks FROM documents WHERE course_id = ?", course_id)
    stats = topic_stats(course_id)
    return {
        "documents": docs["n"],
        "chunks": docs["chunks"],
        "quizzes": done["n"],
        "answered": totals["answered"],
        "accuracy": round(totals["correct"] / totals["answered"], 3) if totals["answered"] else None,
        "topics": stats,
        "weak_topics": weak_topics(stats),
        "history": list(reversed(history)),
    }
