# vNext integration evidence

These tests exercise the frontend/BFF/backend/PostgreSQL boundary without publishing an image or contacting deployed infrastructure.

- See [CI](../../.github/workflows/ci.yml) for the current jobs gating `build`.
- `contract.test.mjs` validates normalized OpenAPI product and health operations plus stable public failure fixtures.
- `postgres.test.mjs` proves ordered migrations, advisory locking, checksum drift rejection, PostgreSQL-only authority, atomic first-owner/workspace commitment and bounded readiness failure. `workspace-upgrade.test.mjs` runs only in disposable CI PostgreSQL and proves additive 0001→0002 preservation, owner isolation, and global super-administrator access.
- Backend behavior tests prove signed-session login/rejection, encrypted n8n credentials, workspace selection and workspace-scoped provider and evidence-list routes, immutable private provider origins, and sanitization before repository calls.
- `native-services.test.mjs` extracts install-free archives, runs packaged migration/start commands on local disposable fixtures (`127.0.0.1:43180` frontend, `127.0.0.1:43181` backend as a Tailnet DNS stand-in), checks private BFF connectivity and refusal on another interface address, inspects browser assets for private values, verifies generic failures, and checks shutdown behavior. CI does not certify actual host port availability or Tailnet policy.
- `container-contract.test.mjs` checks the candidate's Compose boundaries without Docker; see the [container runbook](../../ops/docs/container-runbook.md#validation-scope) for disposable ARM64 CI coverage and its limits.
- The pinned TruffleHog action scans repository history and tracked content, failing CI on verified or unknown secret findings.

CI uses disposable PostgreSQL and synthetic values; it never contacts a deployed n8n, production credential, host, or database. `live-postgres-n8n.mjs` is an opt-in scenario outside CI and `npm test`: it checks the built operator command, signed login through the BFF, authenticated settings, and separated sanitized histories against an explicitly authorized, **empty** loopback PostgreSQL database and two synthetic loopback n8n fixtures. It requires `ELOVA_LIVE_ISOLATED_FIXTURE=yes`, `ELOVA_LIVE_DATABASE_URL`, `ELOVA_LIVE_N8N_A`, and `ELOVA_LIVE_N8N_B`; do not run it against existing databases or deployed services.

## Generated-contract checkpoint

`@elova/api-contract` owns the OpenAPI source and committed generated client/types. CI reruns generation and rejects any diff under `packages/api-contract`.
