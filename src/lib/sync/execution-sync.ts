import { n8nApi } from '@/lib/n8n-api'
import type { N8nExecution, N8nWorkflow } from '@/lib/n8n-api'
import { Database } from 'sqlite3'
import { ConfigManager, getConfigManager } from '@/lib/config/config-manager'
import path from 'path'
import crypto from 'crypto'
import { extractAIMetrics } from '@/lib/services/ai-metrics-extractor'

// Encryption settings (must match provider-service.ts)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'elova-default-encryption-key-change-me'
const ALGORITHM = 'aes-256-gcm'

// SQLite database for execution storage
let db: Database | null = null

function getSQLiteClient(): Database {
  if (!db) {
    const dbPath = ConfigManager.getDefaultDatabasePath()
    db = new Database(dbPath)

    // Initialize execution tables if they don't exist
    db.serialize(() => {
      db!.run(`
        CREATE TABLE IF NOT EXISTS providers (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          api_key_encrypted TEXT NOT NULL,
          is_connected BOOLEAN DEFAULT 1,
          status TEXT DEFAULT 'healthy',
          last_checked_at TEXT,
          metadata TEXT DEFAULT '{}'
        )
      `)

      db!.run(`
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          provider_id TEXT,
          provider_workflow_id TEXT,
          name TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          is_archived BOOLEAN DEFAULT 0,
          is_tracked BOOLEAN DEFAULT 1,
          tags TEXT DEFAULT '[]',
          node_count INTEGER DEFAULT 0,
          workflow_data TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (provider_id) REFERENCES providers (id)
        )
      `)

      db!.run(`
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY,
          provider_id TEXT,
          workflow_id TEXT,
          provider_execution_id TEXT UNIQUE,
          provider_workflow_id TEXT,
          status TEXT,
          mode TEXT,
          started_at TEXT,
          stopped_at TEXT,
          duration INTEGER,
          finished BOOLEAN,
          retry_of TEXT,
          retry_success_id TEXT,
          metadata TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (provider_id) REFERENCES providers (id),
          FOREIGN KEY (workflow_id) REFERENCES workflows (id)
        )
      `)

      db!.run(`
        CREATE TABLE IF NOT EXISTS sync_logs (
          id TEXT PRIMARY KEY,
          provider_id TEXT,
          sync_type TEXT,
          status TEXT,
          completed_at TEXT,
          records_processed INTEGER DEFAULT 0,
          records_inserted INTEGER DEFAULT 0,
          records_updated INTEGER DEFAULT 0,
          error_message TEXT,
          metadata TEXT DEFAULT '{}',
          last_cursor TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (provider_id) REFERENCES providers (id)
        )
      `)
    })
  }
  return db
}

export interface Provider {
  id: string
  user_id: string
  name: string
  base_url: string
  api_key_encrypted: string
  is_connected: boolean
  status: string
  last_checked_at?: string
  metadata?: any
}

export interface SyncOptions {
  provider?: Provider
  syncType?: 'executions' | 'workflows' | 'backups' | 'full'
  batchSize?: number
  maxRetries?: number
  deepSync?: boolean
}

export class ExecutionSyncService {
  private readonly DEFAULT_BATCH_SIZE = 100
  private readonly MAX_RETRIES = 3

  /**
   * Sync executions from all active providers
   */
  async syncAllProviders(options: SyncOptions = {}) {
    console.log('🔄 Starting multi-client execution sync...')

    try {
      // Get all active providers across all users
      const db = getSQLiteClient()
      const providers = await new Promise<Provider[]>((resolve, reject) => {
        db.all(
          'SELECT * FROM providers WHERE is_connected = 1 AND status = ?',
          ['healthy'],
          (err, rows: Provider[]) => {
            if (err) reject(err)
            else resolve(rows || [])
          }
        )
      })

      if (providers.length === 0) {
        console.log('ℹ️ No active providers found')
        return { success: true, providers: 0 }
      }

      console.log(`📡 Found ${providers.length} active providers to sync`)

      // Process all providers concurrently (with error isolation)
      // Decrypt API keys before passing to syncProvider
      const results = await Promise.allSettled(
        providers.map(provider => {
          try {
            const decryptedProvider = {
              ...provider,
              api_key_encrypted: this.decryptApiKey(provider.api_key_encrypted)
            }
            return this.syncProvider(decryptedProvider, options)
          } catch (error) {
            console.error(`Failed to decrypt API key for provider ${provider.name}:`, error)
            return Promise.reject(new Error(`Failed to decrypt API key for ${provider.name}`))
          }
        })
      )

      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      console.log(`✅ Sync completed: ${successful} successful, ${failed} failed`)

      return {
        success: true,
        providers: providers.length,
        successful,
        failed,
        results
      }
    } catch (error) {
      console.error('❌ Multi-provider sync failed:', error)
      throw error
    }
  }

