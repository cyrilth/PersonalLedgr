# Security Hardening Plan

Remaining tasks to complete before exposing PersonalLedgr to the public internet.

## Completed

- [x] **Add auth to `/api/seed`** — requires authenticated session, returns 401 otherwise
- [x] **Add auth to `/api/recalculate`** — requires authenticated session, returns 401 otherwise
- [x] **Sanitize error responses** — both API routes now log errors server-side and return generic "Internal server error" to clients

## Critical

- [ ] **Remove exposed database port** — remove `ports: "5432:5432"` from `docker-compose.yml` (or bind to `127.0.0.1:5432:5432`). The DB should only be reachable from other containers on the Docker network, never from the host network.
- [ ] **Enforce strong database password** — replace the default `postgres:postgres` in `.env.example` and document that users must generate a strong random password (`openssl rand -base64 32`).

## High

- [ ] **Add security headers** — configure in `next.config.ts` `headers()`:
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` (clickjacking protection)
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy` (restrict script/style sources)
- [ ] **Add rate limiting on auth endpoints** — limit login to 5 attempts/minute per IP, registration to 3/hour per IP. Options: Upstash Ratelimit, `express-rate-limit` via middleware, or a reverse proxy (Caddy/nginx) in front of the app.
- [ ] **Strengthen password policy** — enforce 12+ characters with at least 1 uppercase, 1 number, 1 special character. Update validation in `src/app/(auth)/register/page.tsx` and any password change forms.

## Medium

- [ ] **Input validation on server actions** — add `Number.isFinite()` checks and range bounds on all numeric fields in `src/actions/accounts.ts`, `src/actions/transactions.ts`, `src/actions/recurring.ts`, `src/actions/budgets.ts`. Reject NaN, Infinity, and values outside reasonable bounds.
- [ ] **Run containers as non-root** — add `USER` directive to `Dockerfile` and `cron/Dockerfile`:
  ```dockerfile
  RUN addgroup --system --gid 1001 appuser && adduser --system --uid 1001 appuser
  USER appuser
  ```
- [ ] **Validate Content-Type on API routes** — wrap `request.json()` calls in try/catch and return 400 for malformed bodies.
- [ ] **Limit avatar upload size** — add a max size check (e.g., 50KB base64) before storing in the database. Consider moving to file-based storage for production.

## Low

- [ ] **Add audit logging** — log sensitive operations (account create/delete, seed/wipe, password change) to a dedicated `AuditLog` table with userId, action, timestamp, and details.
- [ ] **Secret rotation documentation** — document how to rotate `BETTER_AUTH_SECRET` and `POSTGRES_PASSWORD` without downtime.
- [ ] **Reverse proxy setup** — document recommended production deployment with Caddy or nginx in front for TLS termination, rate limiting, and security headers. Include a sample `Caddyfile` or `nginx.conf`.
- [ ] **CORS policy** — if the API is ever accessed cross-origin, add explicit CORS configuration.
