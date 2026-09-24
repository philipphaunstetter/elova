# vNext frontend/backend separation contract

Status: **frozen for the first separation slice**. Changes require the integration owner and regeneration of accepted client artifacts.

## Repository ownership

| Path | Owner | Boundary |
| --- | --- | --- |
| `apps/frontend/**` | frontend/BFF slice | Public VPS service. Browser UI and same-origin BFF only; no database, n8n, sync, or private-backend implementation. |
| `apps/backend/**` | backend/integration slice | Private GX10 HTTP API, PostgreSQL access, migrations, synchronization, and jobs. No browser bundle. |
| `packages/api-contract/**` | integration owner | Canonical OpenAPI source, fixtures, generated types/client, and compatibility checks. Generated files are never hand-edited. |
| `deploy/systemd/**`, `docs/operations/**` | native-operations slice | Guarded systemd templates and native build/start/rollback runbook. No host mutation scripts. |
| `.github/workflows/**`, `scripts/verify-*.mjs` | CI-evidence slice | Independent builds plus contract, browser-boundary, startup/health, failure, and leakage evidence. |

Shared files (`package.json`, lockfile, TypeScript/lint configuration, this contract, and generated artifacts) are integration-owner reconciliation points. Workers must not independently redefine them.

## Canonical names and request path

- Browser-visible same-origin API base: `/api/v1`.
- Private backend API base: `/v1`.
- Frontend-only private origin variable: `ELOVA_BACKEND_URL` (required in production). It has no `NEXT_PUBLIC_` alias and must not be copied into HTML, JavaScript, source maps, error bodies, redirects, or proxied response headers.
- Backend-only database variable: `DATABASE_URL` (required outside tests). It must never be accepted by or exposed from the frontend.
- Frontend artifact/service: `@elova/frontend`, `elova-frontend.service`.
- Backend artifact/service: `@elova/backend`, `elova-backend.service`.
- Contract package: `@elova/api-contract`.
- Frontend bind variables: `HOSTNAME` and `PORT` (production defaults are specified by the unit template, not application code).
- Backend bind variables: `ELOVA_BACKEND_HOST` and `PORT` (the unit template must bind only the intended Tailnet address, never `0.0.0.0` by default).

The browser calls only `https://<public-vps>/api/v1/...`. The frontend server removes `/api` and calls `${ELOVA_BACKEND_URL}/v1/...` across the Tailnet. PostgreSQL is reachable only by the backend on GX10. Tailnet transport identity does not replace application authentication or workspace authorization.

## BFF behavior

The BFF:

1. constructs the private URL exclusively in server-only code;
2. forwards method, body, cookies, `authorization`, `content-type`, `accept`, CSRF header, and request/correlation ID under explicit size and timeout limits;
3. does not forward hop-by-hop headers or caller-supplied host/forwarding headers;
4. returns only an allowlist of response headers (`content-type`, `cache-control`, `etag`, `set-cookie`, `x-request-id`, `retry-after`);
5. never returns an upstream `Location`, stack, hostname, origin, or raw network error;
6. maps timeout to the stable `504` envelope and other upstream unavailability to the stable `502` envelope in `packages/api-contract/fixtures`.

There is no browser CORS path to GX10. Production accepts only an HTTP `ELOVA_BACKEND_URL` using a Tailnet IP or MagicDNS name; local development may use HTTP loopback only under an explicit development environment.

## Frozen API seam

`packages/api-contract/openapi.yaml` is authoritative. The first slice freezes:

- `GET /v1/health/live`: process liveness only;
- `GET /v1/health/ready`: readiness, including PostgreSQL reachability and migration compatibility;
- stable success and BFF-failure envelopes;
- an `X-Elova-Api-Version: 1` compatibility header on backend responses.

No product endpoint is invented in this foundation. Existing v2 calls are converted behind the same-origin BFF as they are extracted; server-owned API/data/sync logic cannot remain in the frontend service.

## Integration checkpoints and serialization

1. **Baseline (this document):** merge `origin/main` ancestry into `origin/v2-develop` with an unchanged tree; freeze paths, names, OpenAPI, and fixtures.
2. **Independent slice heads:** backend may implement only `apps/backend` plus contract consumption; frontend may implement `apps/frontend` plus generated-client consumption; operations may implement only its owned paths; CI may add verification without changing the contract.
3. **Generated artifact checkpoint (serialized):** integration owner reconciles all heads, resolves the workspace lockfile, validates OpenAPI, and regenerates the client exactly once from the final contract.
4. **Compatibility checkpoint (serialized):** backend conformance and frontend generated-client tests must pass against the same contract digest.
5. **Final checkpoint (serialized):** independent builds, BFF leakage/failure tests, native startup/readiness, migration compatibility, full tests/lint/build, and no-mistakes review run on one unchanged head before the sole PR to `main`.

True serialization points are contract/schema changes, generated client output, root dependency/lockfile reconciliation, ordered PostgreSQL migrations, legacy data migration, and the final branch/PR/merge. Host, Tailnet, PostgreSQL, n8n, registry, and public-image state are never shared worker state and are outside this slice.

## Explicit deferrals

Workspaces, organization/member flows, governance/Jev, scoring, execution/workflow sanitization modes, product redesign, and legacy-data migration are not part of this first separation slice. The service boundaries must leave seams for them, but no schema or UI for them is introduced here. The existing public Docker artifact is not changed or retired by this repository contract.
