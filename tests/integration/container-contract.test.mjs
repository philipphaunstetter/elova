import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import yaml from 'js-yaml'

const composeText = readFileSync('ops/container/compose.yaml', 'utf8')
const config = yaml.load(composeText.replaceAll(/\$\{[^}]+\}/g, 'synthetic'))
const { postgres, backend } = config.services

test('only two project-owned services, networks and protected database volume', () => {
  assert.equal(config.name, 'elova')
  assert.deepEqual(Object.keys(config.services).sort(), ['backend', 'postgres'])
  assert.deepEqual(Object.keys(config.networks).sort(), ['elova_db', 'elova_edge'])
  assert.equal(config.networks.elova_db.internal, true)
  assert.equal(config.networks.elova_db.external, undefined)
  assert.equal(config.networks.elova_edge.external, undefined)
  assert.deepEqual(Object.keys(config.volumes), ['elova_pg16_data'])
  assert.deepEqual(postgres.networks, ['elova_db'])
  assert.deepEqual(backend.networks, ['elova_db', 'elova_edge'])
  assert.equal(postgres.ports, undefined)
  assert.equal(postgres.expose, undefined)
  assert.equal(postgres.volumes[0], 'elova_pg16_data:/var/lib/postgresql/data')
})

test('backend activation and migrations are distinct from default database startup', () => {
  assert.deepEqual(backend.profiles, ['activate'])
  assert.equal(backend.restart, 'no')
  assert.equal(postgres.restart, 'no')
  assert.equal(backend.pull_policy, 'never')
  assert.equal(postgres.pull_policy, 'never')
  assert.equal(backend.build, undefined)
  assert.deepEqual(backend.ports, ['synthetic:43181:43181/tcp'])
  assert.deepEqual(Object.keys(backend.environment).sort(), [
    'DATABASE_URL_FILE', 'ELOVA_BACKEND_HOST', 'ELOVA_CREDENTIAL_KEY_FILE',
    'ELOVA_RUNTIME', 'ELOVA_SESSION_SECRET_FILE', 'PORT',
  ])
  assert.equal(backend.command, undefined)
  assert.equal(backend.entrypoint, undefined)
  assert.equal(postgres.command, undefined)
  assert.equal(backend.read_only, true)
  assert.deepEqual(backend.cap_drop, ['ALL'])
})

for (const platform of ['linux/arm64', 'linux/amd64']) {
  test(`disposable CI obtains pinned PostgreSQL for ${platform} before building`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'elova-arm64-preflight-'))
    try {
      const bin = join(dir, 'bin')
      const fixture = join(dir, 'compose.json')
      const log = join(dir, 'docker.log')
      mkdirSync(bin)
      writeFileSync(fixture, JSON.stringify(config))
      writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$*" in
  'compose -f ops/container/compose.yaml config --quiet') ;;
  'compose -f ops/container/compose.yaml config --format json') /bin/cat "$COMPOSE_FIXTURE" ;;
  'compose -f ops/container/compose.yaml --profile activate down --volumes --remove-orphans') ;;
  'pull --platform linux/arm64 '*) ;;
  'image inspect --format {{.Os}}/{{.Architecture}} '*) printf '%s\n' "$MOCK_PLATFORM" ;;
  'build --platform linux/arm64 '*) exit 42 ;;
  *) exit 96 ;;
esac
`, { mode: 0o755 })
      writeFileSync(join(bin, 'sudo'), `#!/usr/bin/env bash
if [[ "$1" == rm ]]; then shift; exec /bin/rm "$@"; fi
if [[ "$1" == chown ]]; then exit 0; fi
exit 96
`, { mode: 0o755 })
      const run = spawnSync('bash', ['ops/container/ci-arm64.sh'], {
        encoding: 'utf8', timeout: 10000,
        env: {
          ...process.env, PATH: `${bin}:${process.env.PATH}`,
          CI: 'true', RUNNER_ARCH: 'ARM64', GITHUB_ACTIONS: 'true', RUNNER_TEMP: dir,
          GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567',
          DOCKER_LOG: log, COMPOSE_FIXTURE: fixture, MOCK_PLATFORM: platform,
        },
      })
      assert.equal(run.status, platform === 'linux/arm64' ? 42 : 1, run.stderr)
      const calls = readFileSync(log, 'utf8').trim().split('\n')
      const image = postgres.image
      const pull = calls.indexOf(`pull --platform linux/arm64 ${image}`)
      assert.ok(pull >= 0, calls.join('\n'))
      assert.equal(calls[pull + 1], `image inspect --format {{.Os}}/{{.Architecture}} ${image}`)
      assert.equal(calls.some(call => call.startsWith('build --platform')), platform === 'linux/arm64')
      assert.equal(calls.some(call => call.includes('up -d postgres')), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
