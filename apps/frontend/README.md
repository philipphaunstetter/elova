# Elova frontend

Deployable Next.js frontend and same-origin BFF foundation. The application shell, owner login, dashboard and n8n connection settings follow the corrected [Sales redesign](https://github.com/philipphaunstetter/elova-sales/pull/33) at `8c8e7717fe1793c0458f0f639fde8cdfd6716ec9`, using the original footer `Elova ✳` wordmark from `0efcfcbe4b525d7a6b4d0f013124be9cbd14126f`, Match typography, warm neutral background and violet/ink accents. This is an authenticated product UI, not a copy of the Sales page; its workflow visual is decorative, not a live execution diagram. The locally bundled Match font files are byte-identical to the Sales reference (also present on the read-only legacy branch).

## Runtime configuration

`ELOVA_BACKEND_URL` is the private backend **HTTP origin**, using a Tailnet IPv4 address, Tailscale IPv6 address, or fully qualified MagicDNS `.ts.net` name with no path. It is read only by server modules. Tailnet origins are accepted in every environment; explicit development additionally permits HTTP loopback. HTTPS and every other origin are rejected. There is deliberately no `NEXT_PUBLIC_*` equivalent. Production requires explicit backend port `43181`. Source `npm run dev` and `npm start` pin `127.0.0.1:43180`; the packaged native startup defaults to that bind, and the service unit pins it.

The browser uses `/api/v1/*`; the BFF maps that path to the backend's `/v1/*`, including browser-facing readiness at `/api/v1/health/ready`. Web probes are available at `/health/live` and `/health/ready`.

### Development HTTP login (explicit opt-in only)

The backend always issues `Secure; HttpOnly; SameSite=Strict` session cookies; the BFF normally forwards them unchanged. For an **approved development-only** HTTP browser origin, set `ELOVA_DEV_HTTP_COOKIE_ORIGIN=http://69.62.114.160:43180` in the **frontend server's** runtime environment (not a `NEXT_PUBLIC_*` variable). The value must be an exact HTTP origin with an explicit port, without a trailing slash, path, query, or credentials. Only successful `/api/v1/auth/login` and `/api/v1/auth/logout` responses whose request URL **and browser `Origin` header** match that HTTP origin (and whose forwarded protocol is not HTTPS) omit `Secure` from the `elova_session` cookie; all other cookies, origins, and HTTPS requests retain the backend attributes. Unset the variable to restore the secure default; an invalid value also fails closed. This does not open the loopback frontend bind or configure a proxy, backend route, or host.

**HTTP exposes passwords and session tokens to the network.** Use only on the explicitly approved Elova development surface; never set this option on a production frontend or an unrelated app. HTTPS/production should leave it unset. The frontend may run as a production build (`NODE_ENV=production`) on a development surface; this exception is controlled by the exact origin, not by `NODE_ENV`. A TLS proxy must use HTTPS without this opt-in. This repository change does not deploy or activate any host.

## Previewing the rework

From the repository root, run `npm ci`, then start the source dev server with `npm run dev --workspace @elova/frontend`. Open `http://127.0.0.1:43180/` on that machine to inspect the home and login screens. The dev server binds loopback only; `npm start` instead requires a prior frontend build. Without a configured backend, the dashboard and settings cannot display authenticated content.

A **synthetic Tailnet demo** of the authenticated dashboard and settings is separately owned by an operator, not provided by the loopback dev command. If one is available, request its approved access instructions from that operator. It must use an isolated backend, PostgreSQL database, synthetic owner and synthetic evidence only: no real credentials, n8n connections or production data. This repository does not create or activate the demo, supply a remote URL or configure remote access. The ignored `.preview-evidence/` directory is reserved for ephemeral private preview artifacts; do not commit or put real credentials or data there.

## Local verification

```bash
npm run verify --workspace @elova/frontend
```
