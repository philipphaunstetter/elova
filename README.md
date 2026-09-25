# Elova vNext

Elova monitors n8n workflow definitions and execution outcomes. The existing native release runs as two independently built services:

- `apps/frontend` — the public VPS Next.js UI and same-origin BFF;
- `apps/backend` — the private GX10 API, owner/session authority, n8n synchronization, sanitization boundary, and PostgreSQL persistence;
- `packages/api-contract` — the canonical OpenAPI contract and generated client;
- `ops` — native artifact packaging, guarded systemd templates, and operations guidance.

Browsers call only the public frontend at `/api/v1/*`. On native hosts, the VPS frontend is loopback-only behind the public proxy, and the GX10 backend binds only to its `tailscale0` address; see the [native host topology](ops/docs/native-services-runbook.md) for ports. Server-only BFF code uses `ELOVA_BACKEND_URL` to reach the private backend over the Tailnet; the private origin never enters browser code or API responses. `DATABASE_URL`, session keys, credential-encryption keys, n8n credentials, and all durable state belong only to the GX10 backend.

PostgreSQL is the only vNext application store. It owns the sole operator-created administrator, signed sessions, immutable n8n provider identities, encrypted credentials, sanitized workflow definitions, sanitized execution history, synchronization cursors, and observability metrics. Raw n8n execution content and workflow-node configuration may exist only in bounded process memory while the versioned sanitizer transforms them; they are never written to a durable or external sink.

## Local verification

Node.js 20 or newer is required.

```bash
npm ci
npm run generate
npm run lint
npm test
```

For packaging, use the [native artifact contract and build command](ops/docs/native-services-runbook.md#release-artifact-contract). Its example Tailnet address is build-time test input only; no network call is made during the frontend build. Packaging requires a clean checkout and emits install-free frontend/backend archives and checksums without deploying them. PostgreSQL integration and staged-artifact startup tests run in CI with an ephemeral database.

## Initial owner

There is no public signup or web bootstrap. After separately provisioning and migrating private PostgreSQL on GX10, an authorized operator can create the sole owner with the packaged backend's `bootstrap-owner` command. Use the [transient service-user procedure](ops/docs/native-services-runbook.md#3a-bootstrap-the-sole-owner-separately), not the persistent backend environment file, for bootstrap credentials. The command performs one atomic owner write; failures before commit are retryable and every call after commitment is refused.

## Operations

Read [`ops/docs/native-services-runbook.md`](ops/docs/native-services-runbook.md) before considering host work. Repository templates do not install, deploy, migrate, bootstrap an owner, start, or restart anything by themselves. Host, Tailnet, PostgreSQL, n8n, credential, owner-bootstrap, and deployment changes require separate authority.

The legacy public Docker image remains externally available and untouched. A separate **private, unactivated** backend + PostgreSQL two-container candidate is documented in [`ops/docs/container-runbook.md`](ops/docs/container-runbook.md); CI may build an unpushed ARM64 candidate with synthetic secrets. This is not an image-publication or GX10 deployment path without separate authority. Retirement of the external legacy artifact is a separate decision.

## Deferred product scope

Workspace/multi-user flows, governance/Jev, scoring, and migration or deletion of any legacy data remain deferred. The current PostgreSQL schema intentionally represents one owner-operated installation; future workspace isolation requires a separately reviewed schema migration.
