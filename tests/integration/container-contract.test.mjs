import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
  assert.ok(!composeText.match(/\bai\b/))
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
  assert.ok(!composeText.includes('dist/src/migrate.js'))
  const dockerfile = readFileSync('ops/container/Dockerfile.backend', 'utf8')
  assert.match(dockerfile, /CMD \["node", "dist\/src\/server\.js"\]/)
  assert.doesNotMatch(dockerfile, /RUN .*migrat|CMD .*migrat/)
  assert.match(dockerfile, /COPY apps\/backend\/migrations\/\*\.sql/)
  assert.match(dockerfile, /USER 10001:10001/)
  assert.equal(backend.read_only, true)
  assert.deepEqual(backend.cap_drop, ['ALL'])
})
