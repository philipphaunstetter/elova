import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { loadConfig } from '../src/config.js'

test('configuration fails closed without a database URL', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL is required/)
})

test('backend defaults to loopback, a bounded port, and packaged migrations', () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://127.0.0.1/elova' })
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 4100)
  assert.equal(config.migrationsDirectory, resolve(process.cwd(), 'migrations'))
})

test('invalid ports are rejected', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'postgres://127.0.0.1/elova', PORT: '70000' }),
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
      () => loadConfig({
        DATABASE_URL: 'postgres://127.0.0.1/elova',
        ELOVA_BACKEND_HOST: host,
      }),
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
    assert.equal(loadConfig({ DATABASE_URL: databaseUrl }).databaseUrl, databaseUrl)
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
      () => loadConfig({ DATABASE_URL: databaseUrl }),
      /must use a same-host Unix socket or loopback address/,
    )
  }
})

test('non-PostgreSQL database URLs are rejected', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'sqlite:///tmp/elova.db' }),
    /must use the postgres or postgresql scheme/,
  )
})
