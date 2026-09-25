import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import type { Pool } from 'pg'
import { PostgresRepository } from '../src/repository.js'

const user = '11111111-1111-4111-8111-111111111111'
const workspace = '22222222-2222-4222-8222-222222222222'
const item = '33333333-3333-4333-8333-333333333333'

test('all provider and evidence list SQL scopes both user membership and active workspace', async () => {
  const calls: { sql: string; params: unknown[] }[] = []
  const pool = { async query(sql: string, params: unknown[]) {
    calls.push({ sql, params })
    return { rows: [] }
  } } as unknown as Pool
  const repository = new PostgresRepository(pool)
  await repository.listProviders(user, workspace)
  await repository.getProviderSecret(user, workspace, item)
  await repository.listWorkflows(user, workspace, 20)
  await repository.listExecutions(user, workspace, 20)
  await repository.dashboardMetrics(user, workspace).catch(() => undefined) // empty fake aggregate
  assert.equal(calls.length, 5)
  for (const { sql, params } of calls) {
    assert.match(sql, /JOIN workspace_members m ON m\.workspace_id = p\.workspace_id AND m\.owner_id = \$1/)
    assert.match(sql, /WHERE p\.workspace_id = \$2 AND p\.owner_id = \$1/)
    assert.deepEqual(params.slice(0, 2), [user, workspace])
  }
})

test('forward migration preserves old data, creates distinct workspace membership and scopes providers', async () => {
  const sql = await readFile('migrations/0002_workspaces.sql', 'utf8')
  assert.match(sql, /UPDATE n8n_providers p SET workspace_id/)
  assert.match(sql, /UPDATE sessions s SET workspace_id/)
  assert.match(sql, /CREATE TABLE workspace_members/)
  assert.match(sql, /'admin workspace'/)
  assert.match(sql, /UNIQUE\(workspace_id, base_url\)/)
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM|DROP COLUMN)\b/i)
})
