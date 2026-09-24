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

The backend requires a PostgreSQL URL and refuses wildcard binds. Apply migrations explicitly before startup:

```bash
cd apps/backend
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/elova npm run migrate
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/elova \
  ELOVA_BACKEND_HOST=127.0.0.1 PORT=3001 npm start
```

Do not use real credentials in shell history; these commands show variable shape only.

## Run the frontend locally

In a separate terminal:

```bash
cd apps/frontend
NODE_ENV=development ELOVA_BACKEND_URL=http://127.0.0.1:3001 \
  HOSTNAME=127.0.0.1 PORT=3000 npm start
```

Production rejects loopback and public backend origins. The frontend must be configured with the private GX10 Tailnet origin only on the server.

For production prerequisites, guarded release mechanics, readiness, rollback, and restore expectations, see [`ops/docs/native-services-runbook.md`](ops/docs/native-services-runbook.md). Do not install or run those templates without separate host authority.
