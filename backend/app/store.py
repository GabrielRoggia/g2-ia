"""Base vetorial (ChromaDB) + busca lexical (BM25) combinadas por Reciprocal Rank Fusion.

- Busca semântica: embeddings multilíngues (fastembed, ONNX) guardados no ChromaDB.
- Busca lexical: BM25 sobre os mesmos trechos, bom para termos técnicos exatos
  ("backpropagation", "ReLU", siglas) que embeddings às vezes perdem.
- Híbrida: funde os dois rankings com RRF (score = soma de 1 / (k + posição)).
"""
from __future__ import annotations

import re
import threading
import unicodedata
from dataclasses import dataclass
from typing import Literal

import chromadb
from fastembed import TextEmbedding
from rank_bm25 import BM25Okapi

from .config import CHROMA_DIR, EMBED_MODEL, TOP_K

SearchMode = Literal["vector", "bm25", "hybrid"]

STOPWORDS = set(
    """a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se
    ao aos as os é ou como mais menos sua seu suas seus ser são foi pelo pela pelos pelas
    the of and to in is for on with this that""".split()
)


def tokenize(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return [t for t in re.findall(r"[a-z0-9]+", text) if len(t) > 1 and t not in STOPWORDS]


@dataclass
class Hit:
    id: str
    text: str
    doc_id: int
    doc_name: str
    page: int
    score: float

    def as_dict(self) -> dict:
        return self.__dict__.copy()


class VectorStore:
    def __init__(self) -> None:
        self._client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self._col = self._client.get_or_create_collection(
            "materiais", metadata={"hnsw:space": "cosine"}
        )
        self._embedder: TextEmbedding | None = None
        self._bm25_cache: dict[int, tuple[BM25Okapi, list[str], list[str], list[dict]]] = {}
        self._lock = threading.Lock()

    # ---------- embeddings ----------
    @property
    def embedder(self) -> TextEmbedding:
        if self._embedder is None:
            self._embedder = TextEmbedding(model_name=EMBED_MODEL)
        return self._embedder

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self.embedder.embed(texts)]

    # ---------- escrita ----------
    def add_chunks(self, course_id: int, doc_id: int, doc_name: str, chunks) -> int:
        if not chunks:
            return 0
        ids = [f"{doc_id}-{c.index}" for c in chunks]
        texts = [c.text for c in chunks]
        metas = [
            {"course_id": course_id, "doc_id": doc_id, "doc_name": doc_name, "page": c.page}
            for c in chunks
        ]
        for i in range(0, len(ids), 64):
            self._col.add(
                ids=ids[i : i + 64],
                documents=texts[i : i + 64],
                metadatas=metas[i : i + 64],
                embeddings=self.embed(texts[i : i + 64]),
            )
        self._bm25_cache.pop(course_id, None)
        return len(ids)

    def delete_document(self, course_id: int, doc_id: int) -> None:
        self._col.delete(where={"doc_id": doc_id})
        self._bm25_cache.pop(course_id, None)

    # ---------- leitura ----------
    def course_chunks(self, course_id: int) -> tuple[list[str], list[str], list[dict]]:
        res = self._col.get(where={"course_id": course_id}, include=["documents", "metadatas"])
        return res["ids"], res["documents"], res["metadatas"]

    def get_by_ids(self, ids: list[str]) -> list[Hit]:
        if not ids:
            return []
        res = self._col.get(ids=ids, include=["documents", "metadatas"])
        by_id = {
            i: Hit(i, d, m["doc_id"], m["doc_name"], m["page"], 0.0)
            for i, d, m in zip(res["ids"], res["documents"], res["metadatas"])
        }
        return [by_id[i] for i in ids if i in by_id]

    def _bm25(self, course_id: int):
        with self._lock:
            if course_id not in self._bm25_cache:
                ids, docs, metas = self.course_chunks(course_id)
                if not ids:
                    return None
                bm = BM25Okapi([tokenize(d) or ["_"] for d in docs])
                self._bm25_cache[course_id] = (bm, ids, docs, metas)
            return self._bm25_cache[course_id]

    def search_vector(self, course_id: int, query: str, k: int) -> list[Hit]:
        if self._col.count() == 0:
            return []
        res = self._col.query(
            query_embeddings=self.embed([query]),
            n_results=k,
            where={"course_id": course_id},
            include=["documents", "metadatas", "distances"],
        )
        return [
            Hit(i, d, m["doc_id"], m["doc_name"], m["page"], 1 - dist)
            for i, d, m, dist in zip(
                res["ids"][0], res["documents"][0], res["metadatas"][0], res["distances"][0]
            )
        ]

    def search_bm25(self, course_id: int, query: str, k: int) -> list[Hit]:
        cached = self._bm25(course_id)
        if cached is None:
            return []
        bm, ids, docs, metas = cached
        scores = bm.get_scores(tokenize(query))
        order = sorted(range(len(ids)), key=lambda i: scores[i], reverse=True)[:k]
        return [
            Hit(ids[i], docs[i], metas[i]["doc_id"], metas[i]["doc_name"], metas[i]["page"], float(scores[i]))
            for i in order
            if scores[i] > 0
        ]

    def search(self, course_id: int, query: str, k: int = TOP_K, mode: SearchMode = "hybrid") -> list[Hit]:
        if mode == "vector":
            return self.search_vector(course_id, query, k)
        if mode == "bm25":
            return self.search_bm25(course_id, query, k)
        # Reciprocal Rank Fusion
        pool = max(k * 3, 15)
        rankings = [self.search_vector(course_id, query, pool), self.search_bm25(course_id, query, pool)]
        fused: dict[str, float] = {}
        hits: dict[str, Hit] = {}
        for ranking in rankings:
            for pos, h in enumerate(ranking):
                fused[h.id] = fused.get(h.id, 0.0) + 1.0 / (60 + pos + 1)
                hits.setdefault(h.id, h)
        best = sorted(fused, key=fused.get, reverse=True)[:k]
        out = []
        for i in best:
            h = hits[i]
            h.score = round(fused[i], 5)
            out.append(h)
        return out


store = VectorStore()
