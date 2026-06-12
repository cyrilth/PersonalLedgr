# Deployment — ud-web-host.local (Docker Compose)

PersonalLedgr runs in Docker on `ud-web-host.local` (Ubuntu 26.04) using the
repo's `docker-compose.yml` — the same three-container setup as local development.
SSH access: `ssh sysadmin@ud-web-host.local` (key-based, no password).

## Infrastructure Stack

| Layer | Technology |
|---|---|
| OS | Ubuntu 26.04 LTS (x86_64) |
| Container runtime | Docker 29 + Docker Compose v5 (daemon enabled at boot) |
| Database | `db` container — postgres:18.1-alpine, data in the `pgdata` named volume |
| App server | `app` container — Next.js standalone build, published on host port **3000** |
| Background jobs | `cron` container — node-cron worker (`tsx cron/src/index.ts`) |
| Upstream TLS | `caddy` container (server-only, via `docker-compose.override.yml`) — terminates HTTPS on host port **3000**, proxies to the app container |
| Restart policy | `restart: unless-stopped` on all containers (auto-start on boot, auto-restart on crash) |
| Deployments | git pull from GitHub over SSH + deploy script (rebuild images, restart containers) |
| Reverse proxy / TLS | Nginx Proxy Manager (separate machine): `https://pl.ct-home.net` → `https://192.168.1.30:3000` |

Nothing runs natively on the host — no Node, no pnpm, no PostgreSQL. The only
host-level dependencies are Docker and git.

## Server Layout

| What | Where |
|---|---|
| App checkout (clone of `git@github.com:cyrilth/PersonalLedgr.git`) | `/home/sysadmin/apps/PersonalLedgr` |
| Environment file (secrets — never commit) | `/home/sysadmin/apps/PersonalLedgr/.env` |
| Caddy TLS sidecar (server-only, git-excluded) | `docker-compose.override.yml`, `caddy/Caddyfile`, `caddy/certs/` in the app checkout |
| Deploy script | `/home/sysadmin/apps/deploy-personalledgr.sh` |
| DB password backup copy | `/home/sysadmin/.personalledgr_db_pass` |
| Database data | Docker named volume `personalledgr_pgdata` |
| DB dumps | `/home/sysadmin/backups/` |

## Networking / Nginx Proxy Manager

- Public URL: **https://pl.ct-home.net** — proxy host in Nginx Proxy Manager
  (separate machine) forwarding to `https://192.168.1.30:3000` (scheme **https**).
- Host port 3000 is served by the **Caddy sidecar**, which terminates TLS with a
  10-year self-signed cert (`caddy/certs/`, CN=pl.ct-home.net) and proxies to
  the app container over the compose network. NPM does not verify upstream
  certs, so the self-signed cert is fine. The app container itself is no longer
  published on the host.
- The Caddy sidecar lives in `docker-compose.override.yml` on the server only
  (plus the `caddy/` directory). Both are excluded from git via
  `.git/info/exclude`, so `git pull` is never affected. The tracked
  `docker-compose.yml` stays unchanged — local dev still gets plain HTTP on 3000.
- `BETTER_AUTH_URL` in `/home/sysadmin/apps/PersonalLedgr/.env` is set to
  `https://pl.ct-home.net`. If the public URL ever changes, update it and run
  `docker compose up -d` to recreate the app container.
- The `db` container also publishes 5432 (from `docker-compose.yml`); it is not
  needed externally — only the containers talk to it over the compose network.
- In NPM enable **Websockets support**, **Force SSL** (redirects plain http to
  https), and forward standard proxy headers (`X-Forwarded-Proto`,
  `X-Forwarded-Host`) so auth cookies and redirects work behind HTTPS.

## Applying Future Changes

1. Develop locally, commit, and push to `main` on GitHub.
2. Run the deploy script on the server:

   ```bash
   ssh sysadmin@ud-web-host.local '~/apps/deploy-personalledgr.sh'
   ```

   The script does, in order: `git pull --ff-only` → `docker compose build` →
   `prisma migrate deploy` (one-off run in the cron image, which has the full
   node_modules) → `docker compose up -d` → health-check
   `https://localhost:3000/login` (through the Caddy sidecar) → prune dangling
   images.

3. Confirm it prints all three containers `Up` and `App responding: HTTP 200`.

Schema changes: create migrations locally with `pnpm exec prisma migrate dev`,
commit the generated `prisma/migrations/**` files, and push — the deploy script
applies them with `prisma migrate deploy`. Never run `migrate dev` on the server.

Compose/Dockerfile changes deploy the same way — the script rebuilds images and
`docker compose up -d` recreates only what changed.

## Operations Cheat Sheet

All commands run from `~/apps/PersonalLedgr` on the server.

```bash
# Status / logs
docker compose ps
docker compose logs -f app          # app logs (live)
docker compose logs -f cron         # cron worker logs (live)
docker compose logs -f db           # postgres logs (live)

# Restart / stop / start everything
docker compose restart
docker compose down                 # stop (data persists in the pgdata volume)
docker compose up -d                # start

# Database shell
docker compose exec db psql -U postgres personalledgr

# Manual DB backup
docker compose exec db pg_dump -U postgres personalledgr \
  > ~/backups/personalledgr-$(date +%F).sql

# Restore a backup (into an empty database)
docker compose exec -T db psql -U postgres personalledgr \
  < ~/backups/personalledgr-YYYY-MM-DD.sql
```

## Environment Variables (`.env` on the server)

Read automatically by Docker Compose; matches `.env.example`.

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | password for the `postgres` user in the db container (copy in `~/.personalledgr_db_pass`) |
| `BETTER_AUTH_SECRET` | generated with `openssl rand -base64 32` — do not rotate casually (invalidates sessions) |
| `BETTER_AUTH_URL` | public URL of the app (update once NPM host is configured) |
| `APP_PORT` | `3000` — host port the app is published on |

## Rebuilding From Scratch

If the server is ever lost: install Docker (engine + compose plugin) and git,
add the user to the `docker` group, restore the GitHub deploy key, then:

```bash
mkdir -p ~/apps && cd ~/apps
git clone git@github.com:cyrilth/PersonalLedgr.git
cd PersonalLedgr
# create .env with the four variables above
docker compose up --build -d
docker compose run --rm cron ./node_modules/.bin/prisma migrate deploy
```

Restore the latest dump from `~/backups/` if recovering data. The database
lives entirely in the `personalledgr_pgdata` Docker volume — back it up via
`pg_dump` (cheat sheet above), not by copying the volume directory.

## History

Originally deployed bare-metal (native Node 22 + PostgreSQL 18 + systemd units
`personalledgr` / `personalledgr-cron`). Migrated to Docker-only on 2026-06-12;
the native stack and systemd units were removed. A pre-migration DB dump
(no user data — 0 registered users) is at
`~/backups/personalledgr-pre-docker-2026-06-12.sql`.
