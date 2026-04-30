# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Monk in Your Pocket** is an AI-powered Buddhist guidance chatbot. It maps user problems to Buddhist diagnostic categories, retrieves structured advice units from a curated early-Buddhist corpus (AN, MN, SN), and synthesizes practical, compassionate responses grounded in source texts.

## Commands

```bash
npm run dev           # Start dev server with auto-reload (tsx watch)
npm start             # Production start (requires npm run build first)
npm run build         # Compile src/ → dist/ via tsconfig.build.json
npm run typecheck     # Type-check without emitting (covers src/ + pipeline/)

npm run eval          # Run promptfoo evaluation suite
npm run eval:view     # Open web UI for eval results

npm run ingest        # Run full ingestion pipeline
npm run ingest:fetch  # Fetch suttas only (no LLM calls)
npm run ingest:dry-run # Parse and validate without LLM calls
```

Ingestion pipeline also accepts CLI flags directly:
```bash
npx tsx pipeline/ingest/run.ts [--corpus an5|mn] [--vagga N] [--model gpt-4o|gpt-4o-mini] [--dry-run] [--fetch-only] [--skip-existing]
```

There is no separate lint or unit test runner — `npm run typecheck` and `npm run eval` are the primary verification steps.

## Architecture

### Chat Workflow

Two endpoints share the same pipeline via `src/core/handleChat.ts`:
- **`POST /chat/respond`** — Returns a single JSON `ChatResponse` when complete
- **`POST /chat/stream`** — Server-sent events; emits `status`, `token`, and `done` events as the pipeline runs

Non-guidance queries short-circuit before retrieval:

1. **Safety Check** — Regex pre-filter for crisis keywords; redirects immediately before any LLM call
2. **Parser** — LLM extracts `query_type` (`guidance | meta | greeting | off_topic`), plus `user_situation`, `emotion_labels`, `buddhist_labels`, `urgency`, `intent`, `tone_needed`. Obvious greetings and meta questions are short-circuited via regex with no LLM call at all.
3. **Intent branch** — `meta`, `greeting`, and `off_topic` queries return static responses here. Only `guidance` continues.
4. **Classifier** — Validates labels against the ontology, detects crisis indicators
5. **Retriever** — Dual strategy: label-based metadata search + cosine similarity over precomputed embeddings
6. **Reranker** — Scores candidates: label match (40%), confidence (20%), human review status (15%), text relevance (25%)
7. **Planner** — LLM selects 1-3 source references and 2-4 key teaching points grounded in retrieved units
8. **Writer** — LLM generates 150–300 word response (streaming: `writeResponseStream()` emits tokens as they arrive)

### Core Data Model: AdviceUnit

Defined in `src/types/adviceUnit.ts`. The central abstraction — a normalized, structured summary of a canonical passage:

```typescript
{
  id: "au_000123",
  source_collection: "AN" | "MN" | "SN",
  source_ref: "AN 5.57",
  canonical_passage: string,   // Original text
  problem_summary: string,     // Modern problem description
  buddhist_labels: string[],   // 1–3 labels from the label ontology
  diagnosis: string,           // Buddhist interpretation
  teaching: string,            // Key doctrine
  practice_actions: string[],  // 1–3 actionable steps
  audience: "lay" | "monastic" | "general",
  confidence: number,          // 0.0–1.0 extraction confidence
  review_status: "auto" | "human_reviewed" | "flagged"
}
```

### Label Ontology (`src/types/labels.ts`)

**10 Buddhist labels**: `craving_attachment`, `aversion_anger`, `delusion_confusion`, `grief_loss`, `fear_anxiety`, `restlessness_distraction`, `doubt_indecision`, `ethical_conflict`, `speech_relationships`, `discipline_habit_formation`

**20 emotion labels** map user language (anger, anxiety, loneliness, etc.) to Buddhist categories.

### Storage (Current)

- Advice units loaded at startup from `data/seed-advice-units.json` (18 units) and `data/generated/{an5,mn,sn}/*.json`
- Currently ingested: AN5 vagga-01 (9 units) and vagga-06 (8 units) — 35 total units across seed + generated
- Embeddings stored in `data/embeddings.json` (precomputed, text-embedding-3-small) — 17 embeddings covering pipeline-generated units; seed units do not yet have embeddings
- No database — all in-memory. Design doc (`design_doc.txt`) specifies Postgres + pgvector for production

### LLM Utilities (`src/utils/llm.ts`)

