"""Avaliação quantitativa do Revisa AI.

1) Recuperação (retrieval): compara busca vetorial, BM25 e híbrida (RRF).
   Para cada trecho amostrado, o LLM escreve uma pergunta que só aquele trecho responde.
   Medimos se o trecho certo volta no top-k (Hit@k) e em que posição (MRR).

2) Qualidade das questões: gera quizzes e usa o LLM como avaliador (LLM-as-judge)
   com critérios fixos: gabarito correto, fidelidade ao material, clareza e
   plausibilidade dos distratores. Também exporta um CSV para revisão humana.

Uso (dentro de backend/, com o venv ativo):
    python -m eval.run_eval retrieval --course 1 --samples 40
    python -m eval.run_eval quiz --course 1 --quizzes 4 --per-quiz 5
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import statistics
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from app import db, tutor  # noqa: E402
from app.llm import structured  # noqa: E402
from app.store import store  # noqa: E402

OUT = Path(__file__).parent / "results"
OUT.mkdir(exist_ok=True)
ORANGE, BLUE, CYAN = "#f75500", "#3498db", "#48d4d4"


# ───────────────────────── 1. Recuperação ─────────────────────────

class SyntheticQ(BaseModel):
    question: str = Field(description="Pergunta de aluno respondida por este trecho, sem copiar frases literais")


def retrieval_eval(course_id: int, samples: int, k: int) -> None:
    ids, docs, metas = store.course_chunks(course_id)
    if not ids:
        raise SystemExit("Disciplina sem material.")
    cache = OUT / f"retrieval_set_course{course_id}.json"
    dataset = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else []
    if len(dataset) < samples:
        random.seed(42)
        pool = [i for i, d in enumerate(docs) if len(d) > 250 and ids[i] not in {x["chunk_id"] for x in dataset}]
        for i in random.sample(pool, k=min(samples - len(dataset), len(pool))):
            q = structured(
                "Você escreve perguntas de estudo em português do Brasil. Parafraseie; não copie frases do trecho.",
                f"Trecho:\n{docs[i]}\n\nEscreva UMA pergunta que este trecho responde.",
                SyntheticQ, max_tokens=1000, effort="low",
            )
            dataset.append({"chunk_id": ids[i], "doc_id": metas[i]["doc_id"], "page": metas[i]["page"], "question": q.question})
            print(f"  + {q.question}")
        cache.write_text(json.dumps(dataset, ensure_ascii=False, indent=2), encoding="utf-8")

    modes = ["vector", "bm25", "hybrid"]
    metrics = {}
    for mode in modes:
        hits1 = hitsk = rr = 0.0
        for item in dataset:
            # acerto por documento e página: continua válido quando os trechos são refeitos
            ranked = [(h.doc_id, h.page) for h in store.search(course_id, item["question"], k=k, mode=mode)]
            gold = (item["doc_id"], item["page"])
            pos = ranked.index(gold) + 1 if gold in ranked else None
            hits1 += pos == 1
            hitsk += pos is not None
            rr += 1 / pos if pos else 0
        n = len(dataset)
        metrics[mode] = {"hit@1": round(hits1 / n, 3), f"hit@{k}": round(hitsk / n, 3), "mrr": round(rr / n, 3)}

    (OUT / "retrieval_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"\nPerguntas avaliadas: {len(dataset)}")
    print(f"{'modo':<8} {'hit@1':>7} {'hit@'+str(k):>7} {'mrr':>7}")
    for m, v in metrics.items():
        print(f"{m:<8} {v['hit@1']:>7} {v[f'hit@{k}']:>7} {v['mrr']:>7}")

    fig, ax = plt.subplots(figsize=(7, 4))
    labels = ["hit@1", f"hit@{k}", "mrr"]
    width = 0.26
    for j, (mode, color) in enumerate(zip(modes, [BLUE, CYAN, ORANGE])):
        vals = [metrics[mode][lab] for lab in labels]
        bars = ax.bar([x + (j - 1) * width for x in range(3)], vals, width, label={"vector": "Vetorial", "bm25": "BM25", "hybrid": "Híbrida (RRF)"}[mode], color=color)
        ax.bar_label(bars, fmt="%.2f", fontsize=8)
    ax.set_xticks(range(3), labels)
    ax.set_ylim(0, 1.1)
    ax.set_title(f"Recuperação por modo de busca (n={len(dataset)})")
    ax.legend(frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(OUT / "retrieval.png", dpi=150)
    print(f"\nGráfico salvo em {OUT / 'retrieval.png'}")


# ───────────────────────── 2. Qualidade das questões ─────────────────────────

class Judgement(BaseModel):
    gabarito_correto: bool = Field(description="A alternativa marcada como correta está certa segundo os trechos")
    fiel_ao_material: bool = Field(description="A questão é respondível só com os trechos, sem conhecimento externo")
    sem_ambiguidade: bool = Field(description="Só uma alternativa pode ser defendida como correta")
    distratores: int = Field(description="Plausibilidade dos distratores de 1 (óbvios) a 5 (ótimos)")
    comentario: str


JUDGE_SYSTEM = """Você é um avaliador rigoroso de questões de prova. Julgue a questão
apenas com base nos trechos-fonte fornecidos. Seja crítico: na dúvida, marque falso."""


def quiz_eval(course_id: int, quizzes: int, per_quiz: int) -> None:
    rows = []
    for z in range(quizzes):
        quiz = tutor.generate_quiz(course_id, n=per_quiz, mode="mixed")
        full = tutor.get_quiz(quiz["id"], reveal=True)
        for q in full["questions"]:
            # o avaliador precisa do trecho inteiro: o campo excerpt é cortado para exibição
            src = "\n\n".join(h.text for h in store.get_by_ids([s["id"] for s in q["sources"]]))
            opts = "\n".join(f"{chr(65 + i)}) {o}" for i, o in enumerate(q["options"]))
            j = structured(
                JUDGE_SYSTEM,
                f"Trechos-fonte:\n{src}\n\nQuestão: {q['question']}\n{opts}\n"
                f"Gabarito informado: {chr(65 + q['correct_index'])}\nExplicação: {q['explanation']}",
                Judgement, max_tokens=2000, effort="medium",
            )
            rows.append({"quiz": quiz["id"], "topic": q["topic"], "difficulty": q["difficulty"], "question": q["question"],
                         "answer": q["options"][q["correct_index"]], **j.model_dump()})
            print(f"  quiz {z + 1}/{quizzes} · {'OK ' if j.gabarito_correto else 'ERR'} {q['question'][:70]}")

    n = len(rows)
    summary = {
        "questoes": n,
        "gabarito_correto": round(sum(r["gabarito_correto"] for r in rows) / n, 3),
        "fiel_ao_material": round(sum(r["fiel_ao_material"] for r in rows) / n, 3),
        "sem_ambiguidade": round(sum(r["sem_ambiguidade"] for r in rows) / n, 3),
        "distratores_media": round(statistics.mean(r["distratores"] for r in rows), 2),
    }
    (OUT / "quiz_quality.json").write_text(json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
    with open(OUT / "quiz_review.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + ["revisao_humana_ok"], delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow({**r, "revisao_humana_ok": ""})

    print("\nResumo:", json.dumps(summary, ensure_ascii=False, indent=2))
    fig, ax = plt.subplots(figsize=(7, 3.6))
    labels = ["Gabarito correto", "Fiel ao material", "Sem ambiguidade", "Distratores (÷5)"]
    vals = [summary["gabarito_correto"], summary["fiel_ao_material"], summary["sem_ambiguidade"], summary["distratores_media"] / 5]
    bars = ax.barh(labels, vals, color=ORANGE)
    ax.bar_label(bars, labels=[f"{v:.0%}" for v in vals], padding=4, fontsize=9)
    ax.set_xlim(0, 1.15)
    ax.invert_yaxis()
    ax.set_title(f"Qualidade das questões geradas (n={n}, avaliadas por LLM)")
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    fig.savefig(OUT / "quiz_quality.png", dpi=150)
    print(f"Gráfico salvo em {OUT / 'quiz_quality.png'} · CSV para revisão humana em {OUT / 'quiz_review.csv'}")


if __name__ == "__main__":
    db.init_db()
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("retrieval")
    r.add_argument("--course", type=int, required=True)
    r.add_argument("--samples", type=int, default=40)
    r.add_argument("--k", type=int, default=5)
    q = sub.add_parser("quiz")
    q.add_argument("--course", type=int, required=True)
    q.add_argument("--quizzes", type=int, default=4)
    q.add_argument("--per-quiz", type=int, default=5)
    a = p.parse_args()
    if a.cmd == "retrieval":
        retrieval_eval(a.course, a.samples, a.k)
    else:
        quiz_eval(a.course, a.quizzes, a.per_quiz)
