import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ElovaApplication, type ApplicationRequest } from '../src/application.js'
import type {
  DashboardMetrics,
  ElovaRepository,
  Owner,
  ProviderSecret,
  ProviderSummary,
  SessionOwner,
  Workspace,
  SyncRepository,
  StoredExecution,
  StoredWorkflow,
} from '../src/repository.js'
import { ProviderSyncAlreadyRunningError } from '../src/repository.js'
import { encryptCredential, hashPassword } from '../src/security.js'

const SECRET = Buffer.alloc(32, 9).toString('base64')
const ADMIN_WORKSPACE = '33333333-3333-4333-8333-333333333333'

class MemoryRepository implements ElovaRepository {
  owner?: Owner
  session: { id: string; ownerId: string; digest: string; expiresAt: Date } | undefined
  workspaces: Workspace[] = [{ id: ADMIN_WORKSPACE, name: 'admin workspace', role: 'owner', createdAt: new Date().toISOString() }]
  activeWorkspaceId: string | null = null
  failCreateSelection = false
  revokeOnSelect = false
  providers: ProviderSecret[] = []
  workflows: StoredWorkflow[] = []
  executions: StoredExecution[] = []
  cursors: Array<string | null> = []
  syncLocks = new Set<string>()
  failedSyncs = 0

  async createInitialOwner(input: { email: string; displayName: string; passwordHash: string }): Promise<Owner> {
    this.owner = { id: '11111111-1111-4111-8111-111111111111', ...input }
    return this.owner
  }
  async findOwnerByEmail(email: string) { return this.owner?.email === email ? this.owner : undefined }
  async createSession(sessionId: string, ownerId: string, digest: string, expiresAt: Date) {
    this.session = { id: sessionId, ownerId, digest, expiresAt }
  }
  async resolveSession(sessionId: string, digest: string, now: Date): Promise<SessionOwner | undefined> {
    if (!this.owner || this.session?.id !== sessionId || this.session.digest !== digest || this.session.expiresAt <= now) return undefined
    return { id: this.owner.id, email: this.owner.email, displayName: this.owner.displayName,
      role: this.owner.role ?? 'super_admin', workspaceId: this.activeWorkspaceId, sessionId }
  }
  async revokeSession() { this.session = undefined }
  async listWorkspaces(): Promise<Workspace[]> { return this.workspaces }
  async createWorkspace(sessionId: string, ownerId: string, name: string): Promise<Workspace | undefined> {
    if (this.failCreateSelection || this.session?.id !== sessionId || this.session.ownerId !== ownerId) return undefined
    const workspace = { id: '44444444-4444-4444-8444-444444444444', name, role: 'owner', createdAt: new Date().toISOString() }
    this.workspaces.push(workspace)
    this.activeWorkspaceId = workspace.id
    return workspace
  }
  async selectWorkspace(sessionId: string, ownerId: string, workspaceId: string): Promise<boolean> {
    if (this.revokeOnSelect) { this.session = undefined; return false }
    const selected = this.workspaces.find((workspace) => workspace.id === workspaceId.toLowerCase())
    if (this.session?.id !== sessionId || this.session.ownerId !== ownerId || !selected) return false
    this.activeWorkspaceId = selected.id
    return true
  }
  async listProviders(_ownerId: string, workspaceId: string): Promise<ProviderSummary[]> {
    return this.providers.filter((item) => item.workspaceId === workspaceId)
  }
  async createProvider(input: { ownerId: string; workspaceId: string; name: string; baseUrl: string; encryptedApiKey: string }) {
    const provider: ProviderSecret = {
      id: '22222222-2222-4222-8222-222222222222', ownerId: input.ownerId, workspaceId: input.workspaceId, name: input.name,
      baseUrl: input.baseUrl, encryptedApiKey: input.encryptedApiKey, status: 'unverified',
      createdAt: new Date().toISOString(), lastSyncedAt: null,
    }
    this.providers.push(provider)
    return provider
  }
  async getProviderSecret(ownerId: string, workspaceId: string, providerId: string) {
    return this.providers.find((item) => item.id === providerId && item.workspaceId === workspaceId && item.ownerId === ownerId)
  }
  async withProviderSyncLock<T>(providerId: string, operation: (repository: SyncRepository) => Promise<T>): Promise<T> {
    if (this.syncLocks.has(providerId)) throw new ProviderSyncAlreadyRunningError('Provider synchronization already in progress')
    this.syncLocks.add(providerId)
    try {
      return await operation(this)
    } finally {
      this.syncLocks.delete(providerId)
    }
  }
  async storeWorkflow(_providerId: string, workflow: StoredWorkflow) { this.workflows.push(workflow) }
  async storeExecution(_providerId: string, execution: StoredExecution) { this.executions.push(execution) }
  async getSyncCursor() { return null }
  async finishSync(_providerId: string, _kind: string, cursor: string | null) { this.cursors.push(cursor) }
  async failSync() { this.failedSyncs += 1 }
  async listWorkflows(_ownerId: string, workspaceId: string) {
    return workspaceId === ADMIN_WORKSPACE ? this.workflows : []
  }
  async listExecutions(_ownerId: string, workspaceId: string) {
    return workspaceId === ADMIN_WORKSPACE ? this.executions : []
  }
  async dashboardMetrics(): Promise<DashboardMetrics> {
    return { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, successRate: null, averageDurationMs: null }
  }
}

