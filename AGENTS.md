# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- The existing native release and the unactivated container candidate have separate operation paths; see `ops/docs/native-services-runbook.md` and `ops/docs/container-runbook.md`. Repository/CI changes do not authorize host activation or image publication.
- Run `npm test` and `npm run lint` for source checks; `tests/integration/container-contract.test.mjs` verifies the project-only container topology without Docker. Docker-backed ARM64 proof is restricted to the disposable CI job in `.github/workflows/ci.yml`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
