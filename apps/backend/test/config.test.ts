import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { loadConfig } from '../src/config.js'

const secureEnv = (values: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ELOVA_SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
  ELOVA_CREDENTIAL_KEY: Buffer.alloc(32, 8).toString('base64'),
  ...values,
})

test('configuration fails closed without a database URL', () => {
  assert.throws(() => loadConfig(secureEnv()), /DATABASE_URL is required/)
})

test('native configuration uses environment values only', () => {
  const env = secureEnv({
    DATABASE_URL: 'postgres://127.0.0.1/elova',
    DATABASE_URL_FILE: '/nonexistent/database_url',
    ELOVA_SESSION_SECRET_FILE: '/nonexistent/session_key',
    ELOVA_CREDENTIAL_KEY_FILE: '/nonexistent/credential_key',
  })
  const config = loadConfig(env)
  assert.equal(config.databaseUrl, env.DATABASE_URL)
  assert.equal(config.sessionSecret, env.ELOVA_SESSION_SECRET)
  assert.equal(config.credentialKey, env.ELOVA_CREDENTIAL_KEY)
  for (const name of ['DATABASE_URL', 'ELOVA_SESSION_SECRET', 'ELOVA_CREDENTIAL_KEY']) {
    const missing = { ...env }
    delete missing[name]
    assert.throws(() => loadConfig(missing), new RegExp(`${name} is required`))
  }
})

test('backend fails closed without independent session and credential secrets', () => {
  const database = { DATABASE_URL: 'postgres://127.0.0.1/elova' }
  assert.throws(() => loadConfig(database), /ELOVA_SESSION_SECRET is required/)
  assert.throws(
    () => loadConfig({ ...database, ELOVA_SESSION_SECRET: Buffer.alloc(32, 7).toString('base64') }),
    /ELOVA_CREDENTIAL_KEY is required/,
  )
  const same = Buffer.alloc(32, 7).toString('base64')
  assert.throws(
    () => loadConfig({ ...database, ELOVA_SESSION_SECRET: same, ELOVA_CREDENTIAL_KEY: same }),
    /must be different/,
  )
})

test('backend defaults to loopback, a bounded port, and packaged migrations', () => {
  const config = loadConfig(secureEnv({ DATABASE_URL: 'postgres://127.0.0.1/elova' }))
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 43181)
  assert.equal(config.migrationsDirectory, resolve(process.cwd(), 'migrations'))
})

test('invalid ports are rejected', () => {
  assert.throws(
    () => loadConfig(secureEnv({ DATABASE_URL: 'postgres://127.0.0.1/elova', PORT: '70000' })),
    /PORT must be an integer/,
  )
})

test('wildcard binds are rejected in every supported literal form', () => {
  for (const host of [
    '0.0.0.0',
    '::',
    '[::]',
    '0::',
    '::0',
    '0:0:0:0:0:0:0:0',
    '[0:0:0:0:0:0:0:0]',
    '::0.0.0.0',
    '[::0.0.0.0]',
    '0:0:0:0:0:0:0.0.0.0',
  ]) {
    assert.throws(
      () => loadConfig(secureEnv({
        DATABASE_URL: 'postgres://127.0.0.1/elova',
        ELOVA_BACKEND_HOST: host,
      })),
      /must not use a wildcard/,
    )
  }
})

test('database URLs accept only explicit same-host transports', () => {
  for (const databaseUrl of [
    'postgresql://localhost:5432/elova?sslmode=disable',
    'postgresql://127.0.0.1:5432/elova',
    'postgresql://127.255.1.2:5432/elova',
    'postgresql://[::1]:5432/elova',
    'postgresql://[0:0:0:0:0:0:0:1]:5432/elova',
    'postgresql:///elova?host=%2Fvar%2Frun%2Fpostgresql',
  ]) {
    assert.equal(loadConfig(secureEnv({ DATABASE_URL: databaseUrl })).databaseUrl, databaseUrl)
  }

  for (const databaseUrl of [
    'postgresql:///elova',
    'postgresql://10.0.0.2:5432/elova',
    'postgresql://100.100.10.20:5432/elova',
    'postgresql://db.internal:5432/elova',
    'postgresql:///elova?host=db.internal',
    'postgresql://127.0.0.1/elova?host=%2Fvar%2Frun%2Fpostgresql',
    'postgresql:///elova?host=%2Fvar%2Frun%2Fpostgresql&hostaddr=127.0.0.1',
  ]) {
    assert.throws(
      () => loadConfig(secureEnv({ DATABASE_URL: databaseUrl })),
      /must use a same-host Unix socket or loopback address/,
    )
  }
})

const syntheticPassword = 'syntheticOnly'
const containerUrl = `postgresql://elova_backend:${syntheticPassword}@postgres:5432/elova_vnext`

