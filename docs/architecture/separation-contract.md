# vNext frontend/backend and PostgreSQL authority contract

## Repository ownership

| Path | Owner | Boundary |
| --- | --- | --- |
| `apps/frontend/**` | public frontend/BFF | VPS UI and same-origin BFF only; no database, n8n credential, synchronization, sanitizer, or private-backend implementation. |
| `apps/backend/**` | private backend | GX10 API, sole-owner identity/session authority, PostgreSQL migrations, encrypted n8n connections, synchronization, sanitization, and observability queries. |
| `packages/api-contract/**` | integration owner | Canonical OpenAPI source and generated client. Generated files are never hand-edited. |
| `ops/**` | native operations | Build-only packaging, guarded release tooling, systemd templates, and runbook. Host mutation remains separately authorized. |
| `.github/workflows/ci.yml`, `tests/integration/**` | integration evidence | Independent builds, PostgreSQL schema, contract, BFF, startup/failure, sanitization, and protected `build` evidence. |

## Network and configuration boundary

- Browser-visible same-origin API base: `/api/v1`.
- Private backend API base: `/v1`.
- `ELOVA_BACKEND_URL` exists only in the frontend server process and accepts a private Tailnet HTTP origin in production.
- `DATABASE_URL`, `ELOVA_SESSION_SECRET`, and `ELOVA_CREDENTIAL_KEY` exist only in the GX10 backend environment. PostgreSQL accepts only same-host Unix-socket or loopback connections.
- Browsers never receive or call GX10. Tailnet transport does not replace the signed owner session enforced by every product endpoint.

The BFF applies same-origin browser checks, one bounded request/response deadline, streaming byte limits, explicit request/response header allowlists, API-version validation, structured error validation, and private-origin redaction. It forwards signed session cookies but never database or credential configuration.

## PostgreSQL-only state boundary

PostgreSQL is the only active vNext application store. Ordered migration `0001_postgres_authority.sql` owns:

- the sole operator-created owner and revocable signed sessions;
- immutable n8n provider identities and encrypted API credentials;
- sanitized workflow definitions and node configuration;
- sanitized execution history and outcome metadata;
- synchronization cursors/runs and dashboard metrics.

There is no SQLite dependency, runtime path, startup schema mutation, web first-owner claim, or public signup. The operator bootstrap command takes a PostgreSQL transaction lock, atomically creates one owner, permits retry only before commit, and refuses every later call.

Provider origins cannot be replaced. A different n8n instance is represented by another provider so histories do not mix and no old workflow/execution record is migrated or deleted implicitly.

## Sanitization boundary

Raw workflow and execution responses are bounded to process memory while being transformed. The backend sanitizes both workflow-node configuration and execution content before every repository call. Stored records carry `privacy_mode=sanitized_only`, sanitizer version, and deterministic digest. Keys and values associated with headers, bodies, queries, credentials, tokens, personal values, binary data, and other non-structural content are redacted. A failed fetch, parse, or sanitization stores no raw fallback.

## Contract and validation

`packages/api-contract/openapi.yaml` is authoritative for health, login/session, providers, synchronization, workflows, executions, and metrics. The generated client is regenerated and checked for drift. The strict protected `build` job depends on native operations, frontend/backend validation, contract drift, PostgreSQL/native integration, and security scanning, then repeats full repository generation, lint, test, and build on the exact head.

## Deferred scope

Workspace/multi-user schema and flows, governance/Jev, scoring, legacy data migration or deletion, live owner bootstrap, live n8n synchronization, deployment, and external legacy Docker-image retirement remain outside this repository change. The current schema deliberately serves one owner-operated installation.
