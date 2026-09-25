# Elova frontend

Deployable Next.js frontend and same-origin BFF foundation. The application shell, owner login, dashboard and n8n connection settings share a visual language with the shipped Sales site (`elova-sales` at `1ced277726b8676b9d057344afc980f3ca0266a2`): original footer `Elova ✳` wordmark, Match typography, warm neutral background and violet/ink accents. This is an authenticated product UI, not a copy of the Sales page; its workflow visual is decorative, not a live execution diagram. The locally bundled Match font files are byte-identical to the Sales reference (also present on the read-only legacy branch).

## Runtime configuration

`ELOVA_BACKEND_URL` is the private backend **HTTP origin**, using a Tailnet IPv4 address, Tailscale IPv6 address, or fully qualified MagicDNS `.ts.net` name with no path. It is read only by server modules. Tailnet origins are accepted in every environment; explicit development additionally permits HTTP loopback. HTTPS and every other origin are rejected. There is deliberately no `NEXT_PUBLIC_*` equivalent. Production requires explicit backend port `43181`. Source `npm run dev` and `npm start` pin `127.0.0.1:43180`; the packaged native startup defaults to that bind, and the service unit pins it.

The browser uses `/api/v1/*`; the BFF maps that path to the backend's `/v1/*`, including browser-facing readiness at `/api/v1/health/ready`. Web probes are available at `/health/live` and `/health/ready`.

```bash
npm install
npm run verify
npm run start
```
