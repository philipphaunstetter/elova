# Elova vNext development guide

## Service boundaries

- `apps/frontend`: public Next.js UI and same-origin BFF. It must not import database, n8n, synchronization, or backend runtime code.
- `apps/backend`: private API, PostgreSQL access, migrations, and owner-initiated n8n synchronization.
- `packages/api-contract`: authoritative OpenAPI, fixtures, and generated client. Change the OpenAPI first and regenerate; never hand-edit generated files.
- `ops`: native release assets and a separate unactivated container candidate; see the [native runbook](ops/docs/native-services-runbook.md) and [container runbook](ops/docs/container-runbook.md). Repository work must not mutate hosts or services.

`ELOVA_BACKEND_URL` is server-only. Never create a `NEXT_PUBLIC_` equivalent or render it in HTML, browser JavaScript, responses, redirects, logs, or errors. `DATABASE_URL` belongs only to the backend.

## Required checks

```bash
npm ci
npm run generate
npm run lint
npm test
```

See the [README](README.md#local-verification) for packaging and the [native operations runbook](ops/docs/native-services-runbook.md#review-and-install-the-templates) for shell/template checks. For container checks and CI scope, see the [container runbook](ops/docs/container-runbook.md#validation-scope).

## Runtime policy

The existing native release uses guarded systemd templates. A separate private backend/PostgreSQL container candidate is for review only; follow the [container runbook](ops/docs/container-runbook.md), not the native release helper, for its distinct gates. Neither path authorizes image publication or retirement of the existing external legacy image.

Do not deploy, migrate production data, install units, start/restart services, change Tailnet/network/PostgreSQL/n8n settings, or use credentials without separate explicit authority.
