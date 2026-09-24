# Elova vNext developer quick start

This repository does not provide a Docker or Compose runtime for vNext.

## Build and test

```bash
npm ci
npm run generate
npm run lint
npm test
ELOVA_BACKEND_URL=http://100.100.10.20:3001 npm run package:native -- /path/to/output
```

## Run the backend locally

The backend requires a same-host Unix-socket or loopback PostgreSQL URL and refuses wildcard binds. Before either command, supply `DATABASE_URL` and two **different** base64-encoded 32-byte values for `ELOVA_SESSION_SECRET` and `ELOVA_CREDENTIAL_KEY` through a protected local environment. Migration validates these settings too. Do not put credentials in shell history or checked-in files. Apply migrations explicitly before startup:

```bash
cd apps/backend
npm run migrate
ELOVA_BACKEND_HOST=127.0.0.1 PORT=3001 npm start
```

## Run the frontend locally

In a separate terminal:

```bash
cd apps/frontend
NODE_ENV=development ELOVA_BACKEND_URL=http://127.0.0.1:3001 \
  HOSTNAME=127.0.0.1 PORT=3000 npm start
```

Production accepts only the GX10 HTTP origin using Tailnet IPv4, Tailscale IPv6, or a fully qualified MagicDNS `.ts.net` name. The frontend must configure it only on the server.

For production prerequisites, guarded release mechanics, readiness, rollback, and restore expectations, see [`ops/docs/native-services-runbook.md`](ops/docs/native-services-runbook.md). Do not install or run those templates without separate host authority.
