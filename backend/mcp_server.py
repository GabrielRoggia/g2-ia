"""Servidor MCP (FastMCP) do Revisa AI.

Expõe as funções do tutor como ferramentas MCP, para que qualquer cliente MCP
(Claude Desktop, Claude Code, outros agentes) consulte o material e gere quizzes.

Executar:  python mcp_server.py            (transporte stdio)
"""
from fastmcp import FastMCP

from app import db, tutor
from app.store import store

db.init_db()
mcp = FastMCP("revisa-ai")


@mcp.tool()
def listar_disciplinas() -> list[dict]:
    """Lista as disciplinas cadastradas com a quantidade de materiais."""
    return db.rows(
        "SELECT c.id, c.name, (SELECT COUNT(*) FROM documents d WHERE d.course_id = c.id) AS documentos FROM courses c"
    )


@mcp.tool()
def listar_topicos(disciplina_id: int) -> list[dict]:
    """Tópicos da disciplina com o domínio do aluno (0 a 1) em cada um, do mais fraco ao mais forte."""
    return tutor.topic_stats(disciplina_id)


@mcp.tool()
def buscar_no_material(disciplina_id: int, consulta: str, k: int = 5) -> list[dict]:
    """Busca híbrida (semântica + BM25) nos materiais da disciplina. Retorna trechos com documento e página."""
    return [h.as_dict() for h in store.search(disciplina_id, consulta, k=k)]


@mcp.tool()
def gerar_quiz(disciplina_id: int, quantidade: int = 10, modo: str = "adaptive", topico: str | None = None) -> dict:
    """Gera um quiz de múltipla escolha a partir do material.
    modo: 'adaptive' (foca nos pontos fracos), 'mixed' (tópicos variados) ou 'topic' (exige topico)."""
    return tutor.generate_quiz(disciplina_id, n=quantidade, mode=modo, topic=topico)


@mcp.tool()
def desempenho_do_aluno(disciplina_id: int) -> dict:
    """Resumo do desempenho: acerto geral, histórico por quiz e tópicos mais fracos."""
    return tutor.dashboard(disciplina_id)


@mcp.tool()
def perguntar_ao_material(disciplina_id: int, pergunta: str) -> dict:
    """Responde uma dúvida usando só o material da disciplina, com citação das fontes."""
    return tutor.ask(disciplina_id, pergunta)


if __name__ == "__main__":
    mcp.run()
