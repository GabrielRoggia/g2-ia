"""Refaz os trechos e embeddings de todos os documentos a partir dos arquivos originais.

Disciplinas, tópicos, quizzes e respostas são preservados.
Pare o backend antes: dois processos não devem gravar no ChromaDB ao mesmo tempo.

Executar (dentro de backend/):  python reindex.py
"""
import socket
import sys

from app import db
from app.config import UPLOAD_DIR
from app.ingest import chunk_document
from app.store import store


def backend_running() -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", 8000)) == 0


def main() -> None:
    if backend_running():
        sys.exit("O backend está rodando na porta 8000. Pare-o antes de reindexar.")
    db.init_db()
    docs = db.rows("SELECT id, course_id, name, filename FROM documents ORDER BY id")
    missing = [d["name"] for d in docs if not (UPLOAD_DIR / d["filename"]).exists()]
    if missing:
        sys.exit(f"Arquivos originais ausentes, nada foi alterado: {missing}")

    # divide tudo antes de apagar, para uma falha de leitura não deixar a base pela metade
    planned = [(d, chunk_document(UPLOAD_DIR / d["filename"])) for d in docs]
    empty = [d["name"] for d, chunks in planned if not chunks]
    if empty:
        sys.exit(f"Documentos sem texto, nada foi alterado: {empty}")

    for d, chunks in planned:
        store.delete_document(d["course_id"], d["id"])
        store.add_chunks(d["course_id"], d["id"], d["name"], chunks)
        db.execute("UPDATE documents SET chunks = ? WHERE id = ?", len(chunks), d["id"])
        print(f"{d['name']}: {len(chunks)} trechos")
    print(f"Total: {sum(len(c) for _, c in planned)} trechos em {len(planned)} documentos")


if __name__ == "__main__":
    main()
