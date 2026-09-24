# Elova vNext

Elova monitors n8n workflows and execution outcomes. This first vNext slice establishes deployment boundaries and health checks; the legacy product flows are not yet ported to these services.

Elova is being separated into independently built native services:

- `apps/frontend` — the public VPS Next.js frontend and same-origin BFF;
- `apps/backend` — the private GX10 API and PostgreSQL migration boundary;
- `packages/api-contract` — the canonical OpenAPI contract, fixtures, and generated client;
- `ops` — clean native artifact packaging, reviewed systemd templates, and guarded runbook material.

Browsers call only the public frontend at `/api/v1/*`. Server-only BFF code uses `ELOVA_BACKEND_URL` to reach the private backend over the Tailnet. The browser bundle and responses must never contain that private origin. PostgreSQL access and `DATABASE_URL` belong only to the backend and use a same-host GX10 socket or loopback connection.

## Local verification

Node.js 20 or newer is required.

```bash
npm ci
npm run generate
npm run lint
npm test
ELOVA_BACKEND_URL=http://100.100.10.20:3001 npm run package:native -- /path/to/output
```

The example Tailnet address is build-time test input only; no network call is made during the frontend build. Packaging emits install-free frontend/backend archives and checksums without deploying them. PostgreSQL integration and staged-artifact startup tests run in CI with an ephemeral database.

## Operations

Read [`ops/docs/native-services-runbook.md`](ops/docs/native-services-runbook.md) before considering any host work. Repository templates do not install, deploy, migrate, start, or restart anything by themselves. Host, Tailnet, PostgreSQL, n8n, credential, and deployment changes require separate authority.

The legacy public Docker image remains externally available and untouched. vNext has no container build or image-publication path; retirement of the external legacy artifact is a separate decision.

## Scope of this foundation

This slice establishes service separation, the private API/BFF boundary, native health/readiness, a minimum ordered PostgreSQL migration seam, and validation evidence. Workspace, governance/Jev, scoring, multi-user flows, content sanitization, and legacy product/data migration remain deferred.
