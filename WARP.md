# Elova vNext development guide

## Service boundaries

- `apps/frontend`: public Next.js UI and same-origin BFF. It must not import database, n8n, synchronization, or backend runtime code.
- `apps/backend`: private API, PostgreSQL access, migrations, and owner-initiated n8n synchronization.
- `packages/api-contract`: authoritative OpenAPI, fixtures, and generated client. Change the OpenAPI first and regenerate; never hand-edit generated files.
- `ops`: clean native artifact packaging plus templates and documentation. Repository work must not mutate hosts or services.

`ELOVA_BACKEND_URL` is server-only. Never create a `NEXT_PUBLIC_` equivalent or render it in HTML, browser JavaScript, responses, redirects, logs, or errors. `DATABASE_URL` belongs only to the backend.

## Required checks

```bash
npm ci
npm run generate
npm run lint
npm test
ELOVA_BACKEND_URL=http://100.100.10.20:3001 npm run package:native -- /path/to/output
bash -n ops/bin/elova-native-release ops/bin/elova-package-native ops/tests/test-native-release.sh
ops/tests/test-native-release.sh
```

CI adds ephemeral PostgreSQL migration tests, native startup/readiness and BFF failure tests, browser-artifact leakage inspection, dependency audit, and repository secret scanning.

## Runtime policy

vNext uses native Node.js services and guarded systemd templates. Do not add Dockerfiles, Compose files, image-publication workflows, or container-oriented release scripts. The existing external legacy image is not modified or retired by repository work.

Do not deploy, migrate production data, install units, start/restart services, change Tailnet/network/PostgreSQL/n8n settings, or use credentials without separate explicit authority.
