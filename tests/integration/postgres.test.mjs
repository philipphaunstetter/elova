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
const databaseModulePath = join(backendRoot, 'dist/src/database.js')
const requireFromBackend = createRequire(join(backendRoot, 'package.json'))
const { Pool } = requireFromBackend('pg')
const { applyMigrations, loadMigrations, migrationsAreCompatible } =
  await import(pathToFileURL(migrationsModulePath).href)
const { PostgresGateway } = await import(pathToFileURL(databaseModulePath).href)

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

test('the migration seam serializes changes and keeps readiness fail-closed', async (context) => {
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

  await pool.query(
    "UPDATE schema_migrations SET checksum = repeat('0', 64) WHERE name = $1",
    [probeMigrations[0].name],
  )
  assert.equal(
    await migrationsAreCompatible(pool, probeMigrations),
    false,
    'readiness must reject drifted migration history',
  )
  await pool.query(
    'UPDATE schema_migrations SET checksum = $1 WHERE name = $2',
    [probeMigrations[0].checksum, probeMigrations[0].name],
  )
  assert.equal(await migrationsAreCompatible(pool, probeMigrations), true)

  await resetDatabase(pool)
  const baselineMigrations = await loadMigrations(
    join(backendRoot, 'migrations'),
  )
  assert.deepEqual(
    baselineMigrations,
    [],
    'the separation foundation must not create product schema',
  )

  await Promise.all([
    applyMigrations(pool, baselineMigrations),
    applyMigrations(pool, baselineMigrations),
  ])

  const history = await pool.query(
    'SELECT name, checksum FROM schema_migrations ORDER BY name',
  )
  assert.deepEqual(history.rows, [])
  assert.equal(await migrationsAreCompatible(pool, baselineMigrations), true)

  const migrationTable = await pool.query(
    "SELECT to_regclass('public.schema_migrations') AS table_name",
  )
  assert.equal(migrationTable.rows[0]?.table_name, 'schema_migrations')

  await pool.query(
    "INSERT INTO schema_migrations (name, checksum) VALUES ('0001_future.sql', repeat('1', 64))",
  )
  assert.equal(
    await migrationsAreCompatible(pool, baselineMigrations),
    false,
    'readiness must reject migration-count mismatches',
  )
  await pool.query("DELETE FROM schema_migrations WHERE name = '0001_future.sql'")

  const locker = await pool.connect()
  const gateway = new PostgresGateway(databaseUrl, baselineMigrations)
  try {
    await locker.query('BEGIN')
    await locker.query('LOCK TABLE schema_migrations IN ACCESS EXCLUSIVE MODE')
    const started = Date.now()
    assert.deepEqual(await gateway.readiness(), {
      database: 'ready',
      migrations: 'not_ready',
    })
    assert.ok(Date.now() - started < 3_000, 'readiness queries must time out before the health deadline')
  } finally {
    await locker.query('ROLLBACK')
    locker.release()
    await gateway.close()
  }
})
