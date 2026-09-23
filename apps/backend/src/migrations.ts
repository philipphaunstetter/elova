import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Pool, PoolClient } from 'pg'

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/
const MIGRATION_LOCK_ID = 1_817_652_861

export interface Migration {
  name: string
  checksum: string
  sql: string
}

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory))
    .filter((name) => MIGRATION_FILE.test(name))
    .sort((left, right) => left.localeCompare(right))

  const sequences = names.map((name) => Number(name.slice(0, 4)))
  if (new Set(sequences).size !== names.length) {
    throw new Error('Migration sequence prefixes must be unique')
  }
  if (sequences.some((sequence, index) => sequence !== index + 1)) {
    throw new Error('Migration sequence must be contiguous and start at 0001')
  }

  return Promise.all(names.map(async (name) => {
    const sql = await readFile(resolve(directory, name), 'utf8')
    return {
      name,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    }
  }))
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

export async function applyMigrations(pool: Pool, migrations: Migration[]): Promise<void> {
  const client = await pool.connect()
  let lockAcquired = false
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
    lockAcquired = true
    await ensureMigrationTable(client)

    const appliedResult = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name',
    )

    for (const [index, applied] of appliedResult.rows.entries()) {
      const expected = migrations[index]
      if (!expected || expected.name !== applied.name || expected.checksum !== applied.checksum) {
        throw new Error(`Migration history is incompatible at ${applied.name}`)
      }
    }

    for (const migration of migrations.slice(appliedResult.rows.length)) {
      await client.query('BEGIN')
      try {
        await client.query(migration.sql)
        await client.query(
          'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
          [migration.name, migration.checksum],
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID])
      }
    } finally {
      client.release()
    }
  }
}

export async function migrationsAreCompatible(pool: Pool, migrations: Migration[]): Promise<boolean> {
  try {
    const result = await pool.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations ORDER BY name',
    )

    if (result.rows.length !== migrations.length) return false

    return migrations.every((migration, index) => {
      const applied = result.rows[index]
      return applied?.name === migration.name && applied.checksum === migration.checksum
    })
  } catch {
    return false
  }
}
