# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Start at `README.md` for the PostgreSQL-only vNext architecture and `ops/docs/native-services-runbook.md` for native packaging, migrations, owner bootstrap, and operator-only host boundaries. Release archives must come from a clean committed checkout via `npm run package:native -- <output-outside-repo>`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
