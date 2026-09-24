import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))
const backendRoot = join(repositoryRoot, 'apps/backend')
const migrationsModulePath = join(backendRoot, 'dist/src/migrations.js')
const requireFromBackend = createRequire(join(backendRoot, 'package.json'))
const { Pool } = requireFromBackend('pg')
const { applyMigrations, loadMigrations, migrationsAreCompatible } =
  await import(pathToFileURL(migrationsModulePath).href)

const databaseUrl = process.env.DATABASE_URL
assert.ok(
  databaseUrl,
  'DATABASE_URL must identify the ephemeral CI PostgreSQL service',
)
assert.match(databaseUrl, /(?:127\.0\.0\.1|localhost):5432\/elova_test(?:$|\?)/)

async function resetDatabase(pool) {
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
}

test('ordered baseline migrations serialize through a PostgreSQL advisory lock', async (context) => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 })
  const probeDirectory = await mkdtemp(join(tmpdir(), 'elova-advisory-lock-'))
  context.after(async () => {
    await rm(probeDirectory, { recursive: true, force: true })
    await pool.end()
  })

  await resetDatabase(pool)
  await writeFile(
    join(probeDirectory, '0001_lock_probe.sql'),
    'SELECT pg_sleep(0.75);\nCREATE TABLE advisory_lock_probe (id integer PRIMARY KEY);\n',
  )
  const probeMigrations = await loadMigrations(probeDirectory)

  // Both callers begin together. Without the transaction-independent advisory lock,
  // they race on the same DDL/history row and at least one rejects.
  await Promise.all([
    applyMigrations(pool, probeMigrations),
    applyMigrations(pool, probeMigrations),
  ])

  const probeHistory = await pool.query(
    "SELECT name FROM schema_migrations WHERE name = '0001_lock_probe.sql'",
  )
  assert.equal(probeHistory.rowCount, 1)
  assert.equal(await migrationsAreCompatible(pool, probeMigrations), true)

  await resetDatabase(pool)
  const baselineMigrations = await loadMigrations(
    join(backendRoot, 'migrations'),
  )
  assert.ok(
    baselineMigrations.length > 0,
    'the backend must ship at least one baseline migration',
  )

  await Promise.all([
    applyMigrations(pool, baselineMigrations),
    applyMigrations(pool, baselineMigrations),
  ])

  const history = await pool.query(
    'SELECT name, checksum FROM schema_migrations ORDER BY name',
  )
  assert.deepEqual(
    history.rows.map(({ name }) => name),
    baselineMigrations.map(({ name }) => name),
  )
  assert.equal(await migrationsAreCompatible(pool, baselineMigrations), true)

  const baselineTable = await pool.query(
    "SELECT to_regclass('public.service_metadata') AS table_name",
  )
  assert.equal(baselineTable.rows[0]?.table_name, 'service_metadata')

  await pool.query(
    "UPDATE schema_migrations SET checksum = repeat('0', 64) WHERE name = $1",
    [baselineMigrations[0].name],
  )
  assert.equal(
    await migrationsAreCompatible(pool, baselineMigrations),
    false,
    'readiness must reject drifted migration history',
  )
  await pool.query(
    'UPDATE schema_migrations SET checksum = $1 WHERE name = $2',
    [baselineMigrations[0].checksum, baselineMigrations[0].name],
  )
  assert.equal(await migrationsAreCompatible(pool, baselineMigrations), true)
})
