import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { provisionOrdinaryUser } from '../src/provision-user.js'
import { readOperatorPassword } from '../src/bootstrap-owner.js'
import { OwnerEmailAlreadyExistsError, type Owner, type PostgresRepository } from '../src/repository.js'
import { verifyPassword } from '../src/security.js'

test('protected operator provisioning creates an ordinary user only, with the chosen password hashed', async () => {
  let stored: Owner | undefined
  const repository = {
    async createOrdinaryUser(input: Omit<Owner, 'id'>) {
      stored = { id: '99999999-9999-4999-8999-999999999999', role: 'user', ...input }
      return stored
    },
  } as Pick<PostgresRepository, 'createOrdinaryUser'>
  const user = await provisionOrdinaryUser(repository, {
    email: ' Person@Example.Test ', displayName: 'Person', password: '  person chosen secret  ',
  })
  assert.equal(user.email, 'person@example.test')
  assert.ok(stored)
  assert.equal(stored.role, 'user')
  assert.notEqual(stored.passwordHash, '  person chosen secret  ')
  assert.equal(await verifyPassword('  person chosen secret  ', stored.passwordHash), true)
  assert.equal(await verifyPassword('person chosen secret', stored.passwordHash), false)
})

test('provisioning refuses a duplicate identity and inherits the strict protected file reader', async () => {
  const repository = {
    async createOrdinaryUser() { throw new OwnerEmailAlreadyExistsError('duplicate') },
  } as Pick<PostgresRepository, 'createOrdinaryUser'>
  await assert.rejects(provisionOrdinaryUser(repository, {
    email: 'person@example.test', displayName: 'Person', password: 'synthetic chosen password',
  }), OwnerEmailAlreadyExistsError)
  assert.throws(() => readOperatorPassword('relative-path'), /absolute/)
})

test('operator CLI rejects plaintext environment handoff without connecting or exposing a password', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/provision-user.js', import.meta.url))], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'invalid-database-url',
      ELOVA_USER_EMAIL: 'person@example.test',
      ELOVA_USER_NAME: 'Person',
      ELOVA_USER_PASSWORD: 'synthetic chosen password',
    },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /outcome may be unknown/i)
  assert.doesNotMatch(result.stderr, /synthetic chosen password/)
  assert.equal(result.stdout, '')
})
