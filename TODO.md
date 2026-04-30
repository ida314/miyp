# Monk in Your Pocket — MVP TODO

_Based on design doc. Updated: 2026-04-28_

## Status legend
- [x] Done
- [ ] Not started / in progress

---

## Completed

- [x] Core 7-step workflow pipeline: safety → parse → classify → retrieve → rerank → plan → write
- [x] All core TypeScript types (AdviceUnit, ParsedQuery, ResponsePlan, ChatResponse, labels)
- [x] POST /chat/respond API endpoint
- [x] Safety check module with crisis keyword detection and redirect
- [x] In-memory adviceStore with label + text word-overlap search
- [x] AN5 ingestion pipeline: fetch from SuttaCentral, LLM extraction, validate, run.ts orchestrator
- [x] Seed advice units (data/seed-advice-units.json) — small set, anger/metta focus
- [x] Promptfoo eval framework with 10 parser test cases
- [x] Two parser prompt variants (v1 chain-of-thought, v2 direct)
- [x] OpenAI LLM utility with JSON mode support
- [x] Logger utility with component namespacing
- [x] Buddhist label ontology with CANONICAL_MAPPINGS second-layer structure
- [x] Express server setup with health check
- [x] Intent gate in parser: `query_type` field (`guidance | meta | greeting | off_topic`); non-guidance queries short-circuit before retrieval with static responses; regex fast-path for obvious greetings/meta
- [x] Hero page (`public/index.html`) — animated dharma wheel with 8 orbiting category labels, how-it-works, sutta quote, category grid, CTA
- [x] About page (`public/about.html`) — project story, corpus table, limitations
- [x] Blog (Markdown files in `content/blog/`, server-rendered via `src/api/blogRoute.ts` + `marked`)
- [x] Shared CSS design system (`public/css/site.css`) — Cormorant Garamond, saffron/ivory palette, nav, footer, animations
- [x] Chat UI moved to `/chat.html` with new nav
- [x] Streaming chat responses via `POST /chat/stream` (SSE) — status events during pipeline, token-by-token writer output; `/chat/respond` retained for non-streaming use
- [x] `callLLMStream()` added to `src/utils/llm.ts`; `writeResponseStream()` added to `src/core/writer/writer.ts`; `handleChatStream()` added to `src/core/handleChat.ts`

---

## TODO

### 1. Retrieval — Vector Embeddings (Core Architectural Bet)
The design doc specifies semantic similarity over embeddings of normalized fields.
Currently `searchByText` uses word overlap — this will miss paraphrase matches and degrade
retrieval quality when corpus grows.

- [x] Add `embedText()` to `src/utils/llm.ts` using `text-embedding-3-small`
- [x] Add `searchBySemantic()` to `src/db/adviceStore.ts` using cosine similarity
- [x] Add embedding sidecar support to adviceStore (`data/embeddings.json`)
- [x] Update `src/core/retrival/retriveAdvice.ts` to use semantic search (async)
- [x] Update `pipeline/ingest/extractAdviceUnits.ts` to compute + persist embeddings per unit
- [ ] Compute embeddings for the 18 seed units in `data/seed-advice-units.json` (currently only pipeline-generated units have embeddings)

### 2. Corpus Coverage
The pipeline infrastructure only covers AN5. Design doc requires AN, MN, selected SN.

- [x] Add MN corpus support to ingestion (`pipeline/ingest/fetchMN.ts`, `--corpus mn` flag in run.ts)
- [x] Run AN5 vagga-01 (Powers of a Trainee) and vagga-06 (Hindrances) as test runs — 17 units, all valid, embeddings generated
- [ ] Run remaining AN5 vaggas to populate full corpus (26 vaggas total, 2 done)
- [ ] Run MN fetch + extract pipeline
- [ ] Add selected SN vaggas (SN 35, SN 46, SN 47 — hindrances, bojjhangas, satipaṭṭhāna)
- [ ] Expand seed units to cover all 8 problem categories (currently only anger/metta)

### 3. Missing API Endpoints (Design Doc §3.9)
- [x] POST /ingest/advice-units — write validated AdviceUnits into storage (`src/api/ingestRoute.ts`)
- [x] GET /eval/run — run benchmark prompts against current retrieval + response stack (`src/api/evalRoute.ts`)

