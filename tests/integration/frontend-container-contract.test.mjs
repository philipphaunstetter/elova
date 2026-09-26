import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import yaml from 'js-yaml'

// Normalize Compose interpolation to safe, non-sensitive fixture values before
// interpreting YAML. These checks use the parsed deployment model, not Docker.
const composeSource = readFileSync('ops/container/compose.frontend.yaml', 'utf8')
const model = yaml.load(composeSource
  .replaceAll(/\$\{ELOVA_FRONTEND_IMAGE:[^}]+\}/g, 'example.invalid/frontend@sha256:' + 'a'.repeat(64))
  .replaceAll(/\$\{ELOVA_FRONTEND_ENV_FILE:[^}]+\}/g, '/synthetic/frontend.env')
  .replaceAll(/\$\{ELOVA_TRAEFIK_ENABLE:-false\}/g, 'false'))
const { frontend } = model.services

test('VPS frontend is a separate disabled-by-default Traefik project with no host port', () => {
  assert.equal(model.name, 'elova-frontend')
  assert.deepEqual(Object.keys(model.services), ['frontend'])
  assert.equal(frontend.platform, 'linux/amd64')
  assert.equal(frontend.build, undefined)
  assert.equal(frontend.pull_policy, 'never')
  assert.equal(frontend.restart, 'no')
  assert.equal(frontend.init, true)
  assert.equal(frontend.ports, undefined)
  assert.equal(frontend.network_mode, undefined)
  assert.equal(frontend.privileged, undefined)
  assert.deepEqual(frontend.networks, ['root_default', 'elova_frontend_egress'])
  assert.deepEqual(Object.keys(model.networks).sort(), ['elova_frontend_egress', 'elova_frontend_proxy', 'root_default'])
  assert.deepEqual(model.networks.root_default, { external: true, name: 'root_default' })
  // The prior proxy bridge remains defined for operator-owned smoke artifacts, not attached to this service.
  assert.deepEqual(model.networks.elova_frontend_proxy, { name: 'elova_frontend_proxy', internal: true })
  assert.deepEqual(model.networks.elova_frontend_egress, { name: 'elova_frontend_egress' })
  assert.equal(frontend.labels['traefik.enable'], false)
  assert.equal(frontend.labels['traefik.docker.network'], 'root_default')
  assert.equal(frontend.labels['traefik.http.routers.elova-app.rule'], 'Host(`app.elova.dev`)')
  assert.equal(frontend.labels['traefik.http.routers.elova-app.entrypoints'], 'websecure')
  assert.equal(frontend.labels['traefik.http.routers.elova-app.tls'], 'true')
  assert.equal(frontend.labels['traefik.http.routers.elova-app.tls.certresolver'], 'mytlschallenge')
  assert.equal(frontend.labels['traefik.http.routers.elova-app.service'], 'elova-app')
  assert.equal(frontend.labels['traefik.http.services.elova-app.loadbalancer.server.port'], '43180')
})

test('runtime config is an external required file, never a build argument, mount or backend port', () => {
  assert.match(composeSource, /image: \$\{ELOVA_FRONTEND_IMAGE:\?[^}]+\}/)
  assert.match(composeSource, /path: \$\{ELOVA_FRONTEND_ENV_FILE:\?[^}]+\}/)
  assert.match(composeSource, /traefik\.enable: \$\{ELOVA_TRAEFIK_ENABLE:-false\}/)
  assert.match(frontend.image, /^example\.invalid\/frontend@sha256:[a-f0-9]{64}$/)
  assert.deepEqual(frontend.env_file, [{ path: '/synthetic/frontend.env', required: true }])
  assert.equal(frontend.environment, undefined)
  assert.equal(frontend.volumes, undefined)
  assert.equal(frontend.secrets, undefined)
  assert.equal(frontend.command, undefined)
  assert.equal(frontend.user, '10001:10001')
  assert.equal(frontend.read_only, true)
  assert.deepEqual(frontend.cap_drop, ['ALL'])
  assert.deepEqual(frontend.security_opt, ['no-new-privileges:true'])
  assert.ok(frontend.pids_limit <= 128)
  assert.ok(frontend.mem_limit)
  assert.ok(frontend.cpus)
  assert.ok(frontend.tmpfs.every(mount => mount.includes('size=') && mount.includes('uid=10001')))
  assert.deepEqual(frontend.healthcheck.test.slice(0, 3), ['CMD', 'node', '-e'])
})

function entrypoint(env) {
  return spawnSync('sh', ['ops/container/frontend-entrypoint.sh', 'sh', '-c', 'printf ready'], {
    encoding: 'utf8', env: { PATH: process.env.PATH, ...env }, timeout: 5000,
  })
}

test('frontend runtime refuses missing backend or credential/browser-facing settings', () => {
  const url = 'http://100.100.10.20:43181'
  assert.equal(entrypoint({ ELOVA_BACKEND_URL: url }).stdout, 'ready')
  const missing = entrypoint({})
  assert.notEqual(missing.status, 0)
  assert.notEqual(entrypoint({ ELOVA_BACKEND_URL: url, ELOVA_DEV_HTTP_COOKIE_ORIGIN: '' }).status, 0)
  for (const forbidden of ['ELOVA_DEV_HTTP_COOKIE_ORIGIN', 'DATABASE_URL', 'DATABASE_URL_FILE',
    'ELOVA_SESSION_SECRET', 'ELOVA_CREDENTIAL_KEY_FILE', 'NEXT_PUBLIC_BACKEND_URL']) {
    const rejected = entrypoint({ ELOVA_BACKEND_URL: url, [forbidden]: 'canary-sensitive-value' })
    assert.notEqual(rejected.status, 0, forbidden)
    assert.doesNotMatch(rejected.stderr, /canary-sensitive-value|100\.100\.10\.20/)
  }
})
