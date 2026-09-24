#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/repo/ops/bin" "$TMP/repo/apps/backend/dist" "$TMP/bin" "$TMP/output"
cp -- "$ROOT/ops/bin/elova-package-native" "$TMP/repo/ops/bin/"
printf 'committed source\n' > "$TMP/repo/source.txt"
printf '/apps/backend/dist/\n/apps/frontend/.next/\n' > "$TMP/repo/.gitignore"
printf 'previous build\n' > "$TMP/repo/apps/backend/dist/sentinel.js"
printf '#!/bin/sh\nprintf "npm reached\\n" >&2\nexit 42\n' > "$TMP/bin/npm"
chmod +x "$TMP/bin/npm"
git -C "$TMP/repo" init -q
git -C "$TMP/repo" add .gitignore ops/bin/elova-package-native source.txt
git -C "$TMP/repo" -c user.name=Fixture -c user.email=fixture@example.test commit -qm initial

check_rejected() {
  if ELOVA_BUILD_ID=synthetic-build PATH="$TMP/bin:$PATH" \
    "$TMP/repo/ops/bin/elova-package-native" "$TMP/output" >"$TMP/out" 2>&1; then
    echo 'dirty source was packaged' >&2; exit 1
  fi
  grep -Fq 'source checkout has uncommitted or untracked files' "$TMP/out"
  ! grep -Fq 'npm reached' "$TMP/out"
  test -f "$TMP/repo/apps/backend/dist/sentinel.js"
}

printf 'local edit\n' >> "$TMP/repo/source.txt"
check_rejected
git -C "$TMP/repo" restore source.txt
printf 'untracked source\n' > "$TMP/repo/new-source.ts"
check_rejected
rm -- "$TMP/repo/new-source.ts"

# Clean source must pass the provenance gate, then reach the (stubbed) build.
if ELOVA_BUILD_ID=synthetic-build PATH="$TMP/bin:$PATH" \
  "$TMP/repo/ops/bin/elova-package-native" "$TMP/output" >"$TMP/out" 2>&1; then
  echo 'stubbed build unexpectedly succeeded' >&2; exit 1
fi
grep -Fq 'npm reached' "$TMP/out"
printf 'ok - dirty and untracked checkout refused before build; clean checkout reaches build\n'
