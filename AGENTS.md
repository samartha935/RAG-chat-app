<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

For Smart Document Analyzer scope, read **`docs/RAG-BUILD-PLAN.md`** — the long-term master plan (RAG, Postgres/pgvector, Docker embedder, Gemini, **Better Auth + Google OAuth only**, **per-user Gemini-aligned rate limits**, **max PDF upload size**, **TanStack Query** for REST-style API state, **React Hook Form** where forms warrant it, presentation-oriented scope). Implementation work should be split into smaller plans derived from that file, not executed as one undifferentiated blob.

**UI components:** Use **[shadcn/ui](https://ui.shadcn.com/)** for interactive UI (installed via the shadcn CLI; config in `components.json`; primitives under `src/components/ui/`). Add new blocks with `pnpm dlx shadcn@latest add <component>` unless the build plan names something else.

**Dependencies:** Do **not** run `pnpm add` or introduce a new npm package (or add imports from an uninstalled package) unless it is already listed in `package.json` or explicitly named in `docs/RAG-BUILD-PLAN.md`. Otherwise **ask the user for approval first** (name, version, reason).
