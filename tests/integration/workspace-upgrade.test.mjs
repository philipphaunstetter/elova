// Run only against disposable CI PostgreSQL, never a host or shared database.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const backend = join(root, 'apps/backend')
const requireBackend = createRequire(join(backend, 'package.json'))
const { Pool } = requireBackend('pg')
const { applyMigrations, loadMigrations } = await import(pathToFileURL(join(backend, 'dist/src/migrations.js')))
const { PostgresRepository } = await import(pathToFileURL(join(backend, 'dist/src/repository.js')))
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
  await applyMigrations(pool, migrations)
  const repository = new PostgresRepository(pool)
  const workspaces = await repository.listWorkspaces(owner)
  assert.equal(workspaces.length, 1)
  assert.equal(workspaces[0].name, 'admin workspace')
  const space = workspaces[0].id
  assert.equal((await repository.listProviders(owner, space))[0].id, provider)
  assert.equal((await repository.listWorkflows(owner, space, 20))[0].id, workflow)
  assert.equal((await repository.listExecutions(owner, space, 20))[0].id, execution)
  const saved = await pool.query('SELECT workspace_id FROM sessions WHERE id = $1', [session])
  assert.equal(saved.rows[0].workspace_id, space)
  const alien = '66666666-6666-4666-8666-666666666666'
  assert.equal(await repository.getProviderSecret(alien, space, provider), undefined)
  assert.deepEqual(await repository.listWorkflows(alien, space, 20), [])
  assert.deepEqual(await repository.listExecutions(alien, space, 20), [])
  const second = await repository.createWorkspace(owner, 'Other workspace')
  assert.deepEqual(await repository.listProviders(owner, second.id), [])
  assert.deepEqual(await repository.listWorkflows(owner, second.id, 20), [])
  assert.deepEqual(await repository.listExecutions(owner, second.id, 20), [])
  assert.equal(await repository.selectWorkspace(session, owner, second.id), true)
  assert.equal(await repository.selectWorkspace(session, alien, space), false)
  const content = await readFile(join(backend, 'migrations/0001_postgres_authority.sql'), 'utf8')
  assert.match(content, /privacy_mode/)
})
