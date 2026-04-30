# Monk in Your Pocket

An AI-powered Buddhist guidance chatbot. Maps user problems to Buddhist diagnostic categories, retrieves structured advice from early Buddhist texts (AN, MN, SN), and synthesizes compassionate, source-grounded responses.

## Features

- Conversational guidance rooted in the Pali Canon
- Streaming and non-streaming chat endpoints
- Safety check for crisis keywords with immediate redirection
- Label-based retrieval + cosine similarity over precomputed embeddings
- Thumbs up/down feedback (no message content stored — by design)
- Password-gated access via `SITE_PASSWORD` env var
- Blog with Markdown posts

## Setup

```bash
npm install
cp .env.example .env   # fill in OPENAI_API_KEY
npm run dev
```

## Commands

```bash
npm run dev        # Dev server with auto-reload
npm run build      # Compile src/ → dist/
npm start          # Production server
npm run typecheck  # Type-check src/ + pipeline/
npm run eval       # Run eval suite
```

## Environment

```
OPENAI_API_KEY=sk-...   # required
PORT=3000               # default 3000
SITE_PASSWORD=secret    # enables /access password gate (optional)
```

## Deployment

Built for Railway. Docker image available:

```bash
docker build -t minp .
docker run -p 3000:3000 --env-file .env minp
```

## License

MIT
