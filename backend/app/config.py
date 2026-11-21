"""Configurações centrais do backend, lidas do ambiente (.env)."""
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
CHROMA_DIR = DATA_DIR / "chroma"
DB_PATH = DATA_DIR / "app.db"

for d in (DATA_DIR, UPLOAD_DIR, CHROMA_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Modelo de linguagem (Claude) usado para gerar quizzes, tópicos e respostas.
LLM_MODEL = os.getenv("LLM_MODEL", "claude-opus-5-5")
LLM_EFFORT = os.getenv("LLM_EFFORT", "medium")

# Modelo de embeddings multilíngue (roda localmente via ONNX, sem GPU).
EMBED_MODEL = os.getenv(
    "EMBED_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

# Parâmetros do RAG
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "900"))        # caracteres por trecho
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))
TOP_K = int(os.getenv("TOP_K", "6"))
