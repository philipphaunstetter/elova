import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'

export interface Owner {
  id: string
  email: string
  displayName: string
  passwordHash: string
}

export interface SessionOwner {
  id: string
  email: string
  displayName: string
}

export interface ProviderSummary {
  id: string
  name: string
  baseUrl: string
  status: string
  createdAt: string
  lastSyncedAt: string | null
}

export interface ProviderSecret extends ProviderSummary {
  encryptedApiKey: string
  ownerId: string
}

export interface StoredWorkflow {
  providerWorkflowId: string
  name: string
  active: boolean
  sanitizedDefinition: unknown
  privacyMode: string
  sanitizerVersion: string
  contentDigest: string
  sourceUpdatedAt: string | null
}

export interface StoredExecution {
  providerExecutionId: string
  providerWorkflowId: string | null
  status: string
  mode: string | null
  startedAt: string | null
  stoppedAt: string | null
  durationMs: number | null
  sanitizedContent: unknown
  privacyMode: string
  sanitizerVersion: string
  contentDigest: string
}

export interface DashboardMetrics {
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  successRate: number | null
  averageDurationMs: number | null
}

export interface ElovaRepository {
  createInitialOwner(input: { email: string; displayName: string; passwordHash: string }): Promise<Owner>
  findOwnerByEmail(email: string): Promise<Owner | undefined>
  createSession(sessionId: string, ownerId: string, tokenDigest: string, expiresAt: Date): Promise<void>
  resolveSession(sessionId: string, tokenDigest: string, now: Date): Promise<SessionOwner | undefined>
  revokeSession(sessionId: string): Promise<void>
  listProviders(ownerId: string): Promise<ProviderSummary[]>
  createProvider(input: {
    ownerId: string
    name: string
    baseUrl: string
    encryptedApiKey: string
  }): Promise<ProviderSummary>
  getProviderSecret(ownerId: string, providerId: string): Promise<ProviderSecret | undefined>
  withProviderSyncLock<T>(providerId: string, operation: () => Promise<T>): Promise<T>
  storeWorkflow(providerId: string, workflow: StoredWorkflow): Promise<void>
  storeExecution(providerId: string, execution: StoredExecution): Promise<void>
  getSyncCursor(providerId: string, kind: string): Promise<string | null>
  finishSync(providerId: string, kind: string, cursor: string | null, processed: number): Promise<void>
  failSync(providerId: string, kind: string): Promise<void>
  listWorkflows(ownerId: string, limit: number): Promise<unknown[]>
  listExecutions(ownerId: string, limit: number): Promise<unknown[]>
  dashboardMetrics(ownerId: string): Promise<DashboardMetrics>
}

export class OwnerAlreadyExistsError extends Error {}
export class ProviderOriginAlreadyExistsError extends Error {}
export class ProviderSyncAlreadyRunningError extends Error {}

export class PostgresRepository implements ElovaRepository {
  constructor(private readonly pool: Pool) {}

