# vNext native integration evidence

These tests exercise the frozen frontend/BFF/backend seam without publishing an image or contacting deployed Elova infrastructure.

- The independent frontend, backend, native-operations, contract, integration, and security job results are the executable CI evidence. The PostgreSQL service image is only ephemeral test infrastructure.
- `contract.test.mjs` validates the OpenAPI document, then checks its normalized paths, operations, version headers, schemas, and accepted response fixtures.
- `postgres.test.mjs` runs concurrent migrations against the workflow's ephemeral PostgreSQL service. Its intentionally slow DDL probe only succeeds for both callers when migration execution is serialized, then it verifies the product-schema-free migration seam and drift-sensitive readiness state.
- `native-services.test.mjs` extracts the install-free archives accepted by the release helper, runs their packaged migration/start commands without installing dependencies, checks backend and proxied health compatibility, inspects browser assets for private values, verifies generic 502/504 envelopes, and requires graceful service exits.
- The pinned TruffleHog action scans repository history and tracked content, failing CI on verified or unknown secret findings.

The workflow uses only synthetic local test values. `DATABASE_URL` is additionally constrained by the PostgreSQL test to the local `elova_test` database.

## Generated-contract checkpoint

`@elova/api-contract` owns the OpenAPI source and committed generated client/types. CI reruns its deterministic `generate` script and rejects any diff under `packages/api-contract`.
