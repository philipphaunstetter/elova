import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bootstrapOwner, readOperatorPassword } from '../src/bootstrap-owner.js'
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

test('protected local handoff preserves the exact chosen password and rejects unsafe files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'elova-owner-'))
  try {
    const path = join(dir, 'handoff')
    writeFileSync(path, '  captain chosen secret  \n', { mode: 0o400 })
    assert.equal(readOperatorPassword(path), '  captain chosen secret  ')
    const replace = (value: string) => {
      chmodSync(path, 0o600)
      writeFileSync(path, value)
      chmodSync(path, 0o400)
    }
    replace(`${'é'.repeat(130)}\n`)
    assert.equal(readOperatorPassword(path), 'é'.repeat(130))
    replace(`${'界'.repeat(256)}\n`)
    assert.equal(readOperatorPassword(path), '界'.repeat(256))
    replace(`${'界'.repeat(257)}\n`)
    assert.throws(() => readOperatorPassword(path), /securely/)
    chmodSync(path, 0o600)
    assert.throws(() => readOperatorPassword(path), /securely/)
    chmodSync(path, 0o400)
    const alias = join(dir, 'alias')
    symlinkSync(path, alias)
    assert.throws(() => readOperatorPassword(alias), /securely/)
    assert.throws(() => readOperatorPassword('relative'), /absolute/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('bootstrap command never claims an owner was absent after a failed attempt', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../src/bootstrap-owner.js', import.meta.url))], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: 'invalid-database-url',
      ELOVA_BOOTSTRAP_EMAIL: 'owner@example.test',
      ELOVA_BOOTSTRAP_NAME: 'Owner',
      ELOVA_BOOTSTRAP_PASSWORD: 'synthetic test password',
    },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /commit outcome may be unknown/i)
  assert.match(result.stderr, /check PostgreSQL for an existing owner before retrying/i)
  assert.equal(result.stdout, '')
})
