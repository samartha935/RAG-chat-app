---
name: Smart Document Analyzer RAG
overview: "Long-term master plan: full-stack RAG on Next.js 16 — PDF upload (size-capped), multi-conversation chat tied to signed-in users, pgvector + Gemini streaming, React PDF viewer, Google-only auth (Better Auth), per-user rate limits, TanStack Query for client/server-state fetches, React Hook Form for non-trivial forms. Presentation/portfolio scope, not a public production product."
todos:
  - id: meta
    content: "Treat this file as the north star; derive smaller implementation plans (per feature/week) from it"
    status: pending
  - id: prereqs
    content: "Prereqs: Docker (Postgres + pgvector + embedder), Gemini API key, Google OAuth client (for Better Auth)"
    status: pending
  - id: db-schema
    content: "Drizzle schema: Better Auth tables + RAG tables (pgvector); conversations.userId FK; optional usage table for rate limits"
    status: pending
  - id: auth
    content: "Better Auth + Google OAuth only — lib/auth, api/auth/[...all], client, middleware + API session checks"
    status: pending
  - id: embedder
    content: "python/embed.py + Dockerfile, build rag-embedder, lib/embedder.ts (docker run -i, promise queue)"
    status: pending
  - id: chunker
    content: "lib/chunker.ts — recursive character splitter (~512 chars, 50 overlap)"
    status: pending
  - id: upload-api
    content: "/api/upload with MAX_UPLOAD_BYTES (413 if over); FormData → pdf-parse → chunk → embed → DB; /api/documents/[convId]; /api/pdf/[filename]"
    status: pending
  - id: conversations-api
    content: "/api/conversations (GET/POST) and /api/conversations/[id] (PATCH/DELETE) — scoped by session userId"
    status: pending
  - id: chat-api
    content: "/api/chat — rate limit per user (RPM/RPD) then embed → pgvector search → Gemini stream + sources"
    status: pending
  - id: landing
    content: "Landing: hero, features, CTA; sign-in with Google entry point"
    status: pending
  - id: core-ui
    content: "QueryClientProvider; Sidebar + TanStack Query for conversations/docs; /chat/[id] layout; UploadZone (RHF if multi-field; size hint)"
    status: pending
  - id: chat-ui
    content: "ChatMessages (streaming + sources), PDFViewer (react-pdf + page nav); handle 401/429 gracefully"
    status: pending
  - id: polish
    content: "Dark mode, skeletons, toasts, HNSW index, VPS deploy + all env vars (auth, limits, uploads)"
    status: pending
isProject: false
---

# Smart Document Analyzer — RAG Master Plan

This document is the **long-term, project-level plan**: architecture, constraints, and build order. **Implementation should not try to do everything in one pass** — break work into **smaller plans or tickets** (e.g. “DB + auth only”, “upload pipeline”, “chat API”) derived from this file, then execute those step by step.

## Audience and scope

- **Primary use:** presentation, portfolio, cohort demo — a small number of trusted users (you, reviewers, classmates), not an open internet product.
- **Implication:** Prefer straightforward patterns (single VPS, Postgres-only rate counters, no Redis requirement) over multi-tenant production hardening, unless you explicitly decide to grow scope later.

---

## Client data fetching and forms