### 4. User-Facing Chat UI
- [x] Basic HTML/JS chat interface (`public/chat.html`)
- [x] Source citation display in UI (citations shown in `.meta` block below each response)
- [ ] Diagnostic label display (optional debug view toggle)
- [ ] Mobile-friendly nav (hamburger menu for small screens)

### 5. Evaluation — Expand Beyond Parser
Design doc requires 100-200 prompts, full pipeline scoring, and baseline comparison.

- [ ] Add full chat pipeline tests to `promptfooconfig.yaml` (currently only parser)
- [ ] Add scoring assertions for: groundedness, practicality, doctrinal alignment, tone, safety
- [ ] Add baseline comparison tests (raw LLM no-RAG vs raw text RAG vs structured RAG)
- [ ] Expand from 10 test cases to 50+ covering all 8 problem categories
- [ ] Add regression tests for safety redirect (crisis, medical, self-harm)

### 6. Observability / Feedback
Design doc §5.3 requires logging parsed labels, retrieved units, chosen sources, answer plan, safety flags, user feedback.

- [ ] Structured request/response logging per session (currently console-only)
- [x] POST /feedback endpoint — thumbs up/down in chat UI; logs session_id, rating, diagnostic_labels, citations, response_index to stdout (Railway) + data/feedback.jsonl (local). No message content stored.
- [ ] Log sink to external service (stdout captured by Railway logs; file is ephemeral without a volume)

### 7. Infrastructure
- [ ] Postgres for AdviceUnit storage (currently in-memory JSON load only)
- [ ] pgvector or Qdrant for vector index (currently in-memory cosine similarity)
- [ ] Object storage for raw sutta text files (currently local disk only)

### 9. Deployment & Abuse Protection
Required before any public access:

- [x] Set OpenAI monthly spend cap in dashboard
- [x] `express-rate-limit` middleware on `/chat` — burst limiter (10 req/min) + daily limiter (100 req/day), both IP-based. Defaults overridable via `RATE_LIMIT_PER_MIN` and `RATE_LIMIT_PER_DAY` env vars. Applied to both `/chat/respond` and `/chat/stream`.
- [x] Message length cap in `chatRoute.ts` — 1,000 chars by default, overridable via `MAX_MESSAGE_LENGTH` env var
- [x] CORS middleware in `src/index.ts` — reads `CORS_ORIGIN` env var; set to production domain to restrict API access, unset in dev allows all origins
- [x] Graceful shutdown — SIGTERM/SIGINT handlers in `src/index.ts`; allows in-flight requests to finish (10s timeout before force exit)
- [x] Production build — `tsconfig.build.json` compiles `src/` only to `dist/`; `npm start` runs `node dist/index.js` (no tsx at runtime); `npm run build` uses build config
- [x] `Dockerfile` — multi-stage build; runner image installs prod deps only, copies `dist/`, `public/`, `content/`, `data/`
- [x] `.gitignore` — covers `node_modules/`, `dist/`, `data/sources/`, `.DS_Store`
- [x] `trust proxy` set in `src/index.ts` — fixes rate-limit IP detection behind Railway's proxy
- [x] Password gate — `SITE_PASSWORD` env var enables cookie-based gate at `/access` before any page loads
- [ ] Email-based authentication with per-user monthly request quota (required for public launch)

### 8. Tests
The `tests/` directory is empty.

- [ ] Unit tests for classifier (label normalization, inference)
- [ ] Unit tests for reranker (scoring logic)
- [ ] Unit tests for safety check (keyword detection, edge cases)
- [ ] Integration test for full handleChat pipeline (mock LLM calls)

---

## Phase Mapping

| Phase | Status |
|-------|--------|
| Phase 1: Offline prototype (ingest AN+MN, build eval set, test structured vs raw RAG) | Pipeline built and tested (2/26 AN5 vaggas ingested, 35 total units) |
| Phase 2: Internal MVP (chat UI, human review, logging, feedback) | Frontend complete (hero, about, blog, chat); logging + feedback still TODO |
| Phase 3: Public beta (safety polish, citation UX, corpus expansion) | Not started |
