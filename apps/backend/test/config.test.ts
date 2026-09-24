import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { loadConfig } from '../src/config.js'

test('configuration fails closed without a database URL', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL is required/)
})

test('backend defaults to loopback, a bounded port, and packaged migrations', () => {
  const config = loadConfig({ DATABASE_URL: 'postgres://test.invalid/elova' })
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 4100)
  assert.equal(config.migrationsDirectory, resolve(process.cwd(), 'migrations'))
})

test('invalid ports are rejected', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'postgres://test.invalid/elova', PORT: '70000' }),
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
  ]) {
    assert.throws(
      () => loadConfig({
        DATABASE_URL: 'postgres://test.invalid/elova',
        ELOVA_BACKEND_HOST: host,
      }),
      /must not use a wildcard/,
    )
  }
})

test('non-PostgreSQL database URLs are rejected', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'sqlite:///tmp/elova.db' }),
    /must use the postgres or postgresql scheme/,
  )
})
