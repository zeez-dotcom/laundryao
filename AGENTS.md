# Repository Guidelines

## Project Structure & Module Organization
- `server/`: Express + TypeScript API (`index.ts`, `routes.ts`, db access in `db/`).
- `client/`: React + Vite frontend (`src/` components, pages, hooks).
- `shared/`: Cross‑shared schemas/types (Drizzle schema in `schema.ts`).
- `migrations/`: Drizzle SQL migrations; generated from `shared/schema.ts`.
- `docs/`: Product docs and SRS (`docs/SRS.md`).
- `scripts/`, `githooks/`, config at repo root (`tsconfig.json`, `vite.config.ts`, `drizzle.config.ts`).

## Build, Test, and Development Commands
- Install: `npm install`
- Dev (API + Vite): `npm run dev` (loads `.env`, serves client via Vite middleware on `PORT`, default 5000).
- Type check: `npm run check`
- Build: `npm run build` (compile TS); start prod server with `npm start`.
- Tests: `npm test` (Vitest for client; Node test runner + tsx for server).
- DB: `npm run db:migrate`, `npm run db:generate`, `npm run db:studio` (requires `DATABASE_URL`).

## Coding Style & Naming Conventions
- Language: TypeScript (ESM). Strict mode enabled.
- Indentation: 2 spaces; prefer descriptive names.
- Paths: use aliases `@/*` (client) and `@shared/*` (shared).
- Files: React components in `client/src/components` use kebab‑case or `PascalCase.tsx`; tests as `*.test.ts(x)`.

## Testing Guidelines
- Frameworks: Vitest (+ jsdom) for client; Node built‑in test runner with `supertest` for server routes.
- Place tests near implementation (see `server/*.test.ts`, `client/src/**/*.test.tsx`).
- Run locally with `npm test`; write deterministic tests and cover edge cases for routes and forms.

## Commit & Pull Request Guidelines
- Commits: keep focused; prefer Conventional Commits (`feat:`, `fix:`, `docs:`).
- PRs: include a clear description, linked issues, and screenshots for UI.
- SRS sync: when changing routes/models/features, update `docs/SRS.md` and run `npm run validate:srs`.
- Optional git hook: `git config core.hooksPath githooks` (runs SRS validation on commit).

## Docker & Local DB
- Start Postgres: `docker-compose up -d db`
- Example `DATABASE_URL`: `postgres://postgres:postgres@localhost:5432/flutterpos`
- Prepare DB then run dev: `npm run db:prepare && npm run dev`

## CI Tips (GitHub Actions)
- Use Node 20 and a Postgres service; set `DATABASE_URL` env.
- Run: `npm ci`, `npm run check`, `npm run db:migrate:ci`, `npm run validate:srs`, `npm test`.
- Minimal workflow snippet:
  - `.github/workflows/ci.yml`
  - steps: checkout → setup-node@v4 → cache npm → `npm ci` → start postgres → run scripts above.

## Security & Configuration
- Required env: `DATABASE_URL` (Postgres). Optional: `PORT` (default 5000), `HOST`.
- Drizzle reads `.env`; migrations live in `migrations/`.
- Never commit secrets; use env vars or secret stores.
