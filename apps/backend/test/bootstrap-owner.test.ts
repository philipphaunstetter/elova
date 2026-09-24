import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootstrapOwner } from '../src/bootstrap-owner.js'
import { OwnerAlreadyExistsError, type Owner, type PostgresRepository } from '../src/repository.js'
import { verifyPassword } from '../src/security.js'

test('operator bootstrap writes one hashed owner through the atomic repository boundary', async () => {
  let stored: Owner | undefined
  const repository = {
    async createInitialOwner(input: Omit<Owner, 'id'>) {
      stored = { id: '11111111-1111-4111-8111-111111111111', ...input }
      return stored
    },
  } as Pick<PostgresRepository, 'createInitialOwner'>
  const owner = await bootstrapOwner(repository, {
    email: ' Owner@Example.Test ', displayName: 'Initial Owner', password: 'correct horse battery staple',
  })
  assert.equal(owner.email, 'owner@example.test')
  assert.ok(stored)
  assert.notEqual(stored.passwordHash, 'correct horse battery staple')
  assert.equal(await verifyPassword('correct horse battery staple', stored.passwordHash), true)
})

test('operator bootstrap refuses permanently after repository commitment', async () => {
  const repository = {
    async createInitialOwner() { throw new OwnerAlreadyExistsError('closed') },
  } as Pick<PostgresRepository, 'createInitialOwner'>
  await assert.rejects(
    bootstrapOwner(repository, { email: 'owner@example.test', displayName: 'Owner', password: 'correct horse battery staple' }),
    OwnerAlreadyExistsError,
  )
})
