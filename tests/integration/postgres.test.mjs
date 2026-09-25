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
const repositoryModulePath = join(backendRoot, 'dist/src/repository.js')
const bootstrapModulePath = join(backendRoot, 'dist/src/bootstrap-owner.js')
const requireFromBackend = createRequire(join(backendRoot, 'package.json'))
const { Pool } = requireFromBackend('pg')
const { applyMigrations, loadMigrations, migrationsAreCompatible } =
  await import(pathToFileURL(migrationsModulePath).href)
const { PostgresGateway } = await import(pathToFileURL(databaseModulePath).href)
const { PostgresRepository, OwnerAlreadyExistsError, InitialAdminRequiredError, ProviderSyncAlreadyRunningError } = await import(pathToFileURL(repositoryModulePath).href)
const { ElovaApplication } = await import(pathToFileURL(join(backendRoot, 'dist/src/application.js')).href)
const { bootstrapOwner } = await import(pathToFileURL(bootstrapModulePath).href)
const { provisionOrdinaryUser } = await import(pathToFileURL(join(backendRoot, 'dist/src/provision-user.js')).href)

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
    baselineMigrations.map((migration) => migration.name),
    ['0001_postgres_authority.sql', '0002_workspaces.sql'],
    'vNext must apply its original authority and additive workspace migration in order',
  )

  await Promise.all([
    applyMigrations(pool, baselineMigrations),
    applyMigrations(pool, baselineMigrations),
  ])

  const history = await pool.query(
    'SELECT name, checksum FROM schema_migrations ORDER BY name',
  )
  assert.deepEqual(history.rows, baselineMigrations.map(({ name, checksum }) => ({ name, checksum })))
  assert.equal(await migrationsAreCompatible(pool, baselineMigrations), true)

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`,
  )
  assert.deepEqual(tables.rows.map((row) => row.table_name), [
    'executions', 'n8n_providers', 'owners', 'schema_migrations', 'sessions',
    'sync_cursors', 'sync_runs', 'workflows', 'workspace_members', 'workspaces',
  ])
  const privacyConstraints = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name IN ('privacy_mode', 'sanitizer_version', 'content_digest')
     ORDER BY table_name, column_name`,
  )
  assert.equal(privacyConstraints.rowCount, 6, 'workflow and execution evidence records privacy metadata')

  const repository = new PostgresRepository(pool)
  assert.equal((await pool.query('SELECT count(*)::integer AS total FROM owners')).rows[0].total, 0)
  await assert.rejects(provisionOrdinaryUser(repository, {
    email: 'premature@example.test', displayName: 'Premature', password: 'synthetic chosen password',
  }), InitialAdminRequiredError)
  const owner = await bootstrapOwner(repository, {
    email: 'owner@example.test',
    displayName: 'Initial Owner',
    password: 'correct horse battery staple',
  })
  assert.equal(owner.email, 'owner@example.test')
  const workspaces = await repository.listWorkspaces(owner.id)
  assert.equal(workspaces.length, 1)
  assert.equal(workspaces[0].name, 'admin workspace')
  assert.deepEqual((await pool.query('SELECT owner_id FROM workspace_members WHERE workspace_id = $1',
    [workspaces[0].id])).rows, [{ owner_id: owner.id }])
  const adminRole = await pool.query('SELECT role FROM owners WHERE id = $1', [owner.id])
  assert.equal(adminRole.rows[0].role, 'super_admin')
  await assert.rejects(
    bootstrapOwner(repository, {
      email: 'other@example.test',
      displayName: 'Other Owner',
      password: 'another correct battery staple',
    }),
    OwnerAlreadyExistsError,
    'operator bootstrap closes permanently after the atomic super-administrator commit',
  )

  const syntheticSecret = Buffer.alloc(32, 9).toString('base64')
  const application = new ElovaApplication(repository, syntheticSecret, syntheticSecret)
  const request = (method, pathname, cookie, workspaceId, body) => application.handle({
    method, pathname, searchParams: new URLSearchParams(),
    headers: { cookie, 'x-elova-workspace-id': workspaceId }, body,
  })
  const login = await request('POST', '/v1/auth/login', undefined, undefined,
    { email: owner.email, password: 'correct horse battery staple' })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.role, 'super_admin')
  assert.equal(login.body.user.workspaceId, workspaces[0].id)
  const cookie = login.headers['set-cookie'].split(';')[0]
  const empty = async (id) => {
    assert.deepEqual((await request('GET', '/v1/providers', cookie, id)).body, { providers: [] })
    assert.deepEqual((await request('GET', '/v1/workflows', cookie, id)).body, { workflows: [] })
    assert.deepEqual((await request('GET', '/v1/executions', cookie, id)).body, { executions: [] })
    assert.deepEqual((await request('GET', '/v1/dashboard/metrics', cookie, id)).body,
      { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, successRate: null, averageDurationMs: null })
  }
  await empty(workspaces[0].id)
  const created = await request('POST', '/v1/workspaces', cookie, undefined, { name: 'Personal workspace' })
  assert.equal(created.status, 201)
  const secondId = created.body.workspace.id
  assert.deepEqual((await pool.query('SELECT owner_id FROM workspace_members WHERE workspace_id = $1',
    [secondId])).rows, [{ owner_id: owner.id }])
  assert.equal((await request('GET', '/v1/auth/session', cookie)).body.user.workspaceId, secondId)
  await empty(secondId)
  assert.deepEqual((await request('GET', '/v1/workspaces', cookie)).body.workspaces.map((space) => space.name),
    ['admin workspace', 'Personal workspace'])
  assert.equal((await request('POST', '/v1/workspaces/select', cookie, undefined,
    { workspaceId: workspaces[0].id })).status, 200)
  await empty(workspaces[0].id)
  assert.equal((await pool.query('SELECT count(*)::integer AS total FROM n8n_providers')).rows[0].total, 0)

  const teammate = await provisionOrdinaryUser(repository, {
    email: 'teammate@example.test', displayName: 'Teammate', password: 'teammate chosen synthetic password',
  })
  assert.equal((await repository.findOwnerByEmail(teammate.email)).role, 'user')
  assert.deepEqual(await repository.listWorkspaces(teammate.id), [])
  assert.equal((await request('POST', '/v1/workspaces/members', cookie, workspaces[0].id,
    { email: teammate.email, role: 'viewer' })).status, 204)
  assert.equal((await request('POST', '/v1/workspaces/members', cookie, workspaces[0].id,
    { email: teammate.email, role: 'viewer' })).status, 409)
  assert.equal((await request('GET', '/v1/workspaces/members', cookie, workspaces[0].id)).body.members.length, 2)
  assert.equal((await request('POST', '/v1/workspaces/ownership/transfer', cookie, workspaces[0].id,
    { userId: teammate.id })).status, 409, 'viewer cannot become designated owner')
  assert.equal(await repository.addMember(owner.id, secondId, teammate.email, 'editor'), 'ok')
  const teammateLogin = await request('POST', '/v1/auth/login', undefined, undefined,
    { email: teammate.email, password: 'teammate chosen synthetic password' })
  assert.equal(teammateLogin.status, 200)
  const teammateCookie = teammateLogin.headers['set-cookie'].split(';')[0]
  const membershipList = await request('GET', '/v1/workspaces', teammateCookie)
  assert.deepEqual(membershipList.body.workspaces.map((space) => [space.id, space.role]),
    [[workspaces[0].id, 'viewer'], [secondId, 'editor']])
  assert.equal((await request('GET', '/v1/workflows', teammateCookie, workspaces[0].id)).status, 200)
  const syntheticConnection = { name: 'Synthetic', baseUrl: 'http://100.100.10.20:5678', apiKey: 'synthetic-only' }
  assert.equal((await request('POST', '/v1/providers', teammateCookie, workspaces[0].id, syntheticConnection)).status, 403)
  assert.equal((await request('POST', '/v1/workspaces/members', teammateCookie, workspaces[0].id,
    { email: 'missing@example.test', role: 'owner' })).status, 403)
  assert.equal((await request('POST', '/v1/workspaces/select', teammateCookie, undefined,
    { workspaceId: secondId })).status, 200)
  assert.equal((await request('GET', '/v1/executions', teammateCookie, workspaces[0].id)).status, 409,
    'stale tab may not read another workspace after selection')
  assert.equal((await request('GET', '/v1/workspaces/members', cookie, secondId)).status, 409,
    'global admin also requires the selected workspace header for member operations')
  assert.equal((await request('GET', '/v1/workflows', teammateCookie, secondId)).status, 200)
  assert.equal((await request('POST', '/v1/providers', teammateCookie, secondId, syntheticConnection)).status, 403)
  assert.equal(await repository.setMemberRole(owner.id, secondId, teammate.id, 'admin'), 'ok')
  assert.equal((await request('PATCH', '/v1/workspaces/settings', teammateCookie, secondId,
    { name: 'Shared workspace' })).status, 204)
  assert.equal((await request('GET', '/v1/workspaces/members', teammateCookie, secondId)).status, 403)
  assert.equal(await repository.setMemberRole(owner.id, secondId, teammate.id, 'viewer'), 'ok')
  assert.equal((await request('PATCH', '/v1/workspaces/settings', teammateCookie, secondId,
    { name: 'Not allowed' })).status, 403)
  assert.equal(await repository.removeMember(owner.id, secondId, teammate.id), 'ok')
  assert.equal((await request('GET', '/v1/auth/session', teammateCookie)).body.user.workspaceId, null)
  assert.equal((await request('GET', '/v1/workflows', teammateCookie, secondId)).status, 409)
  assert.equal((await request('POST', '/v1/workspaces/select', teammateCookie, undefined,
    { workspaceId: secondId })).status, 404)
  assert.deepEqual((await request('GET', '/v1/workspaces', teammateCookie)).body.workspaces.map((space) => space.id),
    [workspaces[0].id])
  assert.equal((await pool.query('SELECT count(*)::integer AS total FROM n8n_providers')).rows[0].total, 0)

  let signalEntered
  let releaseSync
  const entered = new Promise((resolve) => { signalEntered = resolve })
  const held = new Promise((resolve) => { releaseSync = resolve })
  const providerId = '22222222-2222-4222-8222-222222222222'
  const otherProviderId = '33333333-3333-4333-8333-333333333333'
  const activeSync = repository.withProviderSyncLock(providerId, async () => {
    signalEntered()
    await held
    return 'completed'
  })
  try {
    await entered
    await assert.rejects(
      new PostgresRepository(pool).withProviderSyncLock(providerId, async () => 'overlapped'),
      ProviderSyncAlreadyRunningError,
    )
    assert.equal(await new PostgresRepository(pool).withProviderSyncLock(otherProviderId, async () => 'independent'), 'independent')
  } finally {
    releaseSync()
    assert.equal(await activeSync, 'completed')
  }
  assert.equal(await repository.withProviderSyncLock(providerId, async () => 'next'), 'next')
  const singleClientPool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 250 })
  try {
    const isolatedRepository = new PostgresRepository(singleClientPool)
    assert.equal(await isolatedRepository.withProviderSyncLock(providerId, async (syncRepository) => {
      assert.equal(await syncRepository.getSyncCursor(providerId, 'executions'), null)
      return 'cursor read without another connection'
    }), 'cursor read without another connection')
  } finally {
    await singleClientPool.end()
  }
  await assert.rejects(repository.withProviderSyncLock(providerId, async () => {
    throw new Error('Provider fetch failed')
  }), /Provider fetch failed/)
  assert.equal(await repository.withProviderSyncLock(providerId, async () => 'retry'), 'retry')

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