  /**
   * Sync a single provider's data
   */
  async syncProvider(provider: Provider, options: SyncOptions = {}) {
    const syncType = options.syncType || 'executions'

    // Create sync log entry
    const syncLog = await this.createSyncLog(provider.id, syncType)

    try {
      console.log(`🔄 Syncing ${syncType} for provider: ${provider.name}`)

      let result
      switch (syncType) {
        case 'executions':
          result = await this.syncExecutions(provider, options)
          break
        case 'workflows':
          result = await this.syncWorkflows(provider, options)
          break
        case 'backups':
          result = await this.syncWorkflowBackups(provider, options)
          break
        case 'full':
          result = await this.syncFull(provider, options)
          break
        default:
          throw new Error(`Unknown sync type: ${syncType}`)
      }

      // Update sync log as successful
      if (syncLog) {
        await this.completeSyncLog(syncLog.id, 'success', result)
      }

      console.log(`✅ ${syncType} sync completed for ${provider.name}:`, result)
      return result

    } catch (error) {
      console.error(`❌ ${syncType} sync failed for ${provider.name}:`, error)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Update sync log as failed
      if (syncLog) {
        await this.completeSyncLog(syncLog.id, 'error', {}, errorMessage)
      }

      // Update provider health status
      await this.updateProviderHealth(provider.id, 'error', errorMessage)

      throw error
    }
  }

  /**
   * Sync executions for a provider
   */
  private async syncExecutions(provider: Provider, options: SyncOptions) {
    // First ensure all workflows are synced to have proper names
    console.log('📋 Pre-syncing workflows to ensure proper execution metadata...')
    try {
      await this.syncWorkflows(provider, { ...options, silent: true } as any)
    } catch (error) {
      console.warn('⚠️ Workflow pre-sync failed, continuing with execution sync:', error)
    }

    // Use provider configuration directly
    const host = provider.base_url
    const apiKey = provider.api_key_encrypted

    const n8nClient = this.createN8nClient(host, apiKey)

    let totalProcessed = 0
    let totalInserted = 0
    let totalUpdated = 0
    let cursor: string | undefined

    // IMPORTANT: Always start from the beginning (newest executions) to ensure we don't miss recent data
    // The n8n API returns executions in reverse chronological order (newest first)
    // Using a saved cursor can cause us to miss new executions if the previous sync didn't complete
    // We'll rely on the "already finished" check to skip unchanged executions
    cursor = undefined

    console.log(`📥 Fetching executions for ${provider.name} (starting from newest)`)

    do {
      try {
        // OPTIMIZATION: Fetch batch WITHOUT data first to check what we actually need
        // This saves massive bandwidth by not downloading JSON data for existing finished executions
        const response = await n8nClient.getExecutions({
          limit: options.batchSize || this.DEFAULT_BATCH_SIZE,
          cursor,
          includeData: false // Fetch summary only first
        })

        if (!response.data || response.data.length === 0) {
          console.log(`✅ No more executions for ${provider.name}`)
          break
        }

        // Filter out executions that we don't need to update
        // We need to fetch full data ONLY if:
        // 1. The execution is NOT in our DB (new)
        // 3. The execution is for a workflow that is not tracked
        const executionIds = response.data.map((e: N8nExecution) => e.id)
        const existingStatusMap = await this.getExistingExecutionsStatus(provider.id, executionIds)
        const untrackedWorkflowIds = await this.getUntrackedWorkflowIds(provider.id)

        const executionsToFetch = response.data.filter((e: N8nExecution) => {
          // Skip untracked workflows
          if (untrackedWorkflowIds.has(e.workflowId)) return false

          const existingStatus = existingStatusMap.get(e.id)
          if (!existingStatus) return true // New execution
          if (existingStatus !== 'success' && existingStatus !== 'error' && existingStatus !== 'canceled') return true // Not finished
          return false // Already finished and in DB
        })

        console.log(`📊 Batch: ${response.data.length} items. Need to fetch data for: ${executionsToFetch.length}`)

        // If ALL executions in this batch are already in DB and finished, we can stop
        // This means we've reached executions we've already synced
        // UNLESS we are doing a deep sync, in which case we continue
        if (executionsToFetch.length === 0 && !options.deepSync) {
          console.log(`✅ Reached already-synced executions, stopping sync for ${provider.name}`)
          break
        }

        // If we have executions to update, we need their full data
        // There are two strategies:
        // 1. If many items need update (> 50%), re-fetch the whole batch with includeData=true
        // 2. If few items need update, fetch them individually

        let executionsWithData: N8nExecution[] = []

        if (executionsToFetch.length > 0) {
          if (executionsToFetch.length > (response.data.length * 0.5)) {
            // Strategy 1: Re-fetch batch with data
            console.log(`🔄 Re-fetching batch with full data (${executionsToFetch.length}/${response.data.length} needed)...`)
            const fullResponse = await n8nClient.getExecutions({
              limit: options.batchSize || this.DEFAULT_BATCH_SIZE,
              cursor, // Same cursor
              includeData: true
            })
            // Filter again to be safe (though order should be same)
            executionsWithData = fullResponse.data.filter((e: N8nExecution) =>
              executionsToFetch.some((needed: N8nExecution) => needed.id === e.id)
            )
          } else {
            // Strategy 2: Fetch individually (parallelized)
            console.log(`⬇️ Fetching ${executionsToFetch.length} individual executions...`)
            const results = await Promise.allSettled(
              executionsToFetch.map((e: N8nExecution) => n8nClient.getExecution(e.id))
            )
            executionsWithData = results
              .filter((r): r is PromiseFulfilledResult<N8nExecution> => r.status === 'fulfilled')
              .map(r => r.value)
          }
        }

        // Process the batch
        if (executionsWithData.length > 0) {
          const batchResult = await this.processExecutionBatch(
            provider.id,
            executionsWithData
          )
          totalInserted += batchResult.inserted
          totalUpdated += batchResult.updated
        }

        totalProcessed += response.data.length
        cursor = response.nextCursor

      } catch (error) {
        console.error(`❌ Error processing execution batch for ${provider.name}:`, error)
        break
      }
    } while (cursor)

    // Fix execution-workflow relationships
    console.log('🔗 Fixing execution-workflow relationships...')
    await this.fixExecutionWorkflowRelationships(provider.id)

    return {
      type: 'executions',
      processed: totalProcessed,
      inserted: totalInserted,
      updated: totalUpdated,
      lastCursor: cursor
    }
  }

