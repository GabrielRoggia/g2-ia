"""Extração de texto dos materiais (PDF, PPTX, TXT/MD) e divisão em trechos (chunks).

Cada trecho guarda de onde veio (documento e página/slide) para que as perguntas
geradas e as respostas possam citar a fonte exata.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from pptx import Presentation

from .config import CHUNK_OVERLAP, CHUNK_SIZE

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


def split_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Divide o texto em janelas de ~size caracteres, cortando preferencialmente
    em quebras de parágrafo ou fim de frase, com sobreposição entre janelas."""
    if len(text) <= size:
        return [text] if text else []
    pieces, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            window = text[start:end]
            cut = max(window.rfind("\n\n"), window.rfind(". "), window.rfind("\n"))
            if cut > size * 0.5:
                end = start + cut + 1
        piece = text[start:end].strip()
        if piece:
            pieces.append(piece)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
        # começa o próximo trecho no início de uma palavra
        space = text.find(" ", start, start + 40)
        if space != -1:
            start = space + 1
    return pieces


def chunk_document(path: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for page in extract_pages(path):
        if len(page.text) < 30:  # ignora slides vazios ou só com título curto
            continue
        for piece in split_text(page.text):
            chunks.append(Chunk(text=piece, page=page.number, index=len(chunks)))
    return chunks
