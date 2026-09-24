#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
HELPER="$ROOT/ops/bin/elova-native-release"
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT

pass=0
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
ok() { pass=$((pass + 1)); printf 'ok %d - %s\n' "$pass" "$1"; }

make_artifact() {
  local service=$1 package=$2 directory
  directory="$TMP/$service/package"
  mkdir -p "$directory"
  printf '{"name":"%s","scripts":{"start":"node server.js","migrate":"node migrate.js"}}\n' "$package" > "$directory/package.json"
  printf 'process.exit(0)\n' > "$directory/server.js"
  printf 'process.exit(0)\n' > "$directory/migrate.js"
  if [[ $service == backend ]]; then
    mkdir -p "$directory/migrations"
    printf 'SELECT 1;\n' > "$directory/migrations/0001_baseline.sql"
  fi
  tar -C "$TMP/$service" -czf "$TMP/$service.tgz" package
  sha256sum "$TMP/$service.tgz" > "$TMP/$service.sha256"
}

make_artifact frontend @elova/frontend
make_artifact backend @elova/backend

out=$(
  "$HELPER" stage --service frontend --artifact "$TMP/frontend.tgz" \
    --sha256-file "$TMP/frontend.sha256" --release test-001 --dry-run
) || fail 'valid stage dry-run unexpectedly failed'
grep -Fq 'would not activate, migrate, or restart a service' <<< "$out" || fail 'dry-run did not promise service isolation'
[[ ! -e /opt/elova/frontend/releases/test-001 ]] || fail 'dry-run created a release'
ok 'stage dry-run verifies but does not deploy or touch services'

printf '%064d\n' 0 > "$TMP/bad.sha256"
if "$HELPER" stage --service frontend --artifact "$TMP/frontend.tgz" \
  --sha256-file "$TMP/bad.sha256" --release test-002 --dry-run >"$TMP/out" 2>&1; then
  fail 'bad SHA-256 was accepted'
fi
grep -Fq 'SHA-256 mismatch' "$TMP/out" || fail 'bad SHA-256 refusal was not explicit'
ok 'digest mismatch is refused'

if "$HELPER" stage --service backend --artifact "$TMP/frontend.tgz" \
  --sha256-file "$TMP/frontend.sha256" --release test-003 --dry-run >"$TMP/out" 2>&1; then
  fail 'wrong package identity was accepted'
fi
grep -Fq 'expected package @elova/backend' "$TMP/out" || fail 'package identity refusal was not explicit'
ok 'cross-service artifact is refused'

if "$HELPER" migrate --service frontend --release test-004 --dry-run >"$TMP/out" 2>&1; then
  fail 'frontend migration was accepted'
fi
grep -Fq 'migrate requires --service backend' "$TMP/out" || fail 'frontend migration refusal was not explicit'
ok 'migration is backend-only and explicit'

if "$HELPER" activate --service backend --release '../escape' --dry-run >"$TMP/out" 2>&1; then
  fail 'unsafe release identifier was accepted'
fi
grep -Fq -- '--release must be' "$TMP/out" || fail 'unsafe release refusal was not explicit'
ok 'unsafe release identifiers are refused'

out=$("$HELPER" activate --service backend --release test-forward --dry-run) || fail 'backend activation dry-run failed'
grep -Fq 'reject activation to a lower migration count' <<< "$out" || fail 'activation plan omitted lower-migration refusal'
grep -Fq 'before changing release links' <<< "$out" || fail 'activation plan did not preserve release links'
ok 'backend activation refuses lower migration counts before mutation'

mkdir -p "$TMP/no-migrate/package"
printf '{"name":"@elova/backend","scripts":{"start":"node server.js"}}\n' > "$TMP/no-migrate/package/package.json"
printf 'process.exit(0)\n' > "$TMP/no-migrate/package/server.js"
tar -C "$TMP/no-migrate" -czf "$TMP/no-migrate.tgz" package
sha256sum "$TMP/no-migrate.tgz" > "$TMP/no-migrate.sha256"
if "$HELPER" stage --service backend --artifact "$TMP/no-migrate.tgz" \
  --sha256-file "$TMP/no-migrate.sha256" --release test-005 --dry-run >"$TMP/out" 2>&1; then
  fail 'backend artifact without a migration script was accepted'
fi
grep -Fq 'has no explicit migrate script' "$TMP/out" || fail 'missing migration refusal was not explicit'
ok 'backend artifacts require an explicit migration script'

mkdir -p "$TMP/no-migrations/package"
printf '{"name":"@elova/backend","scripts":{"start":"node server.js","migrate":"node migrate.js"}}\n' > "$TMP/no-migrations/package/package.json"
printf 'process.exit(0)\n' > "$TMP/no-migrations/package/server.js"
printf 'process.exit(0)\n' > "$TMP/no-migrations/package/migrate.js"
tar -C "$TMP/no-migrations" -czf "$TMP/no-migrations.tgz" package
sha256sum "$TMP/no-migrations.tgz" > "$TMP/no-migrations.sha256"
if "$HELPER" stage --service backend --artifact "$TMP/no-migrations.tgz" \
  --sha256-file "$TMP/no-migrations.sha256" --release test-006 --dry-run >"$TMP/out" 2>&1; then
  fail 'backend artifact without release-owned migrations was accepted'
fi
grep -Fq 'has no migrations directory' "$TMP/out" || fail 'missing migrations directory refusal was not explicit'
ok 'backend artifacts require release-owned migrations'

if "$HELPER" stage --service frontend --artifact "$TMP/frontend.tgz" \
  --sha256-file "$TMP/frontend.sha256" --release test-007 --apply --dry-run >"$TMP/out" 2>&1; then
  fail 'conflicting mutation flags were accepted'
fi
grep -Fq 'mutually exclusive' "$TMP/out" || fail 'conflicting flag refusal was not explicit'
ok 'apply and dry-run gates cannot be combined'

out=$("$HELPER" rollback --service backend --dry-run) || fail 'rollback dry-run failed'
grep -Fq 'would acquire backend deployment lock' <<< "$out" || fail 'rollback plan omitted lock'
grep -Fq 'migration-count mismatch' <<< "$out" || fail 'rollback plan omitted migration-count refusal'
grep -Fq 'forward fix' <<< "$out" || fail 'rollback plan omitted forward-fix requirement'
grep -Fq 'readiness convergence' <<< "$out" || fail 'rollback plan omitted readiness'
ok 'backend rollback refuses migration-count mismatches and remains readiness-gated'

printf '1..%d\n' "$pass"
