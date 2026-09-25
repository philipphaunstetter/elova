// Run only against disposable CI PostgreSQL, never a host or shared database.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const backend = join(root, 'apps/backend')
const requireBackend = createRequire(join(backend, 'package.json'))
const { Pool } = requireBackend('pg')
const { applyMigrations, loadMigrations } = await import(pathToFileURL(join(backend, 'dist/src/migrations.js')))
const { PostgresRepository, OwnerAlreadyExistsError, OwnerEmailAlreadyExistsError } = await import(pathToFileURL(join(backend, 'dist/src/repository.js')))
const { bootstrapOwner } = await import(pathToFileURL(join(backend, 'dist/src/bootstrap-owner.js')))
const { verifyPassword } = await import(pathToFileURL(join(backend, 'dist/src/security.js')))
const databaseUrl = process.env.DATABASE_URL
assert.match(databaseUrl ?? '', /(?:127\.0\.0\.1|localhost):5432\/elova_test(?:$|\?)/)

const owner = '11111111-1111-4111-8111-111111111111'
const provider = '22222222-2222-4222-8222-222222222222'
const workflow = '33333333-3333-4333-8333-333333333333'
const execution = '44444444-4444-4444-8444-444444444444'
const session = '55555555-5555-4555-8555-555555555555'