test('container endpoint and IPv4 internal bind are exact opt-in constraints', () => {
  const base = secureEnv({ ELOVA_RUNTIME: 'container', DATABASE_URL: containerUrl, ELOVA_BACKEND_HOST: '0.0.0.0' })
  // File mounts are mandatory in container mode, not environment secrets.
  assert.throws(() => loadConfig(base), /_FILE is required/)
  assert.equal(loadConfig(containerFiles()).host, '0.0.0.0')
  for (const url of [
    `postgresql://elova_backend:${syntheticPassword}@db:5432/elova_vnext`,
    `postgresql://elova_backend:${syntheticPassword}@postgres:5433/elova_vnext`,
    `postgresql://elova_backend:${syntheticPassword}@postgres/elova_vnext`,
    `postgresql://elova_backend:${syntheticPassword}@postgres:5432/other`,
    `postgresql://postgres:${syntheticPassword}@postgres:5432/elova_vnext`,
    `${containerUrl}?hostaddr=127.0.0.1`,
    `${containerUrl}?host=attacker`,
    `${containerUrl}?port=1234`,
    `postgresql://elova_backend:${syntheticPassword}@127.0.0.1:5432/elova_vnext`,
  ]) {
    assert.throws(() => loadConfig(containerFiles({ DATABASE_URL: url })), /Elova project postgres/)
  }
  for (const host of ['::', '[::]', '127.0.0.1', '100.121.218.27']) {
    assert.throws(() => loadConfig(containerFiles({ ELOVA_BACKEND_HOST: host })), /wildcard|internal IPv4/)
  }
  assert.throws(() => loadConfig(containerFiles({ PORT: '43182' })), /must be 43181/)
  assert.throws(() => loadConfig(secureEnv({ ELOVA_RUNTIME: 'native', DATABASE_URL: containerUrl })), /ELOVA_RUNTIME/)
  assert.throws(() => loadConfig(secureEnv({ DATABASE_URL: containerUrl })), /same-host/)
})

const temporaryConfigDirs: string[] = []
after(() => { for (const dir of temporaryConfigDirs) rmSync(dir, { recursive: true, force: true }) })
function containerFiles(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), 'elova-config-'))
  temporaryConfigDirs.push(dir)
  const files = {
    DATABASE_URL: overrides.DATABASE_URL ?? containerUrl,
    ELOVA_SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
    ELOVA_CREDENTIAL_KEY: Buffer.alloc(32, 8).toString('base64'),
  }
  const settings = { ...overrides }
  delete settings.DATABASE_URL
  const env: NodeJS.ProcessEnv = { ELOVA_RUNTIME: 'container', ELOVA_BACKEND_HOST: '0.0.0.0', ...settings }
  for (const [name, value] of Object.entries(files)) {
    const path = join(dir, name)
    writeFileSync(path, `${value}\n`, { mode: 0o400 })
    env[`${name}_FILE`] = path
  }
  return env
}

test('protected file mounts load without disclosing values or paths in failures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'elova-secret-'))
  const dbPath = join(dir, 'database_url')
  const sessionPath = join(dir, 'session_key')
  const keyPath = join(dir, 'credential_key')
  const session = Buffer.alloc(32, 17).toString('base64')
  const credential = Buffer.alloc(32, 23).toString('base64')
  try {
    writeFileSync(dbPath, `${containerUrl}\n`, { mode: 0o400 })
    writeFileSync(sessionPath, `${session}\n`, { mode: 0o400 })
    writeFileSync(keyPath, `${credential}\n`, { mode: 0o400 })
    const env = {
      ELOVA_RUNTIME: 'container', ELOVA_BACKEND_HOST: '0.0.0.0',
      DATABASE_URL_FILE: dbPath, ELOVA_SESSION_SECRET_FILE: sessionPath,
      ELOVA_CREDENTIAL_KEY_FILE: keyPath,
    }
    assert.equal(loadConfig(env).databaseUrl, containerUrl)
    assert.equal(loadConfig(env).sessionSecret, session)
    assert.equal(loadConfig(env).credentialKey, credential)
    assert.throws(() => loadConfig({ ...env, DATABASE_URL: containerUrl }), /mutually exclusive/)
    chmodSync(sessionPath, 0o644)
    assert.throws(() => loadConfig(env), error => {
      const message = String(error)
      return message.includes('cannot be read securely') &&
        !message.includes(session) && !message.includes(sessionPath) && !message.includes(containerUrl)
    })
    chmodSync(sessionPath, 0o400)
    symlinkSync(sessionPath, join(dir, 'link'))
    assert.throws(() => loadConfig({ ...env, ELOVA_SESSION_SECRET_FILE: join(dir, 'link') }), /cannot be read securely/)
    chmodSync(keyPath, 0o600)
    writeFileSync(keyPath, `${session}\n`)
    chmodSync(keyPath, 0o400)
    assert.throws(() => loadConfig(env), /must be different/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('non-PostgreSQL database URLs are rejected', () => {
  assert.throws(
    () => loadConfig(secureEnv({ DATABASE_URL: 'sqlite:///tmp/elova.db' })),
    /must use the postgres or postgresql scheme/,
  )
})
