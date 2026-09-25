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

source "$HELPER"
frontend_env="$TMP/frontend.env"
for allowed_origin in \
  http://100.64.0.1:43181 \
  http://100.127.255.254:43181 \
  http://gx10.example-tailnet.ts.net:43181 \
  'http://[fd7a:115c:a1e0::1]:43181'; do
  printf 'ELOVA_BACKEND_URL=%s\n' "$allowed_origin" > "$frontend_env"
  check_frontend_env "$frontend_env" || fail "Tailnet HTTP origin was rejected: $allowed_origin"
done
for rejected_origin in \
  http://10.0.0.2:43181 \
  http://192.168.0.2:43181 \
  http://169.254.0.2:43181 \
  http://gx10:43181 \
  http://gx10.internal:43181 \
  http://gx10.local:43181 \
  http://api.example.com:43181 \
  https://gx10.example-tailnet.ts.net:43181 \
  'http://[fd00::1]:43181'; do
  printf 'ELOVA_BACKEND_URL=%s\n' "$rejected_origin" > "$frontend_env"
  if (check_frontend_env "$frontend_env") >"$TMP/out" 2>&1; then
    fail "unsupported backend origin was accepted: $rejected_origin"
  fi
done
ok 'frontend preflight accepts only Tailnet HTTP origins'

printf 'ELOVA_BACKEND_URL=http://100.100.10.20:43181\nDATABASE_URL=postgresql://frontend-must-not-receive-this\n' > "$frontend_env"
if (check_frontend_env "$frontend_env") >"$TMP/out" 2>&1; then
  fail 'frontend environment accepted backend database configuration'
fi
grep -Fq 'must not define backend-only DATABASE_URL' "$TMP/out" ||
  fail 'frontend database variable refusal was not explicit'
ok 'frontend preflight rejects backend-only database configuration'

printf 'ELOVA_BACKEND_URL=http://100.100.10.20:43181\nELOVA_SESSION_SECRET=frontend-must-not-receive-this\n' > "$frontend_env"
if (check_frontend_env "$frontend_env") >"$TMP/out" 2>&1; then
  fail 'frontend environment accepted backend session configuration'
fi
grep -Fq 'must not define backend-only ELOVA_SESSION_SECRET' "$TMP/out" ||
  fail 'frontend session variable refusal was not explicit'
ok 'frontend preflight rejects backend-only session configuration'

for local_database in \
  'postgresql://localhost:5432/elova?sslmode=disable' \
  'postgresql://127.0.0.1:5432/elova' \
  'postgresql://[::1]:5432/elova' \
  'postgresql:///elova?host=%2Fvar%2Frun%2Fpostgresql'; do
  check_database_url "$local_database" || fail 'same-host PostgreSQL URL was rejected'
done
for remote_database in \
  'postgresql:///elova' \
  'postgresql://10.0.0.2:5432/elova' \
  'postgresql://database.internal:5432/elova' \
  'postgresql:///elova?host=database.internal'; do
  if (check_database_url "$remote_database") >"$TMP/out" 2>&1; then
    fail 'non-loopback PostgreSQL URL was accepted'
  fi
done
ok 'backend preflight accepts only same-host PostgreSQL transports'

release_root="$TMP/staged-release"
marker="$TMP/migration-marker"
mkdir -p "$release_root"
digest=$(printf 'verified artifact' | sha256sum | awk '{print $1}')
printf '%s\n' "$digest" > "$release_root/$RELEASE_DIGEST_FILE"
printf '%s\n' "$digest" > "$marker"
require_matching_migration_marker "$release_root" "$marker" ||
  fail 'artifact-matching migration marker was rejected'
printf '%064d\n' 0 > "$marker"
if (require_matching_migration_marker "$release_root" "$marker") >"$TMP/out" 2>&1; then
  fail 'migration marker for another artifact was accepted'
fi
grep -Fq 'does not match staged artifact' "$TMP/out" || fail 'artifact mismatch refusal was not explicit'
if (require_unused_migration_identity "$marker" reused-release) >"$TMP/out" 2>&1; then
  fail 'reused backend release identity was accepted'
fi
grep -Fq 'already has a migration record' "$TMP/out" || fail 'release identity reuse refusal was not explicit'
ok 'migration markers are bound to one staged artifact identity'