- **[TanStack Query](https://tanstack.com/query/latest)** (`@tanstack/react-query`): use for **REST-shaped** work — loading and caching conversation lists, document metadata, mutations (rename/delete conversation, upload completion + invalidation), and any other `fetch` to your `/api/*` routes. Wrap the app (or authenticated subtree) in **`QueryClientProvider`** in a small client provider component under `app/layout.tsx`.
- **[React Hook Form](https://react-hook-form.com/)** (`react-hook-form`): use when a form benefits from it — e.g. **rename conversation**, structured settings, or multi-field flows. Pair with **`zod`** via **`@hookform/resolvers`** when you already validate with Zod. Simple one-off controls (e.g. a single message input) can stay local state; **do not** add RHF everywhere by default.
- **Streaming chat:** `/api/chat` can keep **[Vercel AI SDK `useChat`](https://sdk.vercel.ai/docs)** from `ai/react` for stream handling; you can still use TanStack Query for everything else (sidebar, documents, uploads) so responsibilities stay clear.

---

## New npm dependencies (policy)

Libraries already named in this document (including TanStack Query, React Hook Form, and `@hookform/resolvers`) are **approved as part of the stack** when you reach the phase that needs them.

For **any other** package: **do not add it to `package.json` or install it without asking the project owner first** — propose the dependency, version, and reason, then wait for approval. Same rule applies before adding a new import from a package that is not yet installed.

---

## Prerequisites (before writing feature code)

- **Gemini API key**: [Google AI Studio](https://aistudio.google.com/app/apikey) — free tier is sufficient for demos; quotas are **per Google Cloud project / key** ([rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)).
- **Google OAuth (for Better Auth):** [Google Cloud Console](https://console.cloud.google.com/) — OAuth 2.0 Web client; redirect URIs e.g. `http://localhost:3000/api/auth/callback/google` and production `https://example.com/api/auth/callback/google` (replace host with your real HTTPS origin; path is always `/api/auth/callback/google`).
- **Docker** (local + VPS): [docker.com/get-started](https://www.docker.com/get-started) — Postgres + pgvector and the Python embedder image.
- **VPS** — covered in Day 7 / deployment section.

---

## Architecture

```mermaid
flowchart LR
  subgraph browser [Browser]
    Landing["Landing Page"]
    Chat["chat/[id]"]
  end
  subgraph nextjs [Next.js 16]
    AuthMW["middleware + session"]
    AuthAPI["/api/auth/*"]
    Upload["/api/upload"]
    ChatAPI["/api/chat"]
    Convs["/api/conversations"]
    Docs["/api/documents/[convId]"]
  end
  subgraph infra [Infrastructure]
    PG["PostgreSQL + pgvector"]
    PyProc["embed.py Docker fastembed"]
    Gemini["Gemini API"]
  end

  Landing --> AuthMW
  Chat --> AuthMW
  AuthMW --> AuthAPI
  Chat -->|"POST multipart"| Upload
  Chat -->|"POST stream"| ChatAPI
  Upload --> PyProc
  Upload --> PG
  ChatAPI -->|"rate limit check"| PG
  ChatAPI --> PyProc
  ChatAPI --> PG
  ChatAPI --> Gemini
```

**Request path (conceptual):** Browser → **auth gate** (middleware + route session check) → API handlers → Postgres / embedder / Gemini.

### Infrastructure: Local vs VPS

| Layer | Local Dev | VPS (2GB RAM / 2vCPU) |
|---|---|---|
| PostgreSQL + pgvector | Docker (docker-compose) | Docker (same compose file) |
| Python embedder | Docker image `rag-embedder` as child process | Same |
| Next.js | `pnpm dev` | PM2 (`pnpm build && pnpm start`) |
| Reverse proxy | — | Nginx |

**Why Docker child process for embeddings?** Node spawns `docker run -i --rm rag-embedder`; stdin/stdout pipe to Python. No extra HTTP server or open embedder port. To scale later, only `embedder.ts` would change (e.g. HTTP sidecar).

**VPS memory budget (rough):** Postgres ~200–350MB, Next ~150–300MB, embedder container ~150–200MB, Nginx ~15MB — comfortable on 2GB for demo traffic.

---

## Authentication and authorization

### Requirements

- **Sign-in:** **Google OAuth only** — no email/password or other social providers for this project.
- **Library:** **[Better Auth](https://www.better-auth.com/)** with **[Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)** on the **same Postgres** as RAG data.
- **Data ownership:** RAG entities that represent a user’s workspace (e.g. **conversations**) must include **`userId`** (FK to Better Auth `user.id`). List/create/patch/delete APIs must scope by the authenticated user.
- **Protection:** **`src/middleware.ts`** — protect `/chat/*` and `/api/*` except `/api/auth/*`. **Defense in depth:** each sensitive handler also resolves session (e.g. `auth.api.getSession({ headers })`) and returns **401** if absent.

### Files (add to repo layout)

- `src/lib/auth.ts` — `betterAuth({ ... database: drizzleAdapter(...), socialProviders: { google: { clientId, clientSecret } } })`
- `src/app/api/auth/[...all]/route.ts` — `toNextJsHandler(auth)` from `better-auth/next-js`
- `src/lib/auth-client.ts` — `createAuthClient` from `better-auth/react` for `signIn.social({ provider: "google" })` / sign-out
- Optional minimal **`/login`** or landing CTA only — no alternate credential flows

### Env

- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (public app URL), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

---

## Per-user rate limiting (Gemini free tier)

### Problem

Gemini **free-tier limits apply to the API key / project**, not to individual browser users. Without app-level limits, **one signed-in user could consume most RPM/RPD** and hit 429s for everyone else sharing the same key.

### Approach (fits presentation scope)

- **Postgres-backed** counters per `userId` (no Redis required): e.g. **requests per minute** and **requests per day** for calls that invoke Gemini (`POST /api/chat`).
- Before `streamText` / Gemini: increment or check in a transaction; if over cap → **429** + clear JSON message (optional `Retry-After` for the minute window).
- **Configurable env** (defaults conservative for a handful of demo accounts):
  - `GEMINI_MODEL` — must match the model whose [official limits](https://ai.google.dev/gemini-api/docs/rate-limits) you read.
  - `RATE_LIMIT_CHAT_RPM_PER_USER` — keep aggregate usage under project RPM (e.g. if project allows 10 RPM and you expect ≤3 active users, ~2–3 RPM per user is a sane starting band; **tune from Google’s table**).
  - `RATE_LIMIT_CHAT_RPD_PER_USER` — same idea for **daily** request caps (**RPD**).
- **Optional later:** soft limits on uploads per user per day (protects CPU/embedder RAM, not Gemini quota). Token-level TPM limits are optional and heavier; RPM/RPD on chat is enough for most demos.

### Implementation sketch

- `src/lib/rate-limit.ts` — check/increment using a small `usage` or bucket table, or fixed window columns updated atomically.

---

## PDF upload size limit

- **Env:** `MAX_UPLOAD_BYTES` (or `MAX_PDF_MB` converted to bytes). Suggested default **5–10 MB** for demos — keeps RAM predictable when parsing with `pdf-parse` on a small VPS.
- **Server:** In `/api/upload`, reject before heavy work if `file.size > MAX_UPLOAD_BYTES` → **413 Payload Too Large**.
- **Client:** `UploadZone` should show the same cap (disable or warn before upload).

---

## File structure (target)

```
src/
├── middleware.ts                    ← session gate for /chat, /api (except /api/auth)
├── app/
│   ├── page.tsx                     ← landing (+ sign-in CTA)
│   ├── login/page.tsx               ← optional minimal Google-only page
│   ├── chat/[id]/page.tsx
│   └── api/
│       ├── auth/[...all]/route.ts   ← Better Auth handler
│       ├── conversations/...
│       ├── conversations/[id]/...
│       ├── upload/route.ts
│       ├── chat/route.ts
│       ├── documents/[convId]/route.ts
│       └── pdf/[filename]/route.ts
├── lib/
│   ├── auth.ts
│   ├── auth-client.ts
│   ├── rate-limit.ts
│   ├── db/
│   │   ├── schema.ts                ← Better Auth + RAG + usage if needed
│   │   └── index.ts
│   ├── embedder.ts
│   └── chunker.ts
├── components/
│   ├── Sidebar.tsx
│   ├── ChatMessages.tsx
│   ├── MessageInput.tsx
│   ├── PDFViewer.tsx
│   └── UploadZone.tsx
├── uploads/
├── docker-compose.yml
└── python/
    ├── embed.py
    ├── Dockerfile
    └── requirements.txt
```

---

## Key technical decisions (summary)

### Python embedder (Docker child process)

`embed.py` in container, long-lived `docker run -i` from Node, **fastembed** + MiniLM L6 v2 → **384-dim** vectors; queue in `embedder.ts`.

### PostgreSQL

`pgvector/pgvector:pg17` via docker-compose; same DB for Better Auth + RAG + rate-limit rows.

### Database schema (Drizzle + pgvector)

- **Better Auth** tables (per upstream + Drizzle plugin): e.g. user, session, account, verification — **do not hand-roll incompatible shapes**; generate or copy from [Better Auth Drizzle docs](https://www.better-auth.com/docs/adapters/drizzle).
- **RAG tables:** documents, chunks (`vector(384)`), conversations, messages (exact names can match your implementation plan) — all **owned** where applicable via **`userId`** on conversations (and document linkage as designed).
- **Indexes:** HNSW (or equivalent) on `chunks.embedding` after bulk load for ANN search.

### Next.js 16

- Route `params` is a **Promise**; `cookies()` / `headers()` are **async**; prefer Web `Request`/`Response` in route handlers.

### Streaming chat

`@ai-sdk/google` + `streamText` from `ai`; **after** rate-limit check, stream response; frontend `useChat` from `ai/react` where applicable.

### PDF serving

Saved files under `uploads/`; `/api/pdf/[filename]` streams to **react-pdf** (authorize: same user as document owner).

---

## Day-by-day build order (suggested sequencing)

Use this as **order of dependencies**, not a single sprint mandate. **Auth and schema land early** so APIs never ship without `userId` scoping.

**Day 1 — Environment + DB + auth foundation**

- Docker + `docker-compose up -d`; Gemini + Google OAuth credentials in hand
- Drizzle + `drizzle.config.ts`; schema = **Better Auth + RAG + rate usage**; migrations
- `.env.local`: `DATABASE_URL`, `GEMINI_API_KEY`, Better Auth + Google vars, `MAX_UPLOAD_BYTES`, rate limit vars
- `lib/auth.ts`, `app/api/auth/[...all]/route.ts`, `middleware.ts` smoke-test (sign-in redirects)

**Day 2 — Embedder + chunker**

- `python/*`, `docker build -t rag-embedder ./python`, `lib/embedder.ts`, `lib/chunker.ts`

**Day 3 — Upload API**

- `pdf-parse`; upload route with **413** over size cap; documents + pdf routes (**authz** on pdf)

**Day 4 — Conversations + chat API**

- Conversations CRUD **scoped by userId**
- `ai` + `@ai-sdk/google`; **`lib/rate-limit.ts`** in `/api/chat` before Gemini; stream + sources metadata

**Day 5 — Core UI**

- **UI primitives:** [shadcn/ui](https://ui.shadcn.com/) (CLI + `components.json`; components under `src/components/ui/`). Add more with `pnpm dlx shadcn@latest add <name>`.
- Add **`@tanstack/react-query`** + **`QueryClientProvider`**; **`react-hook-form`** (and **`@hookform/resolvers`** if using Zod on forms) when building rename/settings-style forms
- `react-pdf` dependency; landing + **Google sign-in**; Sidebar (conversation list via **useQuery** / mutations); `/chat/[id]` layout

**Day 6 — Chat UI + PDF viewer**

- UploadZone (size hint); ChatMessages; PDFViewer + citation jump

**Day 7 — Polish + deploy**

- Dark mode, skeletons, toasts; HNSW; VPS: Docker, embedder image, PM2, Nginx; **all env vars** (auth, limits, uploads)
- README / env example aligned with this doc

---

## Dependencies to install

Install **only when implementing** the relevant slice; **anything not listed here** requires owner approval before `pnpm add` (see [New npm dependencies (policy)](#new-npm-dependencies-policy)).

```bash
# Node (RAG + chat + UI)
pnpm add drizzle-orm postgres \
         better-auth \
         pdf-parse \
         react-pdf \
         ai @ai-sdk/google \
         zod uuid \
         @tanstack/react-query \
         react-hook-form \
         @hookform/resolvers

pnpm add -D drizzle-kit @types/pdf-parse @types/uuid

# Python (inside Docker only)
# python/requirements.txt: fastembed (pinned)
# docker build -t rag-embedder ./python
```

> No `multer` — use `request.formData()` in Route Handlers. Optional: `@tanstack/react-query-devtools` in development only — **ask before adding** if not pre-approved.

---

## Environment variables (reference)

```bash
# Database
DATABASE_URL=postgresql://rag_user:rag_pass@localhost:5432/rag_db

# Gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash   # example; match AI Studio + rate-limit docs

# Uploads
UPLOAD_DIR=./uploads
MAX_UPLOAD_BYTES=10485760       # e.g. 10 MiB; tune down for 2GB VPS

# Better Auth + Google OAuth
BETTER_AUTH_SECRET=             # random secret
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Per-user Gemini usage (tune using https://ai.google.dev/gemini-api/docs/rate-limits )
RATE_LIMIT_CHAT_RPM_PER_USER=3
RATE_LIMIT_CHAT_RPD_PER_USER=40

# VPS: set the same via PM2 ecosystem or shell; use HTTPS URL for BETTER_AUTH_URL in prod
```

---

## Smaller plans during implementation

When starting a slice of work, **copy the relevant bullets** from this doc into a ticket or short markdown plan (e.g. `.cursor/plans/…` or your issue tracker), **narrow scope to one vertical** (auth only, upload only, chat only), and link back here so global constraints (auth, limits, PDF cap, TanStack Query / RHF usage, **ask-before-new-deps**) stay consistent.
