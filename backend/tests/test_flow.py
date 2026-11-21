"""Teste de ponta a ponta do fluxo do tutor, sem chamar a API do Claude.

O LLM é substituído por respostas fixas (mock), então o teste roda offline e
verifica: ingestão, busca, geração/validação do quiz, correção e diagnóstico.

Executar (dentro de backend/):  python -m tests.test_flow
"""
import os
import tempfile
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="revisa_test_")

from app import db, tutor  # noqa: E402
from app.ingest import chunk_document  # noqa: E402
from app.store import store  # noqa: E402

SAMPLE = Path(__file__).resolve().parents[2] / "sample_data" / "redes_neurais.md"


def fake_structured(system, user, schema, **_):
    if schema is tutor.TopicsOut:
        return tutor.TopicsOut(topics=[
            tutor.TopicOut(name="Funções de ativação", description="Sigmoide, tanh, ReLU e softmax"),
            tutor.TopicOut(name="Regularização", description="Overfitting, dropout e early stopping"),
        ])
    if schema is tutor.QuizOut:
        import re
        ids = re.findall(r'<trecho id="([^"]+)"', user)
        q = lambda topic, text: tutor.QuestionOut(  # noqa: E731
            topic=topic, difficulty="media", question=text,
            options=["Certa", "Errada 1", "Errada 2", "Errada 3"], correct_index=0,
            explanation="Porque sim.", source_ids=[ids[0], "id-inexistente"],
        )
        return tutor.QuizOut(questions=[
            q("Funções de ativação", "O que a ReLU retorna?"),
            q("Regularização", "O que o dropout faz?"),
            tutor.QuestionOut(topic="X", difficulty="facil", question="inválida", options=["a", "b"],
                              correct_index=5, explanation="", source_ids=[]),
        ])
    raise AssertionError(schema)


def main():
    tutor.structured = fake_structured
    db.init_db()
    cid = db.execute("INSERT INTO courses (name, created_at) VALUES (?, ?)", "IA II", db.now())
    chunks = chunk_document(SAMPLE)
    assert len(chunks) >= 5, "o material deveria gerar vários trechos"
    sizes = [len(store.tokenizer.encode(c.text).ids) for c in chunks]  # inclui os 2 tokens especiais
    assert max(sizes) <= 128, f"trecho maior que o limite do modelo: {max(sizes)} tokens"
    text = " ".join(c.text for c in chunks)
    assert "Kohonen" in text and "Rosenblatt" in text, "a divisão não pode perder o início nem o fim do material"
    did = db.execute("INSERT INTO documents (course_id,name,filename,pages,chunks,created_at) VALUES (?,?,?,?,?,?)",
                     cid, SAMPLE.name, SAMPLE.name, 1, len(chunks), db.now())
    store.add_chunks(cid, did, SAMPLE.name, chunks)

    hits = store.search(cid, "dropout overfitting", k=3, mode="hybrid")
    assert any("dropout" in h.text.lower() for h in hits), "busca híbrida deveria achar o trecho de dropout"

    topics = tutor.extract_topics(cid)
    assert [t["name"] for t in topics] == ["Funções de ativação", "Regularização"]

    quiz = tutor.generate_quiz(cid, n=2, mode="mixed")
    assert len(quiz["questions"]) == 2, "a questão inválida deve ser descartada"
    assert "correct_index" not in quiz["questions"][0], "o gabarito não pode ir para o cliente antes da resposta"
    full = tutor.get_quiz(quiz["id"], reveal=True)
    for q in full["questions"]:
        assert q["options"][q["correct_index"]] == "Certa", "o gabarito deve acompanhar o embaralhamento"
        assert all(s["id"] != "id-inexistente" for s in q["sources"]), "fontes inventadas devem ser filtradas"

    only = tutor.generate_quiz(cid, n=2, mode="topic", topics=["Regularização", "Inexistente"])
    assert only["topics"] == ["Regularização"], "tópicos fora da disciplina devem ser ignorados"
    assert {q["topic"] for q in only["questions"]} == {"Regularização"}, "questões só dos tópicos escolhidos"
    both = tutor.generate_quiz(cid, n=2, mode="topic", topics=["Funções de ativação", "Regularização"])
    assert both["topics"] == ["Funções de ativação", "Regularização"]
    db.execute("DELETE FROM quizzes WHERE id IN (?, ?)", only["id"], both["id"])

    q1, q2 = full["questions"]
    res = tutor.submit_answers(quiz["id"], [
        {"question_id": q1["id"], "chosen_index": q1["correct_index"]},
        {"question_id": q2["id"], "chosen_index": (q2["correct_index"] + 1) % 4},
    ])
    assert res["score"] == 1 and res["total"] == 2

    dash = tutor.dashboard(cid)
    assert dash["answered"] == 2 and dash["accuracy"] == 0.5
    assert [w["topic"] for w in dash["weak_topics"]] == [q2["topic"]], "só o tópico errado deve aparecer como ponto fraco"

    assert tutor.pick_topics(cid, "adaptive", None, 5)[0] == q2["topic"], "modo adaptativo deve priorizar o ponto fraco"
    print("OK: ingestão, busca híbrida, quiz, correção e diagnóstico adaptativo funcionando")


if __name__ == "__main__":
    main()