systemctl_log="$TMP/systemctl.log"
health_log="$TMP/health.log"
systemctl_status=0
health_status=0
systemctl() { printf '%s\n' "$*" >> "$systemctl_log"; return "$systemctl_status"; }
wait_for_health() { printf '%s\n' "$1" >> "$health_log"; return "$health_status"; }
activation_root="$TMP/activation"
mkdir -p "$activation_root/releases"/{release-a,release-b,release-c}
ln -s releases/release-a "$activation_root/current"
ln -s releases/release-b "$activation_root/previous"
restore_release_state \
  "$activation_root" release-b 1 release-a elova-backend.service 0
[[ $(link_release_name "$activation_root" current) == release-b ]] ||
  fail 'failed rollback did not restore the contained backend link'
[[ $(link_release_name "$activation_root" previous) == release-a ]] ||
  fail 'failed rollback did not restore the previous backend link'
[[ $(<"$systemctl_log") == 'stop elova-backend.service' ]] ||
  fail 'a previously stopped backend was restarted during restoration'
[[ ! -s $health_log ]] || fail 'a previously stopped backend was health checked'
: > "$systemctl_log"
set_link "$activation_root" current releases/release-c
set_link "$activation_root" previous releases/release-b
restore_release_state \
  "$activation_root" release-b 1 release-a elova-backend.service 1
[[ $(<"$systemctl_log") == 'restart elova-backend.service' ]] ||
  fail 'a previously active backend was not restarted during restoration'
[[ $(<"$health_log") == 'elova-backend.service' ]] ||
  fail 'restored active backend was not readiness checked'
: > "$systemctl_log"
: > "$health_log"
systemctl_status=1
if restore_release_state \
  "$activation_root" release-b 1 release-a elova-backend.service 1; then
  fail 'service restoration failure was hidden'
fi
[[ $(<"$systemctl_log") == 'restart elova-backend.service' ]] ||
  fail 'failed service restoration did not attempt the prior state'
[[ ! -s $health_log ]] || fail 'readiness ran after a failed service restart'
: > "$systemctl_log"
systemctl_status=0
health_status=1
if restore_release_state \
  "$activation_root" release-b 1 release-a elova-backend.service 1; then
  fail 'restored service readiness failure was hidden'
fi
[[ $(<"$systemctl_log") == 'restart elova-backend.service' ]] ||
  fail 'unready service restoration did not restart the prior state'
[[ $(<"$health_log") == 'elova-backend.service' ]] ||
  fail 'unready restored service was not readiness checked'
health_status=0
ok 'failed release restoration preserves state and requires readiness'

owned_pid=$$
listener_pid=$owned_pid
pid_in_control_group() { [[ $1 == "$owned_pid" && $2 == /test-unit ]]; }
systemctl() {
  case "$3" in
    --property=ActiveState) printf 'active\n' ;;
    --property=MainPID) printf '%s\n' "$owned_pid" ;;
    --property=ControlGroup) printf '/test-unit\n' ;;
    *) return 1 ;;
  esac
}
listener_host=127.0.0.1
listener_port=43180
extra_listener=''
ss() {
  [[ -n $listener_host ]] || return 0
  printf 'LISTEN 0 511 %s:%s 0.0.0.0:* users:(("node",pid=%s,fd=20))\n' "$listener_host" "$listener_port" "$listener_pid"
  if [[ -n $extra_listener ]]; then
    printf 'LISTEN 0 511 %s:%s 0.0.0.0:* users:(("node",pid=%s,fd=21))\n' "$extra_listener" "$listener_port" "$listener_pid"
  fi
}
service=frontend
unit_owns_listener elova-frontend.service || fail 'unit-owned listener was rejected'
check_port_conflicts || fail 'the existing frontend unit listener was rejected'
listener_pid=999999
if unit_owns_listener elova-frontend.service; then
  fail 'listener outside the unit control group was accepted'
fi
if (check_port_conflicts) >"$TMP/out" 2>&1; then
  fail 'port occupied by another process was accepted'
fi
listener_pid=$owned_pid
listener_host=0.0.0.0
if (check_port_conflicts) >"$TMP/out" 2>&1; then
  fail 'wildcard listener on the frontend port was accepted'
fi
listener_host=''
check_port_conflicts || fail 'unoccupied frontend port was rejected'
ok 'listener checks require the intended unit-owned, loopback listener'

service=backend
listener_host=100.64.0.1
listener_port=43181
printf 'ELOVA_BACKEND_HOST=100.64.0.1\n' > "$TMP/backend-listener.env"
env_file() { printf '%s\n' "$TMP/backend-listener.env"; }
check_port_conflicts || fail 'unit-owned Tailnet backend listener was rejected'
extra_listener=0.0.0.0
if (check_port_conflicts) >"$TMP/out" 2>&1; then
  fail 'additional public listener on the backend port was accepted'