test('0001 upgrade retains owner, session, provider and sanitized evidence without reset', async (context) => {
  const pool = new Pool({ connectionString: databaseUrl })
  context.after(async () => pool.end())
  await pool.query('DROP SCHEMA public CASCADE')
  await pool.query('CREATE SCHEMA public')
  const migrations = await loadMigrations(join(backend, 'migrations'))
  await applyMigrations(pool, migrations.slice(0, 1))
  await pool.query("INSERT INTO owners (id,email,display_name,password_hash) VALUES ($1,'owner@example.test','Captain','scrypt$synthetic$synthetic')", [owner])
  await pool.query("INSERT INTO sessions (id,owner_id,token_digest,expires_at) VALUES ($1,$2,'synthetic-digest',now()+interval '1 day')", [session, owner])
  await pool.query("INSERT INTO n8n_providers (id,owner_id,name,base_url,encrypted_api_key) VALUES ($1,$2,'n8n','http://100.100.10.20:5678','v1.synthetic')", [provider, owner])
  await pool.query("INSERT INTO workflows (id,provider_id,provider_workflow_id,name,sanitized_definition,privacy_mode,sanitizer_version,content_digest) VALUES ($1,$2,'wf-digest','Workflow digest','{}','sanitized_only','2','digest')", [workflow, provider])
  await pool.query("INSERT INTO executions (id,provider_id,workflow_id,provider_execution_id,status,sanitized_content,privacy_mode,sanitizer_version,content_digest) VALUES ($1,$2,$3,'ex-digest','success','{}','sanitized_only','2','digest')", [execution, provider, workflow])
  const alien = '66666666-6666-4666-8666-666666666666'
  await pool.query("INSERT INTO owners (id,email,display_name,password_hash) VALUES ($1,'other@example.test','Other','scrypt$synthetic$synthetic')", [alien])
  await applyMigrations(pool, migrations)
  const repository = new PostgresRepository(pool)
  const workspaces = await repository.listWorkspaces(owner)
  assert.equal(workspaces.length, 1)
  assert.equal(workspaces[0].name, 'Original workspace')
  assert.equal(workspaces[0].role, 'owner')
  const space = workspaces[0].id
  const alienWorkspaces = await repository.listWorkspaces(alien)
  assert.equal(alienWorkspaces.length, 1)
  assert.equal(alienWorkspaces[0].name, 'Original workspace')
  assert.notEqual(alienWorkspaces[0].id, space)
  assert.deepEqual((await pool.query(
    'SELECT workspace_id, owner_id FROM workspace_members ORDER BY owner_id')).rows, [
    { workspace_id: space, owner_id: owner },
    { workspace_id: alienWorkspaces[0].id, owner_id: alien },
  ])
  await assert.rejects(pool.query(
    'UPDATE workspace_members SET owner_id = $2 WHERE workspace_id = $1', [space, alien]), { code: '23503' })
  await assert.rejects(pool.query(
    'DELETE FROM workspace_members WHERE workspace_id = $1', [space]), { code: '23503' })
  assert.deepEqual((await pool.query('SELECT id, role FROM owners ORDER BY id')).rows, [
    { id: owner, role: 'user' }, { id: alien, role: 'user' },
  ])
  assert.equal((await repository.listProviders(owner, space))[0].id, provider)
  assert.equal((await repository.getProviderSecret(owner, space, provider)).encryptedApiKey, 'v1.synthetic')
  assert.equal((await repository.listWorkflows(owner, space, 20))[0].id, workflow)
  assert.equal((await repository.listExecutions(owner, space, 20))[0].id, execution)
  const saved = await pool.query('SELECT workspace_id FROM sessions WHERE id = $1', [session])
  assert.equal(saved.rows[0].workspace_id, space)
  const savedWorkflow = await pool.query('SELECT sanitized_definition, privacy_mode, sanitizer_version, content_digest FROM workflows WHERE id = $1', [workflow])
  assert.deepEqual(savedWorkflow.rows[0], {
    sanitized_definition: {}, privacy_mode: 'sanitized_only', sanitizer_version: '2', content_digest: 'digest',
  })
  const savedExecution = await pool.query('SELECT sanitized_content, privacy_mode, sanitizer_version, content_digest FROM executions WHERE id = $1', [execution])
  assert.deepEqual(savedExecution.rows[0], {
    sanitized_content: {}, privacy_mode: 'sanitized_only', sanitizer_version: '2', content_digest: 'digest',
  })
  await assert.rejects(pool.query("UPDATE workflows SET privacy_mode = 'raw' WHERE id = $1", [workflow]), { code: '23514' })
  await assert.rejects(pool.query("UPDATE executions SET privacy_mode = 'raw' WHERE id = $1", [execution]), { code: '23514' })
  assert.equal(await repository.getProviderSecret(alien, space, provider), undefined)
  assert.deepEqual(await repository.listProviders(alien, space), [])
  assert.deepEqual(await repository.listWorkflows(alien, space, 20), [])
  assert.deepEqual(await repository.listExecutions(alien, space, 20), [])
  assert.deepEqual(await repository.listProviders(owner, alienWorkspaces[0].id), [])
  assert.deepEqual(await repository.listWorkflows(owner, alienWorkspaces[0].id, 20), [])
  assert.deepEqual(await repository.listExecutions(owner, alienWorkspaces[0].id, 20), [])
  assert.deepEqual(await repository.listProviders(alien, alienWorkspaces[0].id), [])
  await assert.rejects(bootstrapOwner(repository, {
    email: 'owner@example.test', displayName: 'Captain', password: 'synthetic chosen password',
  }), OwnerEmailAlreadyExistsError)
  assert.equal((await pool.query("SELECT count(*)::integer AS total FROM owners WHERE role = 'super_admin'")).rows[0].total, 0)
  const admin = await bootstrapOwner(repository, {
    email: 'captain@example.test', displayName: 'Captain', password: 'synthetic chosen password',
  })
  assert.equal((await repository.findOwnerByEmail(admin.email)).role, 'super_admin')
  assert.equal(await verifyPassword('synthetic chosen password', (await repository.findOwnerByEmail(admin.email)).passwordHash), true)
  await assert.rejects(bootstrapOwner(repository, {
    email: 'another@example.test', displayName: 'Other', password: 'another synthetic password',
  }), OwnerAlreadyExistsError)
  await assert.rejects(pool.query("UPDATE owners SET role = 'super_admin' WHERE id = $1", [owner]), { code: '23505' })
  const adminWorkspaces = await repository.listWorkspaces(admin.id)
  assert.deepEqual(adminWorkspaces.map((item) => item.name), ['admin workspace', 'Original workspace', 'Original workspace'])
  assert.deepEqual((await pool.query('SELECT workspace_id FROM workspace_members WHERE owner_id = $1', [admin.id])).rows,
    [{ workspace_id: adminWorkspaces[0].id }])
  assert.equal(adminWorkspaces[0].role, 'owner')
  assert.equal(adminWorkspaces.find((item) => item.id === space).role, 'super_admin')
  assert.equal((await repository.getProviderSecret(admin.id, space, provider)).encryptedApiKey, 'v1.synthetic')
  assert.deepEqual((await repository.listWorkspaces(owner)).map((item) => item.id), [space])
  const otherProvider = await repository.createProvider({
    ownerId: alien, workspaceId: alienWorkspaces[0].id, name: 'Other n8n',
    baseUrl: 'http://100.100.10.21:5678', encryptedApiKey: 'v1.other',
  })
  assert.deepEqual((await repository.listProviders(admin.id, alienWorkspaces[0].id)).map((item) => item.id), [otherProvider.id])
  assert.equal((await repository.getProviderSecret(admin.id, alienWorkspaces[0].id, otherProvider.id)).encryptedApiKey, 'v1.other')
  await repository.storeWorkflow(otherProvider.id, {
    providerWorkflowId: 'other-wf', name: 'Other workflow', active: false,
    sanitizedDefinition: {}, privacyMode: 'sanitized_only', sanitizerVersion: '2',
    contentDigest: 'other-digest', sourceUpdatedAt: null,
  })
  await repository.storeExecution(otherProvider.id, {
    providerExecutionId: 'other-ex', providerWorkflowId: 'other-wf', status: 'success', mode: null,
    startedAt: null, stoppedAt: null, durationMs: null, sanitizedContent: {},
    privacyMode: 'sanitized_only', sanitizerVersion: '2', contentDigest: 'other-digest',
  })
  assert.equal((await repository.listWorkflows(admin.id, alienWorkspaces[0].id, 20)).length, 1)
  assert.equal((await repository.listExecutions(admin.id, alienWorkspaces[0].id, 20)).length, 1)
  assert.equal((await repository.dashboardMetrics(admin.id, alienWorkspaces[0].id)).totalExecutions, 1)
  assert.deepEqual(await repository.listWorkflows(owner, alienWorkspaces[0].id, 20), [])
  assert.equal((await repository.listWorkflows(alien, alienWorkspaces[0].id, 20)).length, 1)
  assert.equal(await repository.getProviderSecret(alien, space, provider), undefined)
  const alienSession = '77777777-7777-4777-8777-777777777777'
  await pool.query("INSERT INTO sessions (id, owner_id, token_digest, expires_at, workspace_id) VALUES ($1, $2, 'alien-digest', now()+interval '1 day', $3)",
    [alienSession, alien, alienWorkspaces[0].id])
  assert.equal(await repository.selectWorkspace(alienSession, alien, space), false)
  assert.equal((await repository.resolveSession(alienSession, 'alien-digest', new Date())).workspaceId, alienWorkspaces[0].id)
  const second = await repository.createWorkspace(session, owner, 'Other workspace')
  assert.deepEqual((await pool.query('SELECT owner_id FROM workspace_members WHERE workspace_id = $1', [second.id])).rows,
    [{ owner_id: owner }])
  assert.deepEqual(await repository.listProviders(owner, second.id), [])
  assert.deepEqual(await repository.listWorkflows(owner, second.id, 20), [])
  assert.deepEqual(await repository.listExecutions(owner, second.id, 20), [])
  assert.equal((await repository.dashboardMetrics(owner, space)).totalExecutions, 1)
  assert.equal((await repository.dashboardMetrics(owner, second.id)).totalExecutions, 0)
  assert.equal((await repository.dashboardMetrics(alien, space)).totalExecutions, 0)
  assert.equal(await repository.getProviderSecret(owner, second.id, provider), undefined)
  await assert.rejects(repository.createProvider({
    ownerId: alien, workspaceId: space, name: 'Forbidden', baseUrl: 'http://100.100.10.21:5678', encryptedApiKey: 'v1.synthetic',
  }), /Workspace access is required/)
  const secondProvider = await repository.createProvider({
    ownerId: owner, workspaceId: second.id, name: 'Second n8n', baseUrl: 'http://100.100.10.20:5678', encryptedApiKey: 'v1.second',
  })
  assert.deepEqual((await repository.listProviders(owner, second.id)).map((item) => item.id), [secondProvider.id])
  assert.deepEqual((await repository.listProviders(owner, space)).map((item) => item.id), [provider])
  assert.equal(await repository.getProviderSecret(owner, space, secondProvider.id), undefined)
  assert.equal(await repository.getProviderSecret(alien, second.id, secondProvider.id), undefined)
  assert.equal(await repository.selectWorkspace(session, owner, second.id), true)
  assert.equal((await repository.resolveSession(session, 'synthetic-digest', new Date())).workspaceId, second.id)
  assert.equal(await repository.selectWorkspace(session, alien, space), false)
  assert.equal(await repository.selectWorkspace(session, owner, alienWorkspaces[0].id), false)
  const adminSession = '88888888-8888-4888-8888-888888888888'
  await repository.createSession(adminSession, admin.id, 'admin-digest', new Date(Date.now() + 86_400_000))
  assert.equal(await repository.selectWorkspace(adminSession, admin.id, space), true)
  assert.equal((await repository.resolveSession(adminSession, 'admin-digest', new Date())).workspaceId, space)
  assert.equal(await repository.selectWorkspace(adminSession, admin.id, alienWorkspaces[0].id), true)
  assert.equal((await repository.resolveSession(adminSession, 'admin-digest', new Date())).workspaceId, alienWorkspaces[0].id)
  await repository.revokeSession(session)
  assert.equal(await repository.createWorkspace(session, owner, 'Rejected workspace'), undefined)
  assert.equal((await pool.query('SELECT count(*)::integer AS total FROM workspace_members WHERE owner_id = $1', [owner])).rows[0].total, 2)
  assert.deepEqual((await repository.listWorkspaces(owner)).map((item) => item.id), [space, second.id])
})
