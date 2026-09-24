# vNext native integration evidence

These tests exercise the frontend/BFF/backend/PostgreSQL boundary without publishing an image or contacting deployed infrastructure.

- Independent frontend, backend, native-operations, contract, PostgreSQL/native-integration, and security jobs feed the strict protected `build` job.
- `contract.test.mjs` validates normalized OpenAPI product and health operations plus stable public failure fixtures.
- `postgres.test.mjs` proves migration advisory locking, checksum drift rejection, the complete PostgreSQL-only authority schema, privacy metadata, atomic first-owner commitment, permanent bootstrap closure, and bounded readiness failure.
- Backend behavior tests prove signed-session login/rejection, encrypted n8n credentials, immutable private provider origins, and sanitization before repository calls.
- `native-services.test.mjs` extracts install-free archives, runs packaged migration/start commands, checks backend and proxied readiness, inspects browser assets for private values, verifies generic failures, and checks shutdown behavior.
- The pinned TruffleHog action scans repository history and tracked content, failing CI on verified or unknown secret findings.

CI uses disposable PostgreSQL and synthetic values; it never contacts a deployed n8n, production credential, host, or database. `live-postgres-n8n.mjs` is an opt-in scenario outside CI and `npm test`: it checks the built operator command, signed login through the BFF, authenticated settings, and separated sanitized histories against an explicitly authorized, **empty** loopback PostgreSQL database and two synthetic loopback n8n fixtures. It requires `ELOVA_LIVE_ISOLATED_FIXTURE=yes`, `ELOVA_LIVE_DATABASE_URL`, `ELOVA_LIVE_N8N_A`, and `ELOVA_LIVE_N8N_B`; do not run it against existing databases or deployed services.

## Generated-contract checkpoint

`@elova/api-contract` owns the OpenAPI source and committed generated client/types. CI reruns generation and rejects any diff under `packages/api-contract`.
