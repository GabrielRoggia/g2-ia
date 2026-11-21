# Revisa AI

Tutor de estudos com RAG, desenvolvido para o Trabalho 2 de Inteligência Artificial II (AMF, 2026/02), na **modalidade 3: integração com IA em contexto avançado**.

## Problema

Na semana de prova, o aluno tem muitos PDFs e slides e não sabe o que já domina. Reler tudo é lento, criar perguntas à mão toma tempo, e um chat genérico pode responder com conteúdo diferente do que foi ensinado na disciplina.

## Solução

O aluno envia o material da disciplina e o Revisa AI:

- gera quizzes de múltipla escolha a partir desse material;
- corrige as respostas e explica cada questão;
- mostra o documento e a página de origem;
- identifica os tópicos mais fracos e direciona os próximos quizzes;
- responde dúvidas com base nos documentos enviados.

## Como funciona

1. **Ingestão:** o texto de PDFs, PPTX, TXT e MD é extraído e dividido em trechos, guardando documento e página.
2. **Indexação:** cada trecho vira um embedding salvo no ChromaDB e também é usado na busca por palavras (BM25).
3. **Recuperação:** a busca vetorial e o BM25 são combinados com Reciprocal Rank Fusion (RRF).
4. **Geração:** o modelo recebe os trechos recuperados e devolve as questões em JSON.
5. **Validação:** o backend descarta questões inválidas ou repetidas, filtra fontes inexistentes e embaralha as alternativas.
6. **Correção e diagnóstico:** o backend corrige sem usar IA e calcula o domínio por tópico com `(acertos + 1) / (respondidas + 2)`.

## Tecnologias

- **App:** React Native, Expo e Expo Router
- **Backend:** Python e FastAPI
- **RAG:** ChromaDB, BM25 e `paraphrase-multilingual-MiniLM-L12-v2`
- **Modelos:** Ollama, Claude Code ou API do Claude, escolhidos na tela de Configurações
- **Dados:** SQLite
- **Integração opcional:** servidor MCP com FastMCP

## Como executar

Pré-requisitos: Python 3.11+, Node 20+ e um provedor de IA.

### 1. Provedor de IA

Para usar o modelo local, instale o [Ollama](https://ollama.com) e baixe o modelo:

```powershell
ollama pull qwen2.5:3b
```

Também é possível usar o Claude Code com `claude auth login` ou a API do Claude com `ANTHROPIC_API_KEY` em `backend/.env`.

### 2. Backend

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

### 3. App

Em outro terminal:

```powershell
cd frontend
npm install
npx expo start --web --port 8081
```

Acesse http://localhost:8081, abra **Configurações**, escolha o modelo e clique em **Testar conexão**.

### 4. Uso

1. Em **Materiais**, crie uma disciplina e envie os arquivos. Para testar, use `sample_data/redes_neurais.md`.
2. Em **Quiz**, escolha o modo e a quantidade de questões.
3. Responda e confira as explicações e as fontes.
4. No **Painel**, acompanhe o histórico e treine os pontos fracos.

## Testes e avaliação

```powershell
cd backend
.\.venv\Scripts\python.exe -m tests.test_flow
.\.venv\Scripts\python.exe -m eval.run_eval retrieval --course <id> --samples 40
.\.venv\Scripts\python.exe -m eval.run_eval quiz --course <id> --quizzes 4 --per-quiz 5
```

Resultados com as 12 aulas de IA II e o Claude Sonnet:

| Busca (40 perguntas) | Hit@1 | Hit@5 | MRR |
|---|---|---|---|
| Vetorial | 52,5% | 75,0% | 0,609 |
| BM25 | 67,5% | 95,0% | 0,765 |
| Híbrida (usada no app) | 62,5% | 87,5% | 0,725 |

