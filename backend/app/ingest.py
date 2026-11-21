"""Extração de texto dos materiais (PDF, PPTX, TXT/MD) e divisão em trechos (chunks).

Cada trecho guarda de onde veio (documento e página/slide) para que as perguntas
geradas e as respostas possam citar a fonte exata.
"""
from __future__ import annotations

import re
from bisect import bisect_right
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from pptx import Presentation

from .config import CHUNK_OVERLAP_TOKENS, CHUNK_TOKENS
from .store import store

SUPPORTED = {".pdf", ".pptx", ".txt", ".md"}


@dataclass
class Page:
    number: int  # página do PDF ou número do slide (1-based)
    text: str


@dataclass
class Chunk:
    text: str
    page: int
    index: int  # posição do trecho dentro do documento


def _clean(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(path: Path) -> list[Page]:
    ext = path.suffix.lower()
    if ext == ".pdf":
        reader = PdfReader(str(path))
        return [Page(i + 1, _clean(p.extract_text() or "")) for i, p in enumerate(reader.pages)]
    if ext == ".pptx":
        pres = Presentation(str(path))
        pages = []
        for i, slide in enumerate(pres.slides):
            parts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    parts.append(shape.text_frame.text)
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame is not None:
                parts.append(slide.notes_slide.notes_text_frame.text)
            pages.append(Page(i + 1, _clean("\n".join(parts))))
        return pages
    if ext in {".txt", ".md"}:
        return [Page(1, _clean(path.read_text(encoding="utf-8", errors="ignore")))]
    raise ValueError(f"Formato não suportado: {ext}")


def split_text(text: str, max_tokens: int = CHUNK_TOKENS, overlap: int = CHUNK_OVERLAP_TOKENS) -> list[str]:
    """Divide o texto em janelas que cabem no modelo de embeddings, medidas em tokens.
    Corta de preferência em fim de parágrafo ou frase, com sobreposição entre janelas."""
    if not text:
        return []
    offsets = store.tokenizer.encode(text, add_special_tokens=False).offsets
    total = len(offsets)
    if total <= max_tokens:
        return [text]

    pieces: list[str] = []
    start = 0
    while start < total:
        end = min(start + max_tokens, total)
        if end < total:
            begin = offsets[start][0]
            window = text[begin:offsets[end - 1][1]]
            cut = max(window.rfind("\n\n"), window.rfind(". "), window.rfind("\n"))
            if cut > len(window) * 0.5:
                limit = begin + cut + 1
                end = max(start + 1, bisect_right([o[1] for o in offsets], limit, start, end))
            else:
                # sem fim de frase por perto: ao menos não corta no meio de uma palavra
                back = end
                while back > start + max_tokens // 2 and offsets[back][0] == offsets[back - 1][1]:
                    back -= 1
                if back > start + max_tokens // 2:
                    end = back
        piece = text[offsets[start][0]:offsets[end - 1][1]].strip()
        if piece:
            pieces.append(piece)
        if end >= total:
            break
        next_start = max(end - overlap, start + 1)
        # começa o próximo trecho no início de uma palavra
        while next_start < end and not text[offsets[next_start][0] - 1].isspace():
            next_start += 1
        start = next_start
    return pieces


def chunk_document(path: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for page in extract_pages(path):
        if len(page.text) < 30:  # ignora slides vazios ou só com título curto
            continue
        for piece in split_text(page.text):
            chunks.append(Chunk(text=piece, page=page.number, index=len(chunks)))
    return chunks