- `callLLM()` — system + user prompt → text (temperature 0.3–0.5)
- `callLLMStream()` — same but streams tokens via `onToken` callback; returns full text
- `callLLMJson()` — enforces JSON mode for structured extraction
- `embedText()` — generates embeddings (sliced to 8000 chars)
- gpt-4o for reasoning steps, gpt-4o-mini for faster inference

### Ingestion Pipeline (`pipeline/ingest/`)

Processes raw suttas from SuttaCentral API into AdviceUnits:
1. **Fetch** (`fetchSuttas.ts`, `fetchMN.ts`) — retrieve and store raw suttas locally
2. **Extract** (`extractAdviceUnits.ts`) — LLM converts passages to AdviceUnit schema
3. **Validate** (`validate.ts`) — rejection gates on vagueness, missing fields, invented practices, label inconsistency

AN5 (26 vaggas, 242 units) and MN (15 vaggas, 227 units) are fully ingested. SN is planned.

## Frontend Pages

All static pages are in `public/`. Blog posts are server-rendered via `src/api/blogRoute.ts`.

| URL | File | Notes |
|-----|------|-------|
| `/` | `public/index.html` | Hero page with animated dharma wheel, 8 category orbit labels, how-it-works, sutta quote, category grid |
| `/chat.html` | `public/chat.html` | Chat UI with streaming responses and thumbs up/down feedback buttons |
| `/about.html` | `public/about.html` | Project story, corpus table, retrieval architecture, limitations |
| `/donate.html` | `public/donate.html` | Dana model explanation, Ko-fi support button (ID: C1C31YNF32) |
| `/access` | `src/index.ts` | Password gate — served when `SITE_PASSWORD` env var is set |
| `/blog` | `src/api/blogRoute.ts` | Post listing, server-rendered |
| `/blog/:slug` | `src/api/blogRoute.ts` | Individual post, Markdown rendered via `marked` |

Blog posts are Markdown files in `content/blog/*.md` with YAML-ish frontmatter (`title`, `date`, `excerpt`). Drop a new `.md` file and it appears automatically, sorted by date.

Shared CSS design system is at `public/css/site.css` — imports Cormorant Garamond from Google Fonts, defines CSS custom properties for the warm saffron/ivory/brown palette used across all pages.

## Environment

`.env` requires:
```
OPENAI_API_KEY=sk-...
PORT=3000
```

Optional env vars (all have defaults):
```
CORS_ORIGIN=https://example.com  # Restrict API to this origin in production (default: * / all)
RATE_LIMIT_PER_MIN=10            # Max chat requests per IP per minute (default: 10)
RATE_LIMIT_PER_DAY=100           # Max chat requests per IP per day (default: 100)
MAX_MESSAGE_LENGTH=1000          # Max message length in characters (default: 1000)
LOG_LEVEL=info                   # debug | info | warn | error (default: info)
SITE_PASSWORD=secret             # Enables password gate at /access (default: disabled)
```

## Feedback

`POST /feedback` (`src/api/feedbackRoute.ts`) accepts thumbs up/down ratings from the chat UI.

**Data stored per record** (no message content — by design):
```
timestamp, session_id, rating (up|down), diagnostic_labels, citations, response_index
```

Records are logged to stdout (captured by Railway) and appended to `data/feedback.jsonl` locally. The file is ephemeral in production without a persistent volume — stdout is the durable record.

**Ethical principle**: user messages contain sensitive personal disclosures. Only signals derived from the pipeline (labels, citations, rating) are stored, never the content itself.

Rate limiting applies to all `/chat/*` routes (both `/chat/respond` and `/chat/stream`). Static pages, blog, and health check are unrestricted.

## Deployment

**Build for production:**
```bash
npm run build   # Compiles src/ → dist/ using tsconfig.build.json
npm start       # Runs node dist/index.js
```

**Docker:**
```bash
docker build -t minp .
docker run -p 3000:3000 --env-file .env minp
```

`tsconfig.build.json` compiles `src/` only (excludes pipeline tooling) with `rootDir: "./src"` so output lands at `dist/index.js`. The base `tsconfig.json` still covers `src/` + `pipeline/` for `npm run typecheck` and IDE support. `data/sources/` (raw fetched suttas) is excluded from both `.gitignore` and `.dockerignore` — it's large and regenerable via the ingestion pipeline.

## Evaluation

`promptfooconfig.yaml` defines the eval suite. Currently 10 parser test cases. Run `npm run eval` then `npm run eval:view` to inspect results.
