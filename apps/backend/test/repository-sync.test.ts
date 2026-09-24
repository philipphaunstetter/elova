import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Pool } from 'pg'
import { PostgresRepository, type StoredExecution } from '../src/repository.js'

function execution(status: string): StoredExecution {
  return {
    providerExecutionId: 'execution-1', providerWorkflowId: null, status,
    mode: null, startedAt: null, stoppedAt: null, durationMs: null,
    sanitizedContent: { status }, privacyMode: 'sanitized_only',
    sanitizerVersion: '2', contentDigest: 'digest',
  }
}

class SimulatedPool {
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

  async query(): Promise<never> { throw new Error('no pooled connection available') }
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
