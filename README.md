# Elova vNext

Elova monitors n8n workflow definitions and execution outcomes. The application has two independently built services. The previously planned native frontend install was not run; a separate, unactivated VPS frontend container candidate now exists:

- `apps/frontend` — the public VPS Next.js UI and same-origin BFF;
- `apps/backend` — the private GX10 API, owner/session authority, n8n synchronization, sanitization boundary, and PostgreSQL persistence;
- `packages/api-contract` — the canonical OpenAPI contract and generated client;
- `ops` — unactivated frontend/backend container candidates, native release assets, and operations guidance.

Browsers call only the public frontend at `/api/v1/*`. The intended VPS delivery is a separate frontend container behind the existing Traefik Docker provider, with no host-published frontend port; see the [unactivated frontend plan](ops/docs/vps-frontend-container.md). The [native host topology](ops/docs/native-services-runbook.md) is retained as historical guidance, not evidence of installation. Server-only BFF code uses `ELOVA_BACKEND_URL` to reach the private backend over the Tailnet; the private origin never enters browser code or API responses. `DATABASE_URL`, session keys, credential-encryption keys, n8n credentials, and all durable state belong only to the GX10 backend.

PostgreSQL is the only vNext application store. It owns the sole operator-created administrator, signed sessions, immutable n8n provider identities, encrypted credentials, sanitized workflow definitions, sanitized execution history, synchronization cursors, and observability metrics. Raw n8n execution content and workflow-node configuration may exist only in bounded process memory while the versioned sanitizer transforms them; they are never written to a durable or external sink.

## Local verification

Node.js 20 or newer is required for existing source checks; the frontend container candidate builds/runs on pinned Node 22 Linux/amd64.

```bash
npm ci
npm run generate
npm run lint
npm test
```

For packaging, use the [native artifact contract and build command](ops/docs/native-services-runbook.md#release-artifact-contract). Its example Tailnet address is build-time test input only; no network call is made during the frontend build. Packaging requires a clean checkout and emits install-free frontend/backend archives and checksums without deploying them. PostgreSQL integration and staged-artifact startup tests run in CI with an ephemeral database.

## Initial owner

There is no public signup or web bootstrap. After separately provisioning and migrating private PostgreSQL, an authorized operator can create the first global super administrator and their literal `admin workspace` with the packaged backend's `bootstrap-owner` command. The captain's identifier and chosen password must be provided later through the [protected local one-time handoff](ops/docs/native-services-runbook.md#3a-bootstrap-the-sole-super-administrator-separately); no live owner is created by this repository. The command performs an atomic owner/workspace write; after commitment it is permanently closed.

## Operations

Read the [frontend container operator plan](ops/docs/vps-frontend-container.md) before considering any VPS change, and [`ops/docs/native-services-runbook.md`](ops/docs/native-services-runbook.md) only for historical native assets. Repository templates do not install, deploy, migrate, bootstrap an owner, start, or restart anything by themselves. Host, Tailnet, PostgreSQL, n8n, credential, owner-bootstrap, and deployment changes require separate authority.

The legacy public Docker image remains externally available and untouched. A separate **private, unactivated** backend + PostgreSQL two-container candidate is documented in [`ops/docs/container-runbook.md`](ops/docs/container-runbook.md); CI may build an unpushed ARM64 candidate with synthetic secrets. This is not an image-publication or GX10 deployment path without separate authority. Retirement of the external legacy artifact is a separate decision.

## Deferred product scope

The additive `0002_workspaces.sql` migration preserves existing owners as ordinary users, sessions and sanitized provider evidence, backfills a distinct owned workspace and owner membership for each existing owner without granting global access, and scopes n8n connections and evidence to an explicitly selected workspace. [Fixed per-workspace owner/admin/editor/viewer permissions](ops/docs/workspace-permissions.md) allow shared users and enforce a designated owner without making the creator permanently privileged. An operator-only protected file handoff can separately provision an ordinary user; workspace owners then attach existing users by exact identity. No public signup, invitation, billing, n8n workflow writes, governance/Jev or scoring is included.