fi
extra_listener=''
listener_host=0.0.0.0
if (check_port_conflicts) >"$TMP/out" 2>&1; then
  fail 'public backend wildcard listener was accepted'
fi
ok 'backend conflict check requires only the configured Tailnet bind'
service=frontend

(
  service=frontend
  release=release-b
  artifact="$TMP/frontend.tgz"
  sha256_file="$TMP/frontend.sha256"
  apply=0
  dry_run_requested=0
  artifact_preflight() { :; }
  host_preflight() { printf 'host\n' >> "$TMP/preflight-events"; }
  check_port_conflicts() { printf 'port\n' >> "$TMP/preflight-events"; }
  run_preflight > "$TMP/preflight-out"
) || fail 'explicit read-only preflight failed'
[[ $(<"$TMP/preflight-events") == $'host\nport' ]] ||
  fail 'explicit preflight did not inspect the port after host checks'
: > "$TMP/preflight-events"
(
  service=frontend
  release=release-b
  artifact="$TMP/frontend.tgz"
  sha256_file="$TMP/frontend.sha256"
  apply=0
  dry_run_requested=1
  artifact_preflight() { :; }
  host_preflight() { printf 'host\n' >> "$TMP/preflight-events"; }
  check_port_conflicts() { printf 'port\n' >> "$TMP/preflight-events"; }
  run_preflight > "$TMP/preflight-out"
) || fail 'dry-run preflight failed'
[[ ! -s $TMP/preflight-events ]] || fail 'dry-run preflight inspected the host'
ok 'explicit read-only preflight checks the listener; dry-run does not'

activation_fixture="$TMP/port-activation"
mkdir -p "$activation_fixture/releases"/{release-a,release-b}
ln -s releases/release-a "$activation_fixture/current"
ln -s releases/release-b "$activation_fixture/previous"
for action in activate rollback; do
  if (
    service=frontend
    release=release-b
    apply=1
    service_root() { printf '%s\n' "$activation_fixture"; }
    host_preflight() { :; }
    acquire_lock() { :; }
    require_apply() { return 0; }
    check_package_manifest() { :; }
    health_url() { printf 'http://127.0.0.1:43180/api/v1/health/ready\n'; }
    systemctl() {
      if [[ $1 == is-active ]]; then return 0; fi
      printf '%s\n' "$*" >> "$TMP/port-activation-systemctl"
    }
    check_port_conflicts() {
      [[ $(link_release_name "$activation_fixture" current) == release-a ]] ||
        fail "$action changed the current link before checking the port"
      die 'simulated occupied service port'
    }
    "run_$action"
  ) >"$TMP/port-activation-out" 2>&1; then
    fail "$action proceeded despite an occupied port"
  fi
  grep -Fq 'simulated occupied service port' "$TMP/port-activation-out" ||
    fail "$action did not check the port before changing links"
  [[ $(link_release_name "$activation_fixture" current) == release-a ]] ||
    fail "$action changed the current link on a port conflict"
  [[ $(link_release_name "$activation_fixture" previous) == release-b ]] ||
    fail "$action changed the previous link on a port conflict"
  [[ ! -e $TMP/port-activation-systemctl ]] || fail "$action restarted a unit on a port conflict"
done
ok 'activation and rollback recheck the port before links or restart'

health_headers="$TMP/health.headers"
health_body="$TMP/health.body"
printf 'HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\n\r\n' > "$health_headers"
printf '{"status":"ready","checks":{"database":"ready","migrations":"ready"}}' > "$health_body"
validate_health_response "$health_headers" "$health_body" || fail 'frontend readiness contract was rejected'
service=backend
if validate_health_response "$health_headers" "$health_body"; then
  fail 'backend readiness without an API version was accepted'
fi
printf 'HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nX-Elova-Api-Version: 1\r\n\r\n' > "$health_headers"
validate_health_response "$health_headers" "$health_body" || fail 'backend readiness contract was rejected'
printf '{"status":"not_ready","checks":{"database":"ready","migrations":"ready"}}' > "$health_body"
if validate_health_response "$health_headers" "$health_body"; then
  fail 'not-ready response passed the activation contract'
fi
ok 'activation accepts only the expected readiness contract'

printf '1..%d\n' "$pass"