  /**
   * Get set of untracked workflow IDs for a provider
   */
  private async getUntrackedWorkflowIds(providerId: string): Promise<Set<string>> {
    const db = getSQLiteClient()
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT provider_workflow_id FROM workflows WHERE provider_id = ? AND is_tracked = 0',
        [providerId],
        (err, rows: { provider_workflow_id: string }[]) => {
          if (err) reject(err)
          else {
            const ids = new Set(rows.map(r => r.provider_workflow_id))
            resolve(ids)
          }
        }
      )
    })
  }

  /**
   * Get status of existing executions to determine if update is needed
   */
  private async getExistingExecutionsStatus(providerId: string, executionIds: string[]): Promise<Map<string, string>> {
    const db = getSQLiteClient()
    if (executionIds.length === 0) return new Map()

    const placeholders = executionIds.map(() => '?').join(',')

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT provider_execution_id, status FROM executions 
         WHERE provider_id = ? AND provider_execution_id IN (${placeholders})`,
        [providerId, ...executionIds],
        (err, rows: { provider_execution_id: string, status: string }[]) => {
          if (err) reject(err)
          else {
            const map = new Map<string, string>()
            if (rows) {
              rows.forEach(r => map.set(r.provider_execution_id, r.status))
            }
            resolve(map)
          }
        }
      )
    })
  }

  /**
   * Sync workflows and their metadata with full workflow data
   */
  private async syncWorkflows(provider: Provider, options: SyncOptions & { silent?: boolean }) {
    // Use provider configuration directly
    const host = provider.base_url
    const apiKey = provider.api_key_encrypted

    const n8nClient = this.createN8nClient(host, apiKey)

    if (!options.silent) {
      console.log(`📄 Fetching workflows for ${provider.name}`)
    }

    // Get basic workflow list first
    const workflows = await n8nClient.getWorkflows()
    let inserted = 0
    let updated = 0
    let skipped = 0

    for (const n8nWorkflow of workflows) {
      try {
        // Check if we need to fetch full workflow data
        const needsFullData = await this.shouldFetchFullWorkflowData(provider.id, n8nWorkflow)

        let fullWorkflowData = n8nWorkflow
        if (needsFullData) {
          if (!options.silent) {
            console.log(`📥 Fetching full workflow data for: ${n8nWorkflow.name}`)
          }
          // Fetch full workflow definition with nodes and connections
          fullWorkflowData = await n8nClient.getWorkflow(n8nWorkflow.id)
        }

        const result = await this.upsertWorkflow(provider.id, fullWorkflowData)
        if (result.inserted) inserted++
        if (result.updated) updated++
        if (!result.inserted && !result.updated) skipped++
      } catch (error) {
        console.error(`❌ Failed to sync workflow ${n8nWorkflow.name}:`, error)
      }
    }

    if (!options.silent && skipped > 0) {
      console.log(`⏭️ Skipped ${skipped} unchanged workflows`)
    }

    return {
      type: 'workflows',
      processed: workflows.length,
      inserted,
      updated,
      skipped
    }
  }

  /**
   * Sync full workflow definitions for backup
   */
  private async syncWorkflowBackups(provider: Provider, options: SyncOptions) {
    // Use provider configuration directly
    const host = provider.base_url
    const apiKey = provider.api_key_encrypted

    const n8nClient = this.createN8nClient(host, apiKey)

    console.log(`💾 Creating workflow backups for ${provider.name}`)

    // Get workflow list first
    const workflows = await n8nClient.getWorkflows()
    let backedUp = 0

    for (const workflow of workflows) {
      try {
        // Fetch full workflow definition
        const fullWorkflow = await n8nClient.getWorkflow(workflow.id)

        // Store full backup with versioning
        await this.createWorkflowBackup(provider.id, fullWorkflow)
        backedUp++

      } catch (error) {
        console.error(`❌ Failed to backup workflow ${workflow.name}:`, error)
      }
    }

    return {
      type: 'backups',
      processed: workflows.length,
      backedUp
    }
  }

  /**
   * Full sync: executions + workflows + backups
   */
  private async syncFull(provider: Provider, options: SyncOptions) {
    console.log(`🔄 Performing full sync for ${provider.name}`)

    const [executions, workflows, backups] = await Promise.allSettled([
      this.syncExecutions(provider, options),
      this.syncWorkflows(provider, options),
      this.syncWorkflowBackups(provider, options)
    ])

    return {
      type: 'full',
      executions: executions.status === 'fulfilled' ? executions.value : { error: executions.reason },
      workflows: workflows.status === 'fulfilled' ? workflows.value : { error: workflows.reason },
      backups: backups.status === 'fulfilled' ? backups.value : { error: backups.reason }
    }
  }

  /**
   * Process a batch of executions
   */
  private async processExecutionBatch(providerId: string, executions: N8nExecution[]) {
    let inserted = 0
    let updated = 0

    // First, ensure all workflows exist
    const workflowIds = [...new Set(executions.map(e => e.workflowId))]
    await this.ensureWorkflowsExist(providerId, workflowIds)

    // Pre-fetch workflow mapping for this batch to avoid N+1 queries
    const workflowMap = await this.getWorkflowMap(providerId, workflowIds)

    const db = getSQLiteClient()

    // Use transaction for batch processing
    await new Promise<void>((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    try {
      // Process executions
      for (const n8nExecution of executions) {
        try {
          const workflow = workflowMap.get(n8nExecution.workflowId)
          if (!workflow) {
            console.error(`⚠️ Workflow not found for execution ${n8nExecution.id}: ${n8nExecution.workflowId}`)
            continue
          }

          const result = await this.upsertExecution(providerId, n8nExecution, workflow)
          if (result.inserted) inserted++
          if (result.updated) updated++
        } catch (error) {
          console.error(`❌ Failed to process execution ${n8nExecution.id}:`, error)
        }
      }

      await new Promise<void>((resolve, reject) => {
        db.run('COMMIT', (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } catch (error) {
      await new Promise<void>((resolve) => {
        db.run('ROLLBACK', () => resolve())
      })
      throw error
    }

    return { inserted, updated }
  }

  /**
   * Get map of provider_workflow_id -> { id, name }
   */
  private async getWorkflowMap(providerId: string, workflowIds: string[]): Promise<Map<string, { id: string, name: string }>> {
    const db = getSQLiteClient()
    if (workflowIds.length === 0) return new Map()

    const placeholders = workflowIds.map(() => '?').join(',')

    return new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, provider_workflow_id FROM workflows 
         WHERE provider_id = ? AND provider_workflow_id IN (${placeholders})`,
        [providerId, ...workflowIds],
        (err, rows: { id: string, name: string, provider_workflow_id: string }[]) => {
          if (err) reject(err)
          else {
            const map = new Map<string, { id: string, name: string }>()
            if (rows) {
              rows.forEach(r => map.set(r.provider_workflow_id, { id: r.id, name: r.name }))
            }
            resolve(map)
          }
        }
      )
    })
  }

  /**
   * Upsert execution into database
   */
  private async upsertExecution(providerId: string, n8nExecution: N8nExecution, workflow: { id: string, name: string }) {
    const db = getSQLiteClient()

    // Extract AI metrics if execution has data
    // Debug: Check if execution has data
    if (n8nExecution.data) {
      console.log(`🔍 Execution ${n8nExecution.id} has data, attempting AI metrics extraction...`)
    }
    const aiMetrics = n8nExecution.data ? extractAIMetrics({ data: n8nExecution.data }) : null
    if (aiMetrics) {
      if (aiMetrics.totalTokens > 0) {
        console.log(`🤖 AI metrics extracted for execution ${n8nExecution.id}: ${aiMetrics.totalTokens} tokens, $${aiMetrics.aiCost.toFixed(4)} (${aiMetrics.aiProvider})`)
      } else {
        console.log(`ℹ️ Execution ${n8nExecution.id} has data but no AI tokens found`)
      }
    } else {
      console.log(`⚠️ Execution ${n8nExecution.id} has no execution data`)
    }

    const executionData = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider_id: providerId,
      workflow_id: workflow.id,
      provider_execution_id: n8nExecution.id,
      provider_workflow_id: n8nExecution.workflowId,
      status: this.mapN8nStatus(n8nExecution.status),
      mode: await this.getWorkflowMode(providerId, n8nExecution),
      started_at: n8nExecution.startedAt,
      stopped_at: n8nExecution.stoppedAt,
      duration: n8nExecution.stoppedAt
        ? new Date(n8nExecution.stoppedAt).getTime() - new Date(n8nExecution.startedAt).getTime()
        : null,
      finished: n8nExecution.finished ? 1 : 0,
      retry_of: n8nExecution.retryOf,
      retry_success_id: n8nExecution.retrySuccessId,
      // AI Metrics
      execution_data: n8nExecution.data ? JSON.stringify(n8nExecution.data) : null,
      total_tokens: aiMetrics?.totalTokens || 0,
      input_tokens: aiMetrics?.inputTokens || 0,
      output_tokens: aiMetrics?.outputTokens || 0,
      ai_cost: aiMetrics?.aiCost || 0,
      ai_provider: aiMetrics?.aiProvider || null,
      ai_model: aiMetrics?.aiModel || null,
      metadata: JSON.stringify({
        workflowName: workflow.name,
        waitTill: (n8nExecution as any).waitTill,
        originalData: n8nExecution
      })
    }

    // Check if execution exists to determine if it's an insert or update
    const existing = await new Promise<{ id: string } | null>((resolve, reject) => {
      db.get(
        'SELECT id FROM executions WHERE provider_id = ? AND provider_execution_id = ?',
        [providerId, n8nExecution.id],
        (err, row: { id: string }) => {
          if (err) reject(err)
          else resolve(row || null)
        }
      )
    })

    return new Promise<{ updated: boolean, inserted: boolean }>((resolve, reject) => {
      if (existing) {
        // Update existing
        db.run(`
          UPDATE executions SET
            workflow_id = ?, status = ?, mode = ?, started_at = ?, stopped_at = ?,
            duration = ?, finished = ?, retry_of = ?, retry_success_id = ?, metadata = ?,
            execution_data = ?, total_tokens = ?, input_tokens = ?, output_tokens = ?,
            ai_cost = ?, ai_provider = ?, ai_model = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          executionData.workflow_id, executionData.status, executionData.mode,
          executionData.started_at, executionData.stopped_at, executionData.duration,
          executionData.finished, executionData.retry_of, executionData.retry_success_id,
          executionData.metadata, executionData.execution_data, executionData.total_tokens,
          executionData.input_tokens, executionData.output_tokens, executionData.ai_cost,
          executionData.ai_provider, executionData.ai_model, existing.id
        ], function (err) {
          if (err) reject(err)
          else resolve({ updated: true, inserted: false })
        })
      } else {
        // Insert new - use INSERT OR IGNORE to handle race conditions
        db.run(`
          INSERT OR IGNORE INTO executions (
            id, provider_id, workflow_id, provider_execution_id, provider_workflow_id,
            status, mode, started_at, stopped_at, duration, finished, retry_of,
            retry_success_id, metadata, execution_data, total_tokens, input_tokens,
            output_tokens, ai_cost, ai_provider, ai_model
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          executionData.id, executionData.provider_id, executionData.workflow_id,
          executionData.provider_execution_id, executionData.provider_workflow_id,
          executionData.status, executionData.mode, executionData.started_at,
          executionData.stopped_at, executionData.duration, executionData.finished,
          executionData.retry_of, executionData.retry_success_id, executionData.metadata,
          executionData.execution_data, executionData.total_tokens, executionData.input_tokens,
          executionData.output_tokens, executionData.ai_cost, executionData.ai_provider, executionData.ai_model
        ], function (err) {
          if (err) reject(err)
          // Check if row was actually inserted (this.changes > 0) or ignored (this.changes === 0)
          else resolve({ inserted: this.changes > 0, updated: false })
        })
      }
    })
  }

  /**
   * Determine if we need to fetch full workflow data based on change detection
   */
  private async shouldFetchFullWorkflowData(providerId: string, n8nWorkflow: N8nWorkflow): Promise<boolean> {
    const db = getSQLiteClient()

    return new Promise((resolve, reject) => {
      // Check if workflow exists and get last known updated timestamp
      db.get(`
        SELECT id, updated_at, workflow_data
        FROM workflows 
        WHERE provider_id = ? AND provider_workflow_id = ?
      `, [providerId, n8nWorkflow.id], (err, existing: any) => {
        if (err) {
          reject(err)
          return
        }

        if (!existing) {
          // New workflow - always fetch full data
          resolve(true)
          return
        }

        // Check if n8n's updatedAt is different from our stored version
        const n8nUpdatedAt = new Date(n8nWorkflow.updatedAt)
        const existingUpdatedAt = new Date(existing.updated_at)
        const hasTimestampChanged = n8nUpdatedAt.getTime() !== existingUpdatedAt.getTime()

        if (!hasTimestampChanged) {
          // No timestamp change - workflow likely unchanged, skip full fetch
          resolve(false)
          return
        }

        // Timestamp changed - likely has updates, fetch full data
        console.log(`📝 Workflow updated: ${n8nWorkflow.name} (${existingUpdatedAt.toISOString()} -> ${n8nUpdatedAt.toISOString()})`)
        resolve(true)
      })
    })
  }

  /**
   * Upsert workflow into database
   */
  private async upsertWorkflow(providerId: string, n8nWorkflow: N8nWorkflow) {
    const db = getSQLiteClient()

    // Create full workflow JSON data for backup
    const workflowJsonData = {
      ...n8nWorkflow,
      id: n8nWorkflow.id,
      name: n8nWorkflow.name,
      active: n8nWorkflow.active,
      createdAt: n8nWorkflow.createdAt,
      updatedAt: n8nWorkflow.updatedAt,
      nodes: n8nWorkflow.nodes || [],
      connections: n8nWorkflow.connections || {},
      tags: n8nWorkflow.tags || []
    }

    const workflowData = {
      id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider_id: providerId,
      provider_workflow_id: n8nWorkflow.id,
      name: n8nWorkflow.name,
      is_active: n8nWorkflow.active ? 1 : 0,
      is_archived: n8nWorkflow.isArchived ? 1 : 0,
      tags: JSON.stringify(n8nWorkflow.tags || []),
      node_count: n8nWorkflow.nodes?.length || 0,
      workflow_data: JSON.stringify(workflowJsonData)
    }

    // Check if workflow exists and get existing data for change detection
    const existing = await new Promise<{ id: string, updated_at: string, workflow_data: string } | null>((resolve, reject) => {
      db.get(
        'SELECT id, updated_at, workflow_data FROM workflows WHERE provider_id = ? AND provider_workflow_id = ?',
        [providerId, n8nWorkflow.id],
        (err, row: { id: string, updated_at: string, workflow_data: string }) => {
          if (err) reject(err)
          else resolve(row || null)
        }
      )
    })

    return new Promise<{ updated: boolean, inserted: boolean }>((resolve, reject) => {
      if (existing) {
        // Check if anything actually changed
        const n8nUpdatedAt = new Date(n8nWorkflow.updatedAt || new Date())
        const existingUpdatedAt = new Date(existing.updated_at)
        const hasTimestampChanged = n8nUpdatedAt.getTime() !== existingUpdatedAt.getTime()

        if (!hasTimestampChanged) {
          // No changes detected, skip update
          resolve({ updated: false, inserted: false })
          return
        }

        // Update existing workflow with new data
        db.run(`
          UPDATE workflows SET
            name = ?, is_active = ?, is_archived = ?, tags = ?, node_count = ?, workflow_data = ?, workflow_json = ?, updated_at = ?
          WHERE id = ?
        `, [
          workflowData.name, workflowData.is_active, workflowData.is_archived, workflowData.tags,
          workflowData.node_count, workflowData.workflow_data, workflowData.workflow_data, n8nWorkflow.updatedAt || new Date().toISOString(), existing.id
        ], function (err) {
          if (err) reject(err)
          else resolve({ updated: true, inserted: false })
        })
      } else {
        // Insert new workflow
        db.run(`
          INSERT INTO workflows (
            id, provider_id, provider_workflow_id, name, is_active, is_archived, tags, node_count, workflow_data, workflow_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          workflowData.id, workflowData.provider_id, workflowData.provider_workflow_id,
          workflowData.name, workflowData.is_active, workflowData.is_archived, workflowData.tags, workflowData.node_count, workflowData.workflow_data, workflowData.workflow_data,
          n8nWorkflow.createdAt || new Date().toISOString(), n8nWorkflow.updatedAt || new Date().toISOString()
        ], function (err) {
          if (err) reject(err)
          else resolve({ inserted: true, updated: false })
        })
      }
    })
  }

  /**
   * Create workflow backup with versioning
   */
  private async createWorkflowBackup(providerId: string, fullWorkflow: N8nWorkflow) {
    // Store in workflow_data field with timestamp
    const db = getSQLiteClient()
    const backupData = JSON.stringify({
      ...fullWorkflow,
      backup_timestamp: new Date().toISOString(),
      nodes: fullWorkflow.nodes,
      connections: fullWorkflow.connections
    })

    return new Promise<void>((resolve, reject) => {
      db.run(`
        UPDATE workflows SET 
          workflow_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE provider_id = ? AND provider_workflow_id = ?
      `, [backupData, providerId, fullWorkflow.id], function (err) {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * Ensure workflows exist before processing executions
   * Fetches actual workflow data from n8n if not present
   */
  private async ensureWorkflowsExist(providerId: string, workflowIds: string[]) {
    const db = getSQLiteClient()
    const missingWorkflowIds: string[] = []

    // Check which workflows don't exist
    for (const workflowId of workflowIds) {
      const existing = await new Promise<{ id: string } | null>((resolve, reject) => {
        db.get(
          'SELECT id FROM workflows WHERE provider_id = ? AND provider_workflow_id = ?',
          [providerId, workflowId],
          (err, row: { id: string }) => {
            if (err) reject(err)
            else resolve(row || null)
          }
        )
      })

      if (!existing) {
        missingWorkflowIds.push(workflowId)
      }
    }

    // If we have missing workflows, fetch them from n8n
    if (missingWorkflowIds.length > 0) {
      console.log(`📥 Fetching ${missingWorkflowIds.length} missing workflows from n8n...`)

      // Get provider configuration
      const provider = await new Promise<Provider>((resolve, reject) => {
        db.get('SELECT * FROM providers WHERE id = ?', [providerId], (err, row: Provider) => {
          if (err) reject(err)
          else resolve(row)
        })
      })

      if (!provider) {
        throw new Error(`Provider ${providerId} not found`)
      }

      const host = provider.base_url
      const apiKey = this.decryptApiKey(provider.api_key_encrypted)

      const n8nClient = this.createN8nClient(host, apiKey)

      try {
        // Get all workflows from n8n
        const allWorkflows = await n8nClient.getWorkflows()

        // Process missing workflows
        for (const workflowId of missingWorkflowIds) {
          const n8nWorkflow = allWorkflows.find((w: N8nWorkflow) => w.id === workflowId)

          if (n8nWorkflow) {
            // Insert workflow with real data
            await this.upsertWorkflow(providerId, n8nWorkflow)
            console.log(`✅ Added missing workflow: ${n8nWorkflow.name}`)
          } else {
            // If workflow not found in n8n (might be deleted), create placeholder
            console.warn(`⚠️ Workflow ${workflowId} not found in n8n, creating placeholder`)
            await new Promise<void>((resolve, reject) => {
              const id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              db.run(`
                INSERT INTO workflows (
                  id, provider_id, provider_workflow_id, name, is_active
                ) VALUES (?, ?, ?, ?, ?)
              `, [id, providerId, workflowId, `[Deleted] Workflow ${workflowId}`, 0], function (err) {
                if (err) reject(err)
                else resolve()
              })
            })
          }
        }
      } catch (error) {
        console.error('❌ Failed to fetch missing workflows from n8n:', error)
        // Fallback: create placeholders for all missing workflows
        for (const workflowId of missingWorkflowIds) {
          await new Promise<void>((resolve, reject) => {
            const id = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            db.run(`
              INSERT INTO workflows (
                id, provider_id, provider_workflow_id, name, is_active
              ) VALUES (?, ?, ?, ?, ?)
            `, [id, providerId, workflowId, `[Unknown] Workflow ${workflowId}`, 1], function (err) {
              if (err) reject(err)
              else resolve()
            })
          })
        }
      }
    }
  }

  // Helper methods
  private async createSyncLog(providerId: string, syncType: string): Promise<{ id: string } | null> {
    const db = getSQLiteClient()
    const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      await new Promise<void>((resolve, reject) => {
        db.run(`
          INSERT INTO sync_logs (id, provider_id, sync_type, status)
          VALUES (?, ?, ?, ?)
        `, [id, providerId, syncType, 'running'], function (err) {
          if (err) reject(err)
          else resolve()
        })
      })
      return { id }
    } catch (error) {
      console.error('Failed to create sync log:', error)
      return null
    }
  }

  private async completeSyncLog(logId: string, status: string, result: any, errorMessage?: string) {
    const db = getSQLiteClient()
    return new Promise<void>((resolve, reject) => {
      db.run(`
        UPDATE sync_logs SET
          status = ?, completed_at = CURRENT_TIMESTAMP,
          records_processed = ?, records_inserted = ?, records_updated = ?,
          error_message = ?, metadata = ?, last_cursor = ?
        WHERE id = ?
      `, [
        status, result.processed || 0, result.inserted || 0, result.updated || 0,
        errorMessage, JSON.stringify(result), result.lastCursor || null, logId
      ], function (err) {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private async updateProviderHealth(providerId: string, status: string, errorMessage?: string) {
    const db = getSQLiteClient()
    const metadata = errorMessage ? JSON.stringify({ last_error: errorMessage }) : '{}'

    return new Promise<void>((resolve, reject) => {
      db.run(`
        UPDATE providers SET
          status = ?, last_checked_at = CURRENT_TIMESTAMP, metadata = ?
        WHERE id = ?
      `, [status, metadata, providerId], function (err) {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private async getLastSyncCursor(providerId: string, syncType: string): Promise<{ last_cursor: string } | null> {
    const db = getSQLiteClient()

    return new Promise((resolve, reject) => {
      db.get(`
        SELECT last_cursor FROM sync_logs
        WHERE provider_id = ? AND sync_type = ? AND status = 'success'
        ORDER BY completed_at DESC
        LIMIT 1
      `, [providerId, syncType], (err, row: { last_cursor: string }) => {
        if (err) reject(err)
        else resolve(row || null)
      })
    })
  }

  private async updateSyncCursor(providerId: string, syncType: string, cursor: string | null) {
    // Store cursor in provider metadata
    const db = getSQLiteClient()

    // First get current metadata
    const currentMetadata = await new Promise<string>((resolve, reject) => {
      db.get(
        'SELECT metadata FROM providers WHERE id = ?',
        [providerId],
        (err, row: { metadata: string }) => {
          if (err) reject(err)
          else resolve(row?.metadata || '{}')
        }
      )
    })

    // Update metadata with cursor
    const metadata = JSON.parse(currentMetadata)
    if (cursor) {
      metadata[`last_${syncType}_cursor`] = cursor
    } else {
      delete metadata[`last_${syncType}_cursor`]
    }

    return new Promise<void>((resolve, reject) => {
      db.run(
        'UPDATE providers SET metadata = ? WHERE id = ?',
        [JSON.stringify(metadata), providerId],
        function (err) {
          if (err) reject(err)
          else resolve()
        }
      )
    })
  }

  /**
   * Fix execution-workflow relationships based on provider_workflow_id
   * This ensures executions are linked to the correct workflow records
   */
  private async fixExecutionWorkflowRelationships(providerId: string): Promise<void> {
    const db = getSQLiteClient()

    return new Promise((resolve, reject) => {
      // Update all executions to link to the correct workflow based on provider_workflow_id
      // This SQL finds the correct workflow.id based on matching provider_workflow_id
      db.run(`
        UPDATE executions 
        SET workflow_id = (
          SELECT w.id 
          FROM workflows w 
          WHERE w.provider_id = executions.provider_id 
          AND w.provider_workflow_id = executions.provider_workflow_id
          LIMIT 1
        )
        WHERE provider_id = ?
        AND EXISTS (
          SELECT 1 FROM workflows w2
          WHERE w2.provider_id = executions.provider_id
          AND w2.provider_workflow_id = executions.provider_workflow_id
        )
      `, [providerId], function (err) {
        if (err) {
          console.error('❌ Failed to fix execution-workflow relationships:', err)
          reject(err)
        } else {
          const fixedCount = this.changes
          if (fixedCount > 0) {
            console.log(`✅ Fixed ${fixedCount} execution-workflow relationships`)
          }
          resolve()
        }
      })
    })
  }

  private mapN8nStatus(n8nStatus: string): string {
    switch (n8nStatus) {
      case 'success': return 'success'
      case 'failed':
      case 'error':
      case 'crashed': return 'error'
      case 'running': return 'running'
      case 'waiting': return 'waiting'
      case 'canceled': return 'canceled'
      case 'new': return 'waiting'
      default: return 'unknown'
    }
  }

  /**
   * Get workflow mode with enhanced detection
   */
  private async getWorkflowMode(providerId: string, n8nExecution: N8nExecution): Promise<string> {
    try {
      // Try to get workflow details from database first
      const db = getSQLiteClient()
      const workflowData = await new Promise<{ workflow_data: string } | null>((resolve, reject) => {
        db.get(
          'SELECT workflow_data FROM workflows WHERE provider_id = ? AND provider_workflow_id = ?',
          [providerId, n8nExecution.workflowId],
          (err, row: { workflow_data: string }) => {
            if (err) reject(err)
            else resolve(row || null)
          }
        )
      })

      let workflowNodes: any[] = []
      if (workflowData?.workflow_data) {
        try {
          const parsedData = JSON.parse(workflowData.workflow_data)
          workflowNodes = parsedData.nodes || []
        } catch (e) {
          console.warn('Failed to parse workflow data for mode detection')
        }
      }

      return this.mapN8nMode(n8nExecution.mode, n8nExecution, workflowNodes)
    } catch (error) {
      console.warn(`Failed to get workflow mode for ${n8nExecution.workflowId}:`, error)
      return this.mapN8nMode(n8nExecution.mode)
    }
  }

  private mapN8nMode(n8nMode: string, n8nExecution?: N8nExecution, workflowNodes?: any[]): string {
    // Enhanced trigger mode detection using workflow nodes
    if (workflowNodes && workflowNodes.length > 0) {
      const triggerNode = workflowNodes.find(node =>
        node.type?.includes('trigger') ||
        node.type?.includes('webhook') ||
        node.type?.includes('manual') ||
        node.type?.includes('error')
      )

      if (triggerNode) {
        // Detect error triggers
        if (triggerNode.type?.includes('errorTrigger') ||
          triggerNode.type?.includes('Error Trigger') ||
          triggerNode.type === '@n8n/n8n-nodes-base.errorTrigger' ||
          triggerNode.type === 'n8n-nodes-base.errorTrigger' ||
          triggerNode.name?.includes('Error Trigger') ||
          triggerNode.displayName?.includes('Error Trigger')) {
          return 'error'
        }

        // Detect scheduled triggers
        if (triggerNode.type?.includes('schedule') ||
          triggerNode.type?.includes('cron') ||
          triggerNode.type?.includes('interval')) {
          return 'cron'
        }

        // Detect webhook triggers
        if (triggerNode.type?.includes('webhook') ||
          triggerNode.type?.includes('httpRequest')) {
          return 'webhook'
        }

        // Detect manual triggers
        if (triggerNode.type?.includes('manual')) {
          return 'manual'
        }
      }
    }

    // Fall back to n8n's mode classification
    switch (n8nMode) {
      case 'manual': return 'manual'
      case 'trigger': return 'cron' // Default trigger to cron since most are scheduled
      case 'webhook': return 'webhook'
      case 'cron': return 'cron'
      case 'error': return 'error'
      default: return 'unknown'
    }
  }

  private decryptApiKey(encryptedData: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedData.split(':')

      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')

      return decrypted
    } catch (error) {
      console.error('Decryption error:', error)
      throw new Error('Failed to decrypt API key')
    }
  }

  private createN8nClient(baseUrl: string, apiKey: string) {
    // Create n8n client instance with custom credentials
    return {
      async getExecutions(params: any) {
        const searchParams = new URLSearchParams()
        if (params.limit) searchParams.append('limit', params.limit.toString())
        if (params.cursor) searchParams.append('cursor', params.cursor)
        // Include data only if requested (defaults to false in API, but we control it here)
        if (params.includeData) searchParams.append('includeData', 'true')

        const response = await fetch(`${baseUrl}/api/v1/executions?${searchParams}`, {
          headers: {
            'X-N8N-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) throw new Error(`n8n API error: ${response.statusText}`)
        return response.json()
      },

      async getWorkflows() {
        let allWorkflows: any[] = []
        let cursor: string | undefined

        do {
          const url = new URL(`${baseUrl}/api/v1/workflows`)
          if (cursor) url.searchParams.append('cursor', cursor)
          url.searchParams.append('limit', '100')

          const response = await fetch(url.toString(), {
            headers: {
              'X-N8N-API-KEY': apiKey,
              'Accept': 'application/json'
            }
          })

          if (!response.ok) throw new Error(`n8n API error: ${response.statusText}`)
          const data = await response.json()
          if (data.data) {
            allWorkflows = [...allWorkflows, ...data.data]
          }
          cursor = data.nextCursor
        } while (cursor)

        return allWorkflows
      },

      async getWorkflow(id: string) {
        const response = await fetch(`${baseUrl}/api/v1/workflows/${id}`, {
          headers: {
            'X-N8N-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) throw new Error(`n8n API error: ${response.statusText}`)
        return response.json()
      },

      async getExecution(id: string) {
        const response = await fetch(`${baseUrl}/api/v1/executions/${id}?includeData=true`, {
          headers: {
            'X-N8N-API-KEY': apiKey,
            'Accept': 'application/json'
          }
        })

        if (!response.ok) throw new Error(`n8n API error: ${response.statusText}`)
        return response.json()
      }
    }
  }
}

// Export singleton instance
export const executionSync = new ExecutionSyncService()