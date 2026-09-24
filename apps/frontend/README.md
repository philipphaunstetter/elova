# Elova frontend

Deployable Next.js frontend and same-origin BFF foundation.

## Runtime configuration

`ELOVA_BACKEND_URL` is the private backend **origin**, for example a Tailnet URL with no path. It is read only by server modules. Production rejects loopback and public origins. There is deliberately no `NEXT_PUBLIC_*` equivalent.

The browser uses `/api/v1/*`; the BFF maps that path to the backend's `/v1/*`, including browser-facing readiness at `/api/v1/health/ready`. Web probes are available at `/health/live` and `/health/ready`.

```bash
npm install
npm run verify
npm run start
```
