# 📓 Chithhi LM — an open-source NotebookLM

🚀 **Live:** [notebook-lm-clone-one.vercel.app](https://notebook-lm-clone-one.vercel.app/)

Chithhi LM lets you upload documents, paste text, or add web pages, then **chat with them** using a Retrieval-Augmented Generation (RAG) pipeline that grounds every answer in your own sources and cites them.

---

## ✨ Features

- **Multi-format ingestion** — PDF, DOCX, TXT, CSV, pasted text, and web URLs (SSRF-guarded).
- **Grounded chat** — streaming answers (SSE) with inline source citations you can click.
- **Advanced RAG** — hybrid **BM25 + vector** search, **RRF** fusion, LLM **re-ranking**, query translation/routing, and a **corrective loop (CRAG)** with a relevance floor.
- **Workspace** — pin / rename / delete dialogues; rename / delete sources; a dialogue becomes read-only if all its sources are removed.
- **Long-term memory** — per-user facts + an episodic/graph memory (Neo4j).
- **Observability & evals** — request tracing, an LLM-as-judge, golden datasets, and ablation runs (admin-only dashboard).
- **Auth** — JWT + bcrypt, request validation, rate limiting, and security headers.

---

## 🛠️ Tech stack

| Layer | Tech |
|------|------|
| Frontend | React 19 (Vite), Zustand, Tailwind v4, Radix UI, react-markdown |
| API | **Bun** + Express 5 |
| Worker | **Node** + BullMQ (Redis) |
| Data | MongoDB (Mongoose), Qdrant (vectors), Neo4j (memory graph), Redis (queues) |
| Storage | S3 / Cloudflare R2 (presigned uploads) |
| AI | OpenAI SDK + LangChain.js |
| Ops | pino logging, PostHog analytics/errors, GitHub Actions CI |

---

## 🏗️ Architecture

```
            ┌────────────┐     presigned PUT      ┌──────────┐
 Browser ──▶│  API (Bun) │───────────────────────▶│  S3/R2   │
   ▲        └─────┬──────┘                         └──────────┘
   │  SSE stream  │  enqueue jobs (BullMQ/Redis)
   │        ┌─────▼───────┐   parse→chunk→embed    ┌──────────┐
   └────────│ Worker(Node)│───────────────────────▶│  Qdrant  │
            └─────┬───────┘                         └──────────┘
                  │ chunks/metadata ▼        memory ▼
              ┌────────┐                   ┌──────────┐
              │ Mongo  │                   │  Neo4j   │
              └────────┘                   └──────────┘
```

Ingestion is asynchronous: the API hands files to S3 and enqueues a job; the worker parses, chunks (parent/child), embeds into Qdrant, and generates a title + summary. Chat retrieval runs the hybrid pipeline, then streams a grounded answer.

---

## 🚀 Run locally

**Prereqs:** [Bun](https://bun.sh), Node 18+, and running MongoDB, Redis, Qdrant (Neo4j + S3/R2 optional for full features).

```bash
git clone https://github.com/Yasho321/NotebookLM-Clone.git
cd NotebookLM-Clone

# 1) Backend API (Bun)
cd backend
bun install
cp .env.example .env   # fill in values
bun run dev            # http://localhost:8080

# 2) Worker (Node) — required, or sources never finish processing
cd backend/worker
node index.js

# 3) Frontend (Vite)
cd frontend
npm install
cp .env.example .env   # optional
npm run dev            # http://localhost:5173
```

> **Three processes.** The worker is not optional — without it, uploaded sources stay stuck on "processing".

See [`backend/.env.example`](backend/.env.example) and [`frontend/.env.example`](frontend/.env.example) for all variables. The API validates critical env vars at startup and exits with a clear message if any are missing.

---

## 📖 Usage

1. Sign up, then add sources (upload a file, paste text, or add a URL).
2. Wait for processing (status updates live); each source gets an AI title + summary.
3. Select sources in the Library and ask questions — answers stream in with citations.
4. Pin, rename, or delete dialogues and sources from the ⋮ menus.

---

## 👨‍💻 Author

**Chithhi LM** by [Yasho321](https://github.com/Yasho321)