function request(method: string, pathname: string, body?: unknown, cookie?: string, workspaceId?: string): ApplicationRequest {
  return { method, pathname, searchParams: new URLSearchParams(), headers: { cookie, 'x-elova-workspace-id': workspaceId }, body }
}

async function loggedIn(): Promise<{ application: ElovaApplication; repository: MemoryRepository; cookie: string }> {
  const repository = new MemoryRepository()
  repository.owner = {
    id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', displayName: 'Owner',
    passwordHash: await hashPassword('correct horse battery staple'),
  }
  const application = new ElovaApplication(repository, SECRET, SECRET)
  const response = await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner.email, password: 'correct horse battery staple',
  }))
  assert.equal(response?.status, 200)
  const cookie = String(response?.headers?.['set-cookie']).split(';')[0]!
  return { application, repository, cookie }
}

test('operator-created owner can log in and signed session authorizes API access', async () => {
  const { application, cookie } = await loggedIn()
  const session = await application.handle(request('GET', '/v1/auth/session', undefined, cookie))
  const metrics = await application.handle(request('GET', '/v1/dashboard/metrics', undefined, cookie, ADMIN_WORKSPACE))
  assert.equal(session?.status, 200)
  assert.equal(metrics?.status, 200)
})

test('first admin can use empty workspaces without a provider or API key', async () => {
  const { application, repository, cookie } = await loggedIn()
  assert.deepEqual((await application.handle(request('GET', '/v1/auth/session', undefined, cookie)))?.body, {
    user: { id: repository.owner!.id, email: repository.owner!.email,
      displayName: repository.owner!.displayName, role: 'super_admin', workspaceId: ADMIN_WORKSPACE },
  })
  const empty = async (id: string) => {
    assert.deepEqual((await application.handle(request('GET', '/v1/providers', undefined, cookie, id)))?.body, { providers: [] })
    assert.deepEqual((await application.handle(request('GET', '/v1/workflows', undefined, cookie, id)))?.body, { workflows: [] })
    assert.deepEqual((await application.handle(request('GET', '/v1/executions', undefined, cookie, id)))?.body, { executions: [] })
    assert.deepEqual((await application.handle(request('GET', '/v1/dashboard/metrics', undefined, cookie, id)))?.body,
      { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, successRate: null, averageDurationMs: null })
  }
  await empty(ADMIN_WORKSPACE)
  const created = await application.handle(request('POST', '/v1/workspaces', { name: 'Personal workspace' }, cookie))
  assert.equal(created?.status, 201)
  const secondId = repository.workspaces[1]!.id
  assert.deepEqual((await application.handle(request('GET', '/v1/workspaces', undefined, cookie)))?.body,
    { workspaces: repository.workspaces, activeWorkspaceId: secondId })
  await empty(secondId)
  assert.equal((await application.handle(request('POST', '/v1/workspaces/select', { workspaceId: ADMIN_WORKSPACE }, cookie)))?.status, 200)
  await empty(ADMIN_WORKSPACE)
  assert.equal(repository.providers.length, 0)
})

