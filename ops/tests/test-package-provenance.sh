#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT
mkdir -p "$TMP/repo/ops/bin" "$TMP/repo/apps/backend/dist" "$TMP/repo/apps/frontend" "$TMP/bin" "$TMP/output"
cp -- "$ROOT/ops/bin/elova-package-native" "$TMP/repo/ops/bin/"
printf 'committed source\n' > "$TMP/repo/source.txt"
printf '/apps/backend/dist/\n/apps/frontend/.next/\n.env*\n' > "$TMP/repo/.gitignore"
printf '{"name":"@elova/backend","dependencies":{}}\n' > "$TMP/repo/apps/backend/package.json"
printf '{"name":"@elova/frontend","version":"0.1.0"}\n' > "$TMP/repo/apps/frontend/package.json"
printf 'previous build\n' > "$TMP/repo/apps/backend/dist/sentinel.js"
printf '#!/bin/sh\nprintf "npm reached\\n" >&2\nexit 42\n' > "$TMP/bin/npm"
chmod +x "$TMP/bin/npm"
git -C "$TMP/repo" init -q
git -C "$TMP/repo" add .gitignore ops/bin/elova-package-native source.txt apps/backend/package.json apps/frontend/package.json
git -C "$TMP/repo" -c user.name=Fixture -c user.email=fixture@example.test commit -qm initial

check_rejected() {
  if ELOVA_BUILD_ID=synthetic-build PATH="$TMP/bin:$PATH" \
    "$TMP/repo/ops/bin/elova-package-native" "$TMP/output" >"$TMP/out" 2>&1; then
    echo 'dirty source was packaged' >&2; exit 1
  fi
  grep -Fq 'source checkout has uncommitted or untracked files' "$TMP/out"
  if grep -Fq 'npm reached' "$TMP/out"; then
    echo 'build ran despite dirty source' >&2; exit 1
  fi
  test -f "$TMP/repo/apps/backend/dist/sentinel.js"
}

printf 'local edit\n' >> "$TMP/repo/source.txt"
check_rejected
git -C "$TMP/repo" restore source.txt
printf 'untracked source\n' > "$TMP/repo/new-source.ts"
check_rejected
rm -- "$TMP/repo/new-source.ts"
printf 'synthetic credential\n' > "$TMP/repo/apps/frontend/.env.production"
if ELOVA_BUILD_ID=synthetic-build PATH="$TMP/bin:$PATH" \
  "$TMP/repo/ops/bin/elova-package-native" "$TMP/output" >"$TMP/out" 2>&1; then
  echo 'ignored frontend environment was packaged' >&2; exit 1
fi
grep -Fq 'frontend environment file present' "$TMP/out"
if grep -Fq 'npm reached' "$TMP/out"; then
  echo 'build ran despite ignored frontend environment' >&2; exit 1
fi
test -f "$TMP/repo/apps/backend/dist/sentinel.js"
rm -- "$TMP/repo/apps/frontend/.env.production"

# Clean source must pass the provenance gate, then reach the (stubbed) build.
if ELOVA_BUILD_ID=synthetic-build PATH="$TMP/bin:$PATH" \
  "$TMP/repo/ops/bin/elova-package-native" "$TMP/output" >"$TMP/out" 2>&1; then
  echo 'stubbed build unexpectedly succeeded' >&2; exit 1
fi
grep -Fq 'npm reached' "$TMP/out"

cat > "$TMP/bin/npm" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
root=$(git rev-parse --show-toplevel)
if [[ $1 == run && $2 == build ]]; then
  mkdir -p "$root/apps/backend/dist/src" \
    "$root/apps/frontend/.next/standalone/apps/frontend" \
    "$root/apps/frontend/.next/standalone/node_modules/next" \
    "$root/apps/frontend/.next/static"
  printf "server\n" > "$root/apps/backend/dist/src/server.js"
  printf "server\n" > "$root/apps/frontend/.next/standalone/apps/frontend/server.js"
  printf "{}\n" > "$root/apps/frontend/.next/standalone/node_modules/next/package.json"
  printf "static\n" > "$root/apps/frontend/.next/static/index.txt"
  printf "{}\n" > "$root/apps/frontend/.next/standalone/package.json"
  if [[ ${INJECT_ENV:-} == frontend ]]; then
    printf "synthetic credential\n" > "$root/apps/frontend/.next/standalone/apps/frontend/.env.production"
  fi
elif [[ $1 == pack ]]; then
  destination=$5
  mkdir -p "$destination/fixture/package/node_modules/pg"
  cp "$root/apps/backend/package.json" "$destination/fixture/package/package.json"
  printf "{}\n" > "$destination/fixture/package/node_modules/pg/package.json"
  if [[ ${INJECT_ENV:-} == backend ]]; then
    printf "synthetic credential\n" > "$destination/fixture/package/owner.env"
  fi
  tar -czf "$destination/backend-fixture.tgz" -C "$destination/fixture" package
  printf "backend-fixture.tgz\n"
else
  exit 1
fi
SCRIPT
chmod +x "$TMP/bin/npm"

for source in backend frontend; do
  if ELOVA_BUILD_ID=synthetic-build INJECT_ENV="$source" PATH="$TMP/bin:$PATH" \
    "$TMP/repo/ops/bin/elova-package-native" "$TMP/output" >"$TMP/out" 2>&1; then
    echo "$source environment was archived" >&2; exit 1
  fi
  grep -Fq 'packaged releases may not contain environment files' "$TMP/out" || { cat "$TMP/out" >&2; exit 1; }
  test ! -e "$TMP/output/elova-$source.tgz"
done

ELOVA_BUILD_ID=synthetic-build PATH="$TMP/bin:$PATH" \
  "$TMP/repo/ops/bin/elova-package-native" "$TMP/output" >"$TMP/out" 2>&1
for service in backend frontend; do
  archive="$TMP/output/elova-$service.tgz"
  test -f "$archive"
  (cd "$TMP/output" && sha256sum -c "elova-$service.tgz.sha256") >/dev/null
  mkdir -p "$TMP/unpacked/$service"
  tar -xzf "$archive" -C "$TMP/unpacked/$service"
  test -f "$TMP/unpacked/$service/package/package.json"
  if find "$TMP/unpacked/$service" -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' -o -name '*.env.*' \) -print -quit | grep -q .; then
    echo "$service archive includes an environment file" >&2; exit 1
  fi
done
printf 'ok - dirty, ignored and staged environment files refused; clean archives verified\n'
