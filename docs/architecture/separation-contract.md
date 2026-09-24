# vNext frontend/backend separation contract

Status: **frozen for the first separation slice**. Changes require the integration owner and regeneration of accepted client artifacts.

## Repository ownership

| Path | Owner | Boundary |
| --- | --- | --- |
| `apps/frontend/**` | frontend/BFF slice | Public VPS service. Browser UI and same-origin BFF only; no database, n8n, sync, or private-backend implementation. |
| `apps/backend/**` | backend/integration slice | Private GX10 HTTP API, PostgreSQL access, migrations, synchronization, and jobs. No browser bundle. |
| `packages/api-contract/**` | integration owner | Canonical OpenAPI source, fixtures, generated types/client, and compatibility checks. Generated files are never hand-edited. |
| `ops/bin/**`, `ops/systemd/**`, `ops/docs/**` | native-operations slice | Native packaging, guarded release helper, systemd templates, and the [operations runbook](../../ops/docs/native-services-runbook.md). Host mutations require separate authority and an explicit `--apply` gate. |
| `.github/workflows/ci.yml`, `tests/integration/**` | CI-evidence slice | Independent builds plus contract, browser-boundary, startup/health, failure, and leakage evidence. |

Shared files (`package.json`, lockfile, TypeScript/lint configuration, this contract, and generated artifacts) are integration-owner reconciliation points. Workers must not independently redefine them.

## Canonical names and request path

- Browser-visible same-origin API base: `/api/v1`.
- Private backend API base: `/v1`.
- Frontend-only private origin variable: `ELOVA_BACKEND_URL` (required in production). It has no `NEXT_PUBLIC_` alias and must not be copied into HTML, JavaScript, source maps, error bodies, redirects, or proxied response headers.
- Backend-only database variable: `DATABASE_URL` (required by backend runtime and migrations). It must never be accepted by or exposed from the frontend.
- Frontend artifact/service: `@elova/frontend`, `elova-frontend.service`.
- Backend artifact/service: `@elova/backend`, `elova-backend.service`.
- Contract package: `@elova/api-contract`.
- Frontend bind variables: `HOSTNAME` and `PORT` (production defaults are specified by the unit template, not application code).
- Backend bind variables: `ELOVA_BACKEND_HOST` and `PORT` (the unit template must bind only the intended Tailnet address, never `0.0.0.0` by default).

The browser calls only `https://<public-vps>/api/v1/...`. The frontend server removes `/api` and calls `${ELOVA_BACKEND_URL}/v1/...` across the Tailnet. PostgreSQL is reachable only by the backend through a same-host GX10 Unix socket or loopback connection. Tailnet transport identity does not replace application authentication or workspace authorization.

## BFF behavior

The BFF:

1. constructs the private URL exclusively in server-only code;
2. forwards method, body, cookies, `authorization`, `content-type`, `accept`, CSRF header, and request/correlation ID under explicit size and timeout limits;
3. does not forward hop-by-hop headers or caller-supplied host/forwarding headers;
4. returns only an allowlist of response headers (`content-type`, `cache-control`, `etag`, `set-cookie`, `x-request-id`, `retry-after`);
5. never returns an upstream `Location`, stack, hostname, origin, or raw network error;
6. preserves only known, versioned backend `400`, `404`, and `405` envelopes after structured sanitization;
7. maps timeout to the stable `504` envelope and other upstream unavailability to the stable `502` envelope in `packages/api-contract/fixtures`.

There is no browser CORS path to GX10. Production accepts only an HTTP `ELOVA_BACKEND_URL` using a Tailnet IP or fully qualified MagicDNS `.ts.net` name; local development may use HTTP loopback only under an explicit development environment.

## Frozen API seam

`packages/api-contract/openapi.yaml` is authoritative. The first slice freezes:

- `GET /v1/health/live`: process liveness only;
- `GET /v1/health/ready`: readiness, including PostgreSQL reachability and migration compatibility;
- stable success and BFF-failure envelopes;
- an `X-Elova-Api-Version: 1` compatibility header on backend responses.

No product endpoint is invented in this foundation. Existing v2 calls are converted behind the same-origin BFF as they are extracted; server-owned API/data/sync logic cannot remain in the frontend service.

## Integration checkpoints and serialization

Main ancestry has been reconciled into the v2 base; the independent service and operations slices have been integrated. `packages/api-contract/openapi.yaml` remains the sole API source: regenerate its client from the final contract rather than editing generated files. [Native CI](../../.github/workflows/ci.yml) owns the independent build, contract-drift, migration, startup/readiness, BFF-boundary, and security evidence. The final reviewed head must be green, unchanged, in scope, and mergeable before the sole PR to `main` is merged.

Contract/schema changes, generated client output, root dependency/lockfile reconciliation, ordered PostgreSQL migrations, legacy data migration, and the final branch/PR/merge remain serialized integration-owner decisions. Host, Tailnet, PostgreSQL, n8n, registry, and public-image state are outside this slice.

## Explicit deferrals

Workspaces, organization/member flows, governance/Jev, scoring, execution/workflow sanitization modes, product redesign, and legacy-data migration are not part of this first separation slice. The service boundaries must leave seams for them, but no schema or UI for them is introduced here. The existing public Docker artifact is not changed or retired by this repository contract.