test('wrong password and forged unsigned session are rejected', async () => {
  const { application, repository } = await loggedIn()
  const login = await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner!.email, password: 'incorrect password value',
  }))
  const forged = Buffer.from(JSON.stringify({ ownerId: repository.owner!.id })).toString('base64')
  const session = await application.handle(request('GET', '/v1/auth/session', undefined, `elova_session=${forged}`))
  assert.equal(login?.status, 401)
  assert.equal(session?.status, 401)
})

test('login preserves the exact operator password including surrounding spaces', async () => {
  const repository = new MemoryRepository()
  repository.owner = {
    id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', displayName: 'Owner',
    passwordHash: await hashPassword('  correct horse battery staple  '),
  }
  const application = new ElovaApplication(repository, SECRET, SECRET)
  const login = await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner.email, password: '  correct horse battery staple  ',
  }))
  assert.equal(login?.status, 200)
  assert.equal((await application.handle(request('GET', '/v1/auth/session', undefined,
    String(login?.headers?.['set-cookie']).split(';')[0])))?.status, 200)
  assert.equal((await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner.email, password: 'correct horse battery staple',
  })))?.status, 401)
})

test('unknown login emails do not accumulate failed-login buckets or lock the owner', async () => {
  const { application, repository } = await loggedIn()
  for (let index = 0; index < 7; index += 1) {
    assert.equal((await application.handle(request('POST', '/v1/auth/login', {
      email: 'unknown@example.test', password: 'incorrect password value',
    })))?.status, 401)
  }
  assert.equal((await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner!.email, password: 'correct horse battery staple',
  })))?.status, 200)
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await application.handle(request('POST', '/v1/auth/login', {
      email: repository.owner!.email, password: 'incorrect password value',
    })))?.status, 401)
  }
  assert.equal((await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner!.email, password: 'correct horse battery staple',
  })))?.status, 429)
})

test('workspace creation and switching scope provider, workflow, execution and metric requests', async () => {
  const { application, repository, cookie } = await loggedIn()
  assert.deepEqual((await application.handle(request('GET', '/v1/workspaces', undefined, cookie)))?.body,
    { workspaces: repository.workspaces, activeWorkspaceId: ADMIN_WORKSPACE })
  assert.equal((await application.handle(request('GET', '/v1/workspaces')))?.status, 401)
  const provider = await application.handle(request('POST', '/v1/providers', {
    name: 'Synthetic n8n', baseUrl: 'http://100.100.10.20:5678', apiKey: 'synthetic-only',
  }, cookie, ADMIN_WORKSPACE))
  assert.equal(provider?.status, 201)
  assert.equal(repository.providers[0]?.workspaceId, ADMIN_WORKSPACE)
  assert.equal((await application.handle(request('POST', '/v1/workspaces/select', {
    workspaceId: '55555555-5555-4555-8555-555555555555',
  }, cookie)))?.status, 404)
  const created = await application.handle(request('POST', '/v1/workspaces', { name: 'Second workspace' }, cookie))
  assert.equal(created?.status, 201)
  assert.equal(repository.workspaces[1]?.name, 'Second workspace')
  const secondWorkspace = repository.workspaces[1]!.id
  assert.deepEqual((await application.handle(request('GET', '/v1/providers', undefined, cookie, secondWorkspace)))?.body,
    { providers: [] })
  assert.equal((await application.handle(request('POST', `/v1/providers/${repository.providers[0]?.id}/sync`, undefined, cookie, secondWorkspace)))?.status, 404)
  assert.deepEqual((await application.handle(request('GET', '/v1/workflows', undefined, cookie, secondWorkspace)))?.body, { workflows: [] })
  assert.deepEqual((await application.handle(request('GET', '/v1/executions', undefined, cookie, secondWorkspace)))?.body, { executions: [] })
  assert.equal((await application.handle(request('POST', '/v1/workspaces/select', { workspaceId: ADMIN_WORKSPACE }, cookie)))?.status, 200)
  assert.equal(((await application.handle(request('GET', '/v1/providers', undefined, cookie, ADMIN_WORKSPACE)))?.body as { providers: unknown[] }).providers.length, 1)
})