  async createInitialOwner(input: { email: string; displayName: string; passwordHash: string }): Promise<Owner> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [1_817_652_862])
      const count = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM owners')
      if (count.rows[0]?.count !== '0') throw new OwnerAlreadyExistsError('Initial owner already exists')
      const owner: Owner = { id: randomUUID(), ...input }
      await client.query(
        `INSERT INTO owners (id, email, display_name, password_hash)
         VALUES ($1, lower($2), $3, $4)`,
        [owner.id, owner.email, owner.displayName, owner.passwordHash],
      )
      await client.query('COMMIT')
      return { ...owner, email: owner.email.toLowerCase() }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async findOwnerByEmail(email: string): Promise<Owner | undefined> {
    const result = await this.pool.query<{
      id: string
      email: string
      display_name: string
      password_hash: string
    }>(
      'SELECT id, email, display_name, password_hash FROM owners WHERE email = lower($1)',
      [email],
    )
    const row = result.rows[0]
    return row ? {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      passwordHash: row.password_hash,
    } : undefined
  }

  async createSession(sessionId: string, ownerId: string, tokenDigest: string, expiresAt: Date): Promise<void> {
    await this.pool.query(
      'INSERT INTO sessions (id, owner_id, token_digest, expires_at) VALUES ($1, $2, $3, $4)',
      [sessionId, ownerId, tokenDigest, expiresAt],
    )
  }

  async resolveSession(sessionId: string, tokenDigest: string, now: Date): Promise<SessionOwner | undefined> {
    const result = await this.pool.query<{
      id: string
      email: string
      display_name: string
    }>(
      `SELECT o.id, o.email, o.display_name
       FROM sessions s JOIN owners o ON o.id = s.owner_id
       WHERE s.id = $1 AND s.token_digest = $2 AND s.revoked_at IS NULL AND s.expires_at > $3`,
      [sessionId, tokenDigest, now],
    )
    const row = result.rows[0]
    return row ? { id: row.id, email: row.email, displayName: row.display_name } : undefined
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.pool.query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [sessionId])
  }

  async listProviders(ownerId: string): Promise<ProviderSummary[]> {
    const result = await this.pool.query<{
      id: string
      name: string
      base_url: string
      status: string
      created_at: Date
      last_synced_at: Date | null
    }>(
      `SELECT p.id, p.name, p.base_url, p.status, p.created_at,
              max(c.last_synced_at) AS last_synced_at
       FROM n8n_providers p LEFT JOIN sync_cursors c ON c.provider_id = p.id
       WHERE p.owner_id = $1
       GROUP BY p.id ORDER BY p.created_at`,
      [ownerId],
    )
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
    }))
  }

  async createProvider(input: {
    ownerId: string
    name: string
    baseUrl: string
    encryptedApiKey: string
  }): Promise<ProviderSummary> {
    const id = randomUUID()
    try {
      const result = await this.pool.query<{ created_at: Date }>(
        `INSERT INTO n8n_providers (id, owner_id, name, base_url, encrypted_api_key)
         VALUES ($1, $2, $3, $4, $5) RETURNING created_at`,
        [id, input.ownerId, input.name, input.baseUrl, input.encryptedApiKey],
      )
      return {
        id,
        name: input.name,
        baseUrl: input.baseUrl,
        status: 'unverified',
        createdAt: result.rows[0]!.created_at.toISOString(),
        lastSyncedAt: null,
      }
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ProviderOriginAlreadyExistsError('Provider origin already exists')
      }
      throw error
    }
  }

  async getProviderSecret(ownerId: string, providerId: string): Promise<ProviderSecret | undefined> {
    const result = await this.pool.query<{
      id: string
      owner_id: string
      name: string
      base_url: string
      encrypted_api_key: string
      status: string
      created_at: Date
      last_synced_at: Date | null
    }>(
      `SELECT p.id, p.owner_id, p.name, p.base_url, p.encrypted_api_key, p.status, p.created_at,
              max(c.last_synced_at) AS last_synced_at
       FROM n8n_providers p LEFT JOIN sync_cursors c ON c.provider_id = p.id
       WHERE p.owner_id = $1 AND p.id = $2
       GROUP BY p.id`,
      [ownerId, providerId],
    )
    const row = result.rows[0]
    return row ? {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      baseUrl: row.base_url,
      encryptedApiKey: row.encrypted_api_key,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
    } : undefined
  }

  async withProviderSyncLock<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    let discard = true
    try {
      const acquired = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1::integer, hashtext($2)) AS acquired',
        [1_817_652_863, providerId],
      )
      if (!acquired.rows[0]?.acquired) {
        discard = false
        throw new ProviderSyncAlreadyRunningError('Provider synchronization already in progress')
      }
      try {
        return await operation()
      } finally {
        const released = await client.query<{ released: boolean }>(
          'SELECT pg_advisory_unlock($1::integer, hashtext($2)) AS released',
          [1_817_652_863, providerId],
        )
        if (!released.rows[0]?.released) throw new Error('Provider synchronization lock was lost')
        discard = false
      }
    } finally {
      client.release(discard)
    }
  }

  async storeWorkflow(providerId: string, workflow: StoredWorkflow): Promise<void> {
    await this.pool.query(
      `INSERT INTO workflows (
         id, provider_id, provider_workflow_id, name, active, sanitized_definition,
         privacy_mode, sanitizer_version, content_digest, source_updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (provider_id, provider_workflow_id) DO UPDATE SET
         name = excluded.name, active = excluded.active,
         sanitized_definition = excluded.sanitized_definition,
         privacy_mode = excluded.privacy_mode, sanitizer_version = excluded.sanitizer_version,
         content_digest = excluded.content_digest, source_updated_at = excluded.source_updated_at,
         updated_at = now()`,
      [
        randomUUID(), providerId, workflow.providerWorkflowId, workflow.name, workflow.active,
        workflow.sanitizedDefinition, workflow.privacyMode, workflow.sanitizerVersion,
        workflow.contentDigest, workflow.sourceUpdatedAt,
      ],
    )
  }

  async storeExecution(providerId: string, execution: StoredExecution): Promise<void> {
    await this.pool.query(
      `INSERT INTO executions (
         id, provider_id, workflow_id, provider_execution_id, status, mode, started_at,
         stopped_at, duration_ms, sanitized_content, privacy_mode, sanitizer_version, content_digest
       ) VALUES (
         $1, $2,
         (SELECT id FROM workflows WHERE provider_id = $2 AND provider_workflow_id = $3),
         $4,$5,$6,$7,$8,$9,$10,$11,$12,$13
       )
       ON CONFLICT (provider_id, provider_execution_id) DO UPDATE SET
         status = excluded.status, mode = excluded.mode, stopped_at = excluded.stopped_at,
         duration_ms = excluded.duration_ms, sanitized_content = excluded.sanitized_content,
         privacy_mode = excluded.privacy_mode, sanitizer_version = excluded.sanitizer_version,
         content_digest = excluded.content_digest, updated_at = now()`,
      [
        randomUUID(), providerId, execution.providerWorkflowId, execution.providerExecutionId,
        execution.status, execution.mode, execution.startedAt, execution.stoppedAt,
        execution.durationMs, execution.sanitizedContent, execution.privacyMode,
        execution.sanitizerVersion, execution.contentDigest,
      ],
    )
  }

  async getSyncCursor(providerId: string, kind: string): Promise<string | null> {
    const result = await this.pool.query<{ cursor: string | null }>(
      'SELECT cursor FROM sync_cursors WHERE provider_id = $1 AND sync_kind = $2',
      [providerId, kind],
    )
    return result.rows[0]?.cursor ?? null
  }

  async finishSync(providerId: string, kind: string, cursor: string | null, processed: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_cursors (provider_id, sync_kind, cursor, last_synced_at)
       VALUES ($1,$2,$3,now())
       ON CONFLICT (provider_id, sync_kind) DO UPDATE SET
         cursor = excluded.cursor, last_synced_at = excluded.last_synced_at`,
      [providerId, kind, cursor],
    )
    await this.pool.query(
      `INSERT INTO sync_runs (id, provider_id, sync_kind, status, records_processed, finished_at)
       VALUES ($1,$2,$3,'completed',$4,now())`,
      [randomUUID(), providerId, kind, processed],
    )
    await this.pool.query("UPDATE n8n_providers SET status = 'healthy', updated_at = now() WHERE id = $1", [providerId])
  }

  async failSync(providerId: string, kind: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO sync_runs (id, provider_id, sync_kind, status, error_code, finished_at)
       VALUES ($1,$2,$3,'failed','PROVIDER_SYNC_FAILED',now())`,
      [randomUUID(), providerId, kind],
    )
    await this.pool.query("UPDATE n8n_providers SET status = 'error', updated_at = now() WHERE id = $1", [providerId])
  }

  async listWorkflows(ownerId: string, limit: number): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT w.id, w.provider_workflow_id AS "providerWorkflowId", w.name, w.active,
              w.privacy_mode AS "privacyMode", w.sanitizer_version AS "sanitizerVersion",
              w.content_digest AS "contentDigest", w.source_updated_at AS "sourceUpdatedAt",
              p.id AS "providerId", p.name AS "providerName"
       FROM workflows w JOIN n8n_providers p ON p.id = w.provider_id
       WHERE p.owner_id = $1 ORDER BY w.updated_at DESC LIMIT $2`,
      [ownerId, limit],
    )
    return result.rows
  }

  async listExecutions(ownerId: string, limit: number): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT e.id, e.provider_execution_id AS "providerExecutionId", e.status, e.mode,
              e.started_at AS "startedAt", e.stopped_at AS "stoppedAt", e.duration_ms AS "durationMs",
              e.privacy_mode AS "privacyMode", e.sanitizer_version AS "sanitizerVersion",
              e.content_digest AS "contentDigest", w.name AS "workflowName",
              p.id AS "providerId", p.name AS "providerName"
       FROM executions e JOIN n8n_providers p ON p.id = e.provider_id
       LEFT JOIN workflows w ON w.id = e.workflow_id
       WHERE p.owner_id = $1 ORDER BY e.started_at DESC NULLS LAST LIMIT $2`,
      [ownerId, limit],
    )
    return result.rows
  }

  async dashboardMetrics(ownerId: string): Promise<DashboardMetrics> {
    const result = await this.pool.query<{
      total: string
      successful: string
      failed: string
      average_duration: string | null
    }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE e.status = 'success')::text AS successful,
              count(*) FILTER (WHERE e.status IN ('error','failed','crashed'))::text AS failed,
              avg(e.duration_ms)::text AS average_duration
       FROM executions e JOIN n8n_providers p ON p.id = e.provider_id
       WHERE p.owner_id = $1`,
      [ownerId],
    )
    const row = result.rows[0]!
    const totalExecutions = Number(row.total)
    const successfulExecutions = Number(row.successful)
    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions: Number(row.failed),
      successRate: totalExecutions === 0 ? null : successfulExecutions / totalExecutions,
      averageDurationMs: row.average_duration === null ? null : Math.round(Number(row.average_duration)),
    }
  }
}

export type TransactionClient = PoolClient
