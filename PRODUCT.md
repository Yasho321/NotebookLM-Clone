# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React (Vite), Zustand, Tailwind CSS, Radix UI / ShadCN, Node.js + Express, MongoDB, Qdrant Vector DB, OpenAI SDK & LangChain.js

## Users

Researchers, students, and academics analyzing papers, lecture notes, textbooks (PDF, DOCX, TXT, CSV), web articles, and research sources.

## Product Purpose

Chithhi LM is an open-source AI-powered notebook platform that enables users to upload, organize, summarize, and chat with multi-format knowledge sources using Retrieval-Augmented Generation (RAG).

## Positioning

An open-source alternative to Google's NotebookLM, offering source-grounded chat synthesis, instant automatic document summaries, structured note creation, and full control over document vector indexing and LLM backends.

## Operating Context

Deep research sessions, academic paper review, exam preparation, and multi-source study workflows where clear source attribution, readability, and quick information retrieval are paramount.

## Capabilities and Constraints

- **Multi-Format Ingestion:** File upload support for PDF, DOCX, TXT, CSV, web URLs, and pasted raw text.
- **AI Processing:** Automated summary and title generation upon ingestion via OpenAI / LangChain.js.
- **RAG Q&A:** Vector embeddings stored in Qdrant DB for context-aware Q&A with document citations.
- **User Accounts:** JWT authentication & MongoDB database for user data and document management.
- **Frontend Stack:** React 19 (Vite), Zustand for global state, React Router, Tailwind CSS, Lucide icons, and Radix UI.
- **Future Roadmap:** Audio overview generation, multi-model selection (Claude, Llama), collaborative workspaces, and report export.

## Brand Commitments

- **Name:** Chithhi LM (NotebookLM Clone)
- **Voice & Tone:** Calm, scholarly, focused, intelligent, and trustworthy.
- **Visual Identity:** Modern minimalist studio aesthetic with clear visual hierarchy, polished typography, and smooth micro-interactions.

## Evidence on Hand

- **Live Demo:** [notebook-lm-clone-one.vercel.app](https://notebook-lm-clone-one.vercel.app/)
- **Repository Structure:** `/frontend` (Vite React app), `/backend` (Express, RAG server & Qdrant integration), `/assets` (UI screenshot).

## Product Principles

1. **Source Grounding:** All AI insights and responses must clearly relate to and cite the user's uploaded sources.
2. **Frictionless Ingestion:** Drag-and-drop file upload, link pasting, and text entry should yield instant AI summarization without unnecessary steps.
3. **Workspace Focus:** Keep sources, chat synthesis, and user notes harmoniously arranged for low cognitive load and focused deep work.
4. **Open & Modular:** Modular architecture allowing easy swaps of LLM providers, vector stores, and custom source parsers.

## Accessibility & Inclusion

- High contrast, legible typography for long reading sessions.
- Full keyboard navigation for source lists, modal dialogs, and message input.
- Responsive multi-column layout optimized for desktop and tablet screens.