test('uppercase workspace UUIDs select and scope the same canonical workspace', async () => {
  const { application, repository, cookie } = await loggedIn()
  const id = 'aabbccdd-abcd-4abc-8abc-abcdefabcdef'
  repository.workspaces.push({ id, name: 'Mixed-case workspace', role: 'owner', createdAt: new Date().toISOString() })
  const selected = await application.handle(request('POST', '/v1/workspaces/select', { workspaceId: id.toUpperCase() }, cookie))
  assert.deepEqual(selected?.body, { activeWorkspaceId: id })
  assert.equal(repository.activeWorkspaceId, id)
  assert.deepEqual((await application.handle(request('GET', '/v1/providers', undefined, cookie, id.toUpperCase())))?.body,
    { providers: [] })
  assert.deepEqual((await application.handle(request('GET', '/v1/workspaces', undefined, cookie)))?.body,
    { workspaces: repository.workspaces, activeWorkspaceId: id })
})

test('stale two-tab workspace requests cannot place credentials or read evidence in another workspace', async () => {
  const { application, repository, cookie } = await loggedIn()
  const second = await application.handle(request('POST', '/v1/workspaces', { name: 'Second workspace' }, cookie))
  assert.equal(second?.status, 201)
  const secondId = repository.workspaces[1]!.id
  const connection = { name: 'Synthetic n8n', baseUrl: 'http://100.100.10.20:5678', apiKey: 'synthetic-only' }
  assert.equal((await application.handle(request('POST', '/v1/providers', connection, cookie)))?.status, 400)
  assert.equal((await application.handle(request('POST', '/v1/providers', connection, cookie, '66666666-6666-4666-8666-666666666666')))?.status, 409)
  assert.equal((await application.handle(request('POST', '/v1/providers', connection, cookie, ADMIN_WORKSPACE)))?.status, 409)
  assert.equal((await application.handle(request('GET', '/v1/providers', undefined, cookie, ADMIN_WORKSPACE)))?.status, 409)
  assert.equal((await application.handle(request('GET', '/v1/workflows', undefined, cookie, ADMIN_WORKSPACE)))?.status, 409)
  assert.equal((await application.handle(request('GET', '/v1/executions', undefined, cookie, ADMIN_WORKSPACE)))?.status, 409)
  assert.equal((await application.handle(request('GET', '/v1/dashboard/metrics', undefined, cookie, ADMIN_WORKSPACE)))?.status, 409)
  assert.equal(repository.providers.length, 0)
  assert.equal((await application.handle(request('POST', '/v1/providers', connection, cookie, secondId)))?.status, 201)
  assert.equal(repository.providers[0]?.workspaceId, secondId)
  assert.equal((await application.handle(request('POST', `/v1/providers/${repository.providers[0]?.id}/sync`, undefined, cookie, ADMIN_WORKSPACE)))?.status, 409)
  assert.equal((await application.handle(request('POST', '/v1/workspaces/select', { workspaceId: ADMIN_WORKSPACE }, cookie)))?.status, 200)
  assert.equal((await application.handle(request('POST', '/v1/providers', connection, cookie, ADMIN_WORKSPACE)))?.status, 201)
  assert.equal(repository.providers[1]?.workspaceId, ADMIN_WORKSPACE)
  assert.equal((await application.handle(request('POST', '/v1/providers', connection, cookie, secondId)))?.status, 409)
})

test('failed workspace creation selection never reports a successful creation', async () => {
  const { application, repository, cookie } = await loggedIn()
  repository.failCreateSelection = true
  assert.equal((await application.handle(request('POST', '/v1/workspaces', { name: 'Second workspace' }, cookie)))?.status, 401)
  assert.equal(repository.workspaces.length, 1)
  assert.equal(repository.activeWorkspaceId, ADMIN_WORKSPACE)
})

