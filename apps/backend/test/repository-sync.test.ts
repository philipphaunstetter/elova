import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Pool } from 'pg'
import { PostgresRepository, ProviderSyncCapacityError, type StoredExecution } from '../src/repository.js'

function execution(status: string): StoredExecution {
  return {
    providerExecutionId: 'execution-1', providerWorkflowId: null, status,
    mode: null, startedAt: null, stoppedAt: null, durationMs: null,
    sanitizedContent: { status }, privacyMode: 'sanitized_only',
    sanitizerVersion: '2', contentDigest: 'digest',
  }
}

class SimulatedPool {
  options = { max: 10 }
  clients: Array<{ connected: boolean; released: boolean }> = []
  storedStatuses: string[] = []

  async connect() {
    const state = { connected: true, released: false }
    this.clients.push(state)
    return {
      query: async (sql: string, values?: unknown[]) => {
        if (!state.connected) throw new Error('connection lost')
        if (sql.includes('INSERT INTO executions')) this.storedStatuses.push(String(values?.[4]))
        return { rows: [{ acquired: true, released: true, cursor: null }] }
      },
      release: () => { state.released = true },
    }
  }

  async query(): Promise<{ rows: unknown[] }> { throw new Error('no pooled connection available') }
}

class CapacityPool extends SimulatedPool {
  override async query(): Promise<{ rows: unknown[] }> {
    if (this.clients.filter((client) => !client.released).length >= this.options.max) {
      throw new Error('no pooled connection available')
    }
    return { rows: [{ ready: true }] }
  }
}

test('provider sync uses its leased connection and refuses writes after lock loss', async () => {
  const pool = new SimulatedPool()
  const repository = new PostgresRepository(pool as unknown as Pool)
  let signalStarted!: () => void
  let releaseFetch!: () => void
  const fetchStarted = new Promise<void>((resolve) => { signalStarted = resolve })
  const fetchReleased = new Promise<void>((resolve) => { releaseFetch = resolve })
  const providerId = '22222222-2222-4222-8222-222222222222'

  const oldSync = repository.withProviderSyncLock(providerId, async (syncRepository) => {
    assert.equal(await syncRepository.getSyncCursor(providerId, 'executions'), null)
    signalStarted()
    await fetchReleased
    await syncRepository.storeExecution(providerId, execution('running'))
  })
  await fetchStarted
  pool.clients[0]!.connected = false
  await new PostgresRepository(pool as unknown as Pool).withProviderSyncLock(providerId, async (syncRepository) => {
    await syncRepository.storeExecution(providerId, execution('success'))
  })
  releaseFetch()
  await assert.rejects(oldSync, /connection lost/)
  assert.deepEqual(pool.storedStatuses, ['success'])
  assert.equal(pool.clients.every((client) => client.released), true)
})

test('provider sync admission reserves pooled connections for ordinary queries', async () => {
  const pool = new CapacityPool()
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const attempts = Array.from({ length: 10 }, (_, index) =>
    new PostgresRepository(pool as unknown as Pool).withProviderSyncLock(`provider-${index}`, async () => {
      await held
      return index
    }).then((value) => ({ value }), (failure: unknown) => ({ failure })),
  )
  await new Promise<void>((resolve) => setImmediate(resolve))
  try {
    assert.equal(pool.clients.filter((client) => !client.released).length, 4)
    assert.deepEqual(await pool.query(), { rows: [{ ready: true }] })
  } finally {
    release()
  }
  const results = await Promise.all(attempts)
  assert.deepEqual(results.slice(0, 4), [0, 1, 2, 3].map((value) => ({ value })))
  assert.equal(results.slice(4).every((item) => 'failure' in item && item.failure instanceof ProviderSyncCapacityError), true)
  assert.equal(await new PostgresRepository(pool as unknown as Pool).withProviderSyncLock('next', async () => 'retry'), 'retry')
})
