import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { loadMigrations } from '../src/migrations.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'elova-migrations-'))
  directories.push(path)
  return path
}

test('migrations load in sequence with deterministic checksums', async () => {
  const path = await directory()
  await writeFile(join(path, '0002_second.sql'), 'SELECT 2;\n')
  await writeFile(join(path, '0001_first.sql'), 'SELECT 1;\n')
  await writeFile(join(path, 'README.md'), 'ignored')

  const migrations = await loadMigrations(path)

  assert.deepEqual(migrations.map(({ name }) => name), ['0001_first.sql', '0002_second.sql'])
  assert.match(migrations[0]?.checksum ?? '', /^[a-f0-9]{64}$/)
})

test('migration sequence gaps are rejected', async () => {
  const path = await directory()
  await writeFile(join(path, '0001_first.sql'), 'SELECT 1;\n')
  await writeFile(join(path, '0003_third.sql'), 'SELECT 3;\n')

  await assert.rejects(loadMigrations(path), /contiguous and start at 0001/)
})

test('duplicate migration prefixes are rejected', async () => {
  const path = await directory()
  await writeFile(join(path, '0001_first.sql'), 'SELECT 1;\n')
  await writeFile(join(path, '0001_other.sql'), 'SELECT 2;\n')

  await assert.rejects(loadMigrations(path), /prefixes must be unique/)
})