test('selection revoked during a request returns unauthorized instead of claiming the workspace is absent', async () => {
  const { application, repository, cookie } = await loggedIn()
  repository.revokeOnSelect = true
  const response = await application.handle(request('POST', '/v1/workspaces/select', { workspaceId: ADMIN_WORKSPACE }, cookie))
  assert.equal(response?.status, 401)
  assert.equal(repository.activeWorkspaceId, ADMIN_WORKSPACE)
})

test('overlapping provider syncs cannot overwrite fresher execution outcomes', async () => {
  const { repository, cookie } = await loggedIn()
  repository.providers.push({
    id: '22222222-2222-4222-8222-222222222222', ownerId: repository.owner!.id, workspaceId: ADMIN_WORKSPACE,
    name: 'n8n', baseUrl: 'http://100.100.10.20:5678', encryptedApiKey: encryptCredential('test-api-key', SECRET),
    status: 'unverified', createdAt: new Date().toISOString(), lastSyncedAt: null,
  })
  let signalFirstFetch!: () => void
  let releaseFirstFetch!: () => void
  const firstFetchStarted = new Promise<void>((resolve) => { signalFirstFetch = resolve })
  const waitForRelease = new Promise<void>((resolve) => { releaseFirstFetch = resolve })
  let executionFetches = 0
  const fetchImplementation: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname
    if (path.endsWith('/workflows')) return Response.json({ data: [] })
    executionFetches += 1
    if (executionFetches === 1) {
      signalFirstFetch()
      await waitForRelease
    }
    return Response.json({ data: [{ id: 'ex-1', status: executionFetches === 1 ? 'running' : 'success' }] })
  }
  const firstApplication = new ElovaApplication(repository, SECRET, SECRET, fetchImplementation)
  const secondApplication = new ElovaApplication(repository, SECRET, SECRET, fetchImplementation)
  const path = '/v1/providers/22222222-2222-4222-8222-222222222222/sync'
  const first = firstApplication.handle(request('POST', path, undefined, cookie, ADMIN_WORKSPACE))
  await firstFetchStarted
  const overlapping = await secondApplication.handle(request('POST', path, undefined, cookie, ADMIN_WORKSPACE))
  assert.equal(overlapping?.status, 409)
  assert.equal(executionFetches, 1)
  assert.equal(repository.failedSyncs, 0)
  releaseFirstFetch()
  assert.equal((await first)?.status, 200)
  assert.equal((await secondApplication.handle(request('POST', path, undefined, cookie, ADMIN_WORKSPACE)))?.status, 200)
  assert.equal(repository.executions.at(-1)?.status, 'success')
})

test('provider synchronization stores only sanitized workflow and execution representations', async () => {
  const { application, repository, cookie } = await loggedIn()
  const created = await application.handle(request('POST', '/v1/providers', {
    name: 'Client automation', baseUrl: 'http://100.100.10.20:5678', apiKey: 'private-api-key',
  }, cookie, ADMIN_WORKSPACE))
  assert.equal(created?.status, 201)

  const fetchImplementation: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname
    const data = path.endsWith('/workflows')
      ? [{ id: 'wf-1', name: 'Jane Doe intake', active: true, nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'jane@example.test', type: 'jane@example.test', authorization: 'secret' } }] }]
      : [{ id: 'ex-1', workflowId: 'wf-1', status: 'success', data: { json: { 'jane@example.test': 'secret', type: 'jane@example.test' } } }]
    return new Response(JSON.stringify({ data, nextCursor: 'sensitive-provider-cursor' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const syncApplication = new ElovaApplication(repository, SECRET, SECRET, fetchImplementation)
  const response = await syncApplication.handle(request(
    'POST', '/v1/providers/22222222-2222-4222-8222-222222222222/sync', undefined, cookie, ADMIN_WORKSPACE,
  ))
  assert.equal(response?.status, 200)
  const stored = JSON.stringify({ workflows: repository.workflows, executions: repository.executions, cursors: repository.cursors })
  assert.doesNotMatch(stored, /Jane Doe|jane@example\.test|private-api-key|sensitive-provider-cursor/)
  assert.match(stored, /sanitized_only/)

})
