# Project briefing

This repository holds two unrelated things:

- `backend/`, `frontend/`, `Jenkinsfile`, root `docker-compose.yml`: an old task-manager practice app. Leave it alone unless asked.
- **`relay/`: Relay Studio**, the app all current work is about. Read `relay/README.md` first.

## Relay Studio in one paragraph

A self-hosted, single-user app that publishes one video to YouTube, Instagram and Facebook Pages, with scheduling, a library, analytics, hour-by-hour performance tracking, comments, and an AI assistant. TypeScript throughout: React 19 + Vite + Tailwind 4 in `relay/src/web`, Fastify 5 + Drizzle + SQLite in `relay/src/server`, rules shared by both in `relay/src/shared`. One process, one port. Data (database, uploaded videos, encryption key) lives in `relay/data`, or the `relay_relay_data` Docker volume on a server.

## Working on it

Run these inside `relay/`:

- `npm run typecheck`, `npm test`, `npm run build` must all pass before a commit.
- Database changes: edit `src/server/db/schema.ts`, then `npx drizzle-kit generate`. Migrations apply automatically on start.
- Platform API code is in `src/server/platforms/`. Real uploads to YouTube and Instagram have worked; most other calls have only been tested against stubs, so expect to fix things on first real use and report the platform's actual error text.
- Work on the branch `claude/sleepy-keller-cr8cgd`. Commit and push finished changes so the repository stays the single source.

## How the owner runs it

- **On their Mac**: as a background service. `relay/relay.sh start|stop|update|status|logs`, or the double-click files in `relay/mac/`. Logs are in `relay/logs/`. Address: `http://localhost:5173`.
- **On a server**: `relay/server.sh setup|start|stop|update|status|logs|backup` (Docker, with Caddy for HTTPS). Needs `DOMAIN`, `PUBLIC_URL` and `APP_PASSWORD` in the server's `.env`.

The Mac copy and the server copy have separate data and do not sync.

## Rules that matter here

- **Secrets never go in git or in chat output**: `.env` files, `terraform.tfstate`, `*.tfvars` holding secrets, server login keys (`*.pem`), the app password. Check `.gitignore` covers them before committing.
- **Cloud resources cost the owner money.** They have a small fixed AWS credit. Before creating anything, check what already exists (`terraform state list`, and the AWS account itself) and state the monthly cost. Never create a second server by accident. Ask before any step that creates or resizes paid resources.
- **The assistant inside the app must ask before publishing or replying.** That approval step is deliberate (comment text is untrusted input). Do not remove it.
- The owner is not a developer. Explain in plain words, give exact commands one at a time, and say clearly what was tested and what was not.
