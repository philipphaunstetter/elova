# vNext native integration evidence

These tests exercise the frozen frontend/BFF/backend seam without publishing an image or contacting deployed Elova infrastructure.

- `ci-policy.test.mjs` proves `.github/workflows/ci.yml` has no image build, registry login, publication command, live target, or application secret reference. The PostgreSQL service image is only ephemeral test infrastructure.
- `contract.test.mjs` checks the canonical API package, paths, version header, and accepted response fixtures.
- `postgres.test.mjs` runs concurrent migrations against the workflow's ephemeral PostgreSQL service. Its intentionally slow DDL probe only succeeds for both callers when migration execution is serialized, then it applies and checks the real baseline migration and drift-sensitive readiness state.
- `native-services.test.mjs` starts built Node/Next artifacts directly, checks backend and proxied health compatibility, inspects browser assets for private values, verifies generic 502/504 envelopes, and requires graceful service exits.
- `secrets.test.mjs` scans tracked source for credential files and recognizable high-confidence secret formats.

The workflow uses only synthetic local test values. `DATABASE_URL` is additionally constrained by the PostgreSQL test to the local `elova_test` database.

## Integration-owner checkpoint

The frozen baseline does not yet define API-client generation. Before combining this slice, `@elova/api-contract` must provide a deterministic `generate` script and commit its generated client/types. CI reruns that script and rejects any diff under `packages/api-contract`.
