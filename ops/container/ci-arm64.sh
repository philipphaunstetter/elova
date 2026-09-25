#!/usr/bin/env bash
# Disposable authorized GitHub ARM64 runner ONLY. Never run on GX10 or with real secrets.
set -euo pipefail
[[ "${CI:-}" == true && "${RUNNER_ARCH:-}" == ARM64 && "${GITHUB_ACTIONS:-}" == true ]] || {
  echo 'Disposable GitHub ARM64 CI only' >&2; exit 1;
}
cd "$(dirname "$0")/../.."
secrets_dir=$(mktemp -d "${RUNNER_TEMP}/elova-ci-secrets.XXXXXX")
export ELOVA_SECRETS_DIR="$secrets_dir" ELOVA_TAILNET_IP=127.0.0.1
compose=(docker compose -f ops/container/compose.yaml)
cleanup() {
  "${compose[@]}" --profile activate down --volumes --remove-orphans >/dev/null 2>&1 || true
  sudo rm -rf -- "$secrets_dir"
}
trap cleanup EXIT
chmod 0711 "$secrets_dir"
# Synthetic per-run secrets exist only on the disposable runner, never in the repository or image.
openssl rand -hex 32 > "$secrets_dir/postgres_admin"
openssl rand -hex 32 > "$secrets_dir/postgres_app"
openssl rand -base64 32 > "$secrets_dir/session_key"
openssl rand -base64 32 > "$secrets_dir/credential_key"
printf 'postgresql://elova_backend:%s@postgres:5432/elova_vnext\n' "$(cat "$secrets_dir/postgres_app")" > "$secrets_dir/database_url"
chmod 0400 "$secrets_dir"/*
sudo chown 70:70 "$secrets_dir/postgres_admin" "$secrets_dir/postgres_app"
sudo chown 10001:10001 "$secrets_dir/database_url" "$secrets_dir/session_key" "$secrets_dir/credential_key"

# No push: record source/lock/base and the local candidate artifact hash/image ID.
sha256sum package-lock.json ops/container/Dockerfile.backend
export ELOVA_BACKEND_IMAGE=elova-ci:"${GITHUB_SHA}"
"${compose[@]}" config --quiet
postgres_image=$("${compose[@]}" config --format json | node -e '
  const image = JSON.parse(require("node:fs").readFileSync(0, "utf8")).services.postgres.image;
  if (!/^postgres:16-alpine@sha256:[a-f0-9]{64}$/.test(image)) process.exit(1);
  process.stdout.write(image);
')
docker pull --platform linux/arm64 "$postgres_image"
[[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$postgres_image")" == linux/arm64 ]]
docker build --platform linux/arm64 -f ops/container/Dockerfile.backend -t "$ELOVA_BACKEND_IMAGE" .
docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}} {{.Config.User}}' "$ELOVA_BACKEND_IMAGE"
[[ "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$ELOVA_BACKEND_IMAGE")" == linux/arm64 ]]
[[ "$(docker image inspect --format '{{.Config.User}}' "$ELOVA_BACKEND_IMAGE")" == 10001:10001 ]]
[[ "$(docker image inspect --format '{{json .Config.Cmd}}' "$ELOVA_BACKEND_IMAGE")" == '["node","dist/src/server.js"]' ]]
docker run --rm --network none --entrypoint node "$ELOVA_BACKEND_IMAGE" -e '
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  assert.ok(fs.existsSync("dist/src/server.js"));
  assert.ok(fs.existsSync("dist/src/migrate.js"));
  assert.ok(fs.existsSync("migrations/0001_postgres_authority.sql"));
  for (const path of ["dist/test", "src", "/app/apps/frontend", "/app/node_modules/next", "/run/secrets/database_url"]) assert.ok(!fs.existsSync(path), path);
'
docker save "$ELOVA_BACKEND_IMAGE" | sha256sum
"${compose[@]}" up -d postgres
for _ in $(seq 1 40); do
  if "${compose[@]}" exec -T postgres pg_isready -U postgres -d elova_vnext >/dev/null 2>&1; then break; fi
  sleep 2
done
"${compose[@]}" exec -T postgres pg_isready -U postgres -d elova_vnext >/dev/null
for _ in $(seq 1 30); do
  role=$("${compose[@]}" exec -T --user postgres postgres psql -U postgres -d elova_vnext -tAc "SELECT count(*) FROM pg_roles WHERE rolname = 'elova_backend' AND NOT rolsuper" 2>/dev/null || true)
  if [[ "$role" == 1 ]]; then break; fi
  sleep 2
done
[[ "$role" == 1 ]] || { echo 'Elova app role was not initialized' >&2; exit 1; }
# Profile is off by default even after ordinary up; activation here is CI-only, deliberate.
[[ "$("${compose[@]}" ps --status running --services)" == postgres ]]
"${compose[@]}" --profile activate up -d --no-deps backend
for _ in $(seq 1 30); do
  status=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:43181/v1/health/ready || true)
  if [[ "$status" == 503 ]]; then break; fi
  sleep 2
done
[[ "$status" == 503 ]] || { echo 'Expected 503 before deliberate migration' >&2; exit 1; }
"${compose[@]}" stop backend
# A run job does not publish the service's host port, start dependencies or activate the API.
"${compose[@]}" run --rm --no-deps --no-TTY --no-ports backend node dist/src/migrate.js
"${compose[@]}" run --rm --no-deps --no-TTY --no-ports backend node --input-type=module -e '
  import assert from "node:assert/strict";
  import { Pool } from "pg";
  import { loadConfig } from "./dist/src/config.js";
  import { loadMigrations } from "./dist/src/migrations.js";
  const config = loadConfig();
  const expected = await loadMigrations(config.migrationsDirectory);
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    assert.equal(expected.length, 1);
    const { rows } = await pool.query("SELECT name, checksum FROM schema_migrations");
    assert.deepEqual(rows, expected.map(({name, checksum}) => ({name, checksum})));
    const identity = await pool.query("SELECT current_user, current_schema()");
    assert.deepEqual(identity.rows[0], {current_user: "elova_backend", current_schema: "elova"});
  } finally { await pool.end(); }
'
"${compose[@]}" --profile activate up -d --no-deps backend
for _ in $(seq 1 30); do
  status=$(curl -sS -o "$secrets_dir/ready-response" -w '%{http_code}' http://127.0.0.1:43181/v1/health/ready || true)
  if [[ "$status" == 200 ]]; then break; fi
  sleep 2
done
[[ "$status" == 200 ]] || { echo 'Expected 200 after deliberate migration' >&2; exit 1; }
node -e 'const a=require("node:assert/strict"); const r=JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); a.equal(r.status,"ready"); a.deepEqual(r.checks,{database:"ready",migrations:"ready"})' "$secrets_dir/ready-response"
"${compose[@]}" restart backend
curl --retry 10 --retry-connrefused --retry-delay 2 --fail --silent http://127.0.0.1:43181/v1/health/ready >/dev/null
