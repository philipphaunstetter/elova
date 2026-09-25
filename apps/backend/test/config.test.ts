import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { loadConfig } from '../src/config.js'

const secureEnv = (values: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ELOVA_SESSION_SECRET: Buffer.alloc(32, 7).toString('base64'),
  ELOVA_CREDENTIAL_KEY: Buffer.alloc(32, 8).toString('base64'),
  ...values,
})

test('configuration fails closed without a database URL', () => {
  assert.throws(() => loadConfig(secureEnv()), /DATABASE_URL is required/)
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

test('non-PostgreSQL database URLs are rejected', () => {
  assert.throws(
    () => loadConfig(secureEnv({ DATABASE_URL: 'sqlite:///tmp/elova.db' })),
    /must use the postgres or postgresql scheme/,
  )
})
