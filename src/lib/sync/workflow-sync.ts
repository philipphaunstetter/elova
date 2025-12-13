import { Database } from 'sqlite3'
import { ConfigManager } from '@/lib/config/config-manager'
import { getDb } from '@/lib/db'
import { n8nApi, N8nWorkflow } from '@/lib/n8n-api'
import crypto from 'crypto'

// Encryption settings (must match provider-service.ts)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'elova-default-encryption-key-change-me'
const ALGORITHM = 'aes-256-gcm'

interface Provider {
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

export class WorkflowSyncService {
  private getSQLiteClient(): Database {
    // Use the shared database connection to ensure we're using the same database file
    // as the rest of the application
    return getDb()
  }

  /**
   * Decrypt API key from storage
   */
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

  /**
   * Sync workflows from all active providers
   */
  async syncAllProviders(): Promise<{
    success: boolean
    providers: number
    successful: number
    failed: number
    results: PromiseSettledResult<any>[]
  }> {
    console.log('🔄 Starting multi-provider workflow sync...')

    try {
      // Get all active providers
      const db = this.getSQLiteClient()
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

      // db.close() // Using shared connection, don't close

      if (providers.length === 0) {
        console.log('ℹ️ No active providers found')
        return { success: true, providers: 0, successful: 0, failed: 0, results: [] }
      }

      console.log(`📡 Found ${providers.length} active providers to sync`)

      // Process all providers concurrently (with error isolation)
      const results = await Promise.allSettled(
        providers.map(provider => {
          try {
            let decryptedApiKey = ''
            if (provider.api_key_encrypted) {
              decryptedApiKey = this.decryptApiKey(provider.api_key_encrypted)
            } else {
              console.warn(`⚠️ Provider ${provider.name} has no API key`)
            }

            return this.syncProvider({
              id: provider.id,
              name: provider.name,
              baseUrl: provider.base_url,
              apiKey: decryptedApiKey
            })
          } catch (error) {
            console.error(`Failed to process provider ${provider.name}:`, error)
            return Promise.reject(error)
          }
        })
      )

      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      console.log(`✅ Workflow sync completed: ${successful} successful, ${failed} failed`)

      return {
        success: true,
        providers: providers.length,
        successful,
        failed,
        results
      }
    } catch (error) {
      console.error('❌ Multi-provider workflow sync failed:', error)
      throw error
    }
  }

  /**
   * Sync workflows for a specific provider
   */
  async syncProvider(provider: { id: string; name: string; baseUrl: string; apiKey: string }): Promise<{
    synced: number
    created: number
    updated: number
    archived: number
    skipped: number
    errors: string[]
  }> {
    const db = this.getSQLiteClient()
    const errors: string[] = []
    let synced = 0
    let created = 0
    let updated = 0
    let archived = 0

    console.log(`🔄 Starting workflow sync for provider: ${provider.name}...`)

    try {
      // Fetch workflows from this specific n8n instance with pagination
      const n8nApiUrl = `${provider.baseUrl.replace(/\/$/, '')}/api/v1/workflows`
      let n8nWorkflows: any[] = []
      let cursor: string | undefined

      do {
        const url = new URL(n8nApiUrl)
        if (cursor) {
          url.searchParams.append('cursor', cursor)
        }
        url.searchParams.append('limit', '100')

        const headers: Record<string, string> = {
          'Accept': 'application/json'
        }

        if (provider.apiKey.startsWith('ey') && provider.apiKey.includes('.')) {
          headers['Authorization'] = `Bearer ${provider.apiKey}`
        } else {
          headers['X-N8N-API-KEY'] = provider.apiKey
        }

        const response = await fetch(url.toString(), {
          headers
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch workflows from ${provider.name}: ${response.statusText}`)
        }

        const data = await response.json()
        if (data.data) {
          n8nWorkflows = [...n8nWorkflows, ...data.data]
        }
        cursor = data.nextCursor
      } while (cursor)
      const n8nWorkflowIds = new Set<string>(n8nWorkflows.map((w: any) => String(w.id)))

      console.log(`📡 Found ${n8nWorkflows.length} workflows in ${provider.name}`)

      // Process each workflow
      let skipped = 0
      for (const n8nWorkflow of n8nWorkflows) {
        try {
          const result = await this.syncWorkflow(db, provider.id, n8nWorkflow)
          synced++
          if (result.created) created++
          if (result.updated) updated++
          if (result.skipped) skipped++
        } catch (error) {
          const message = `Failed to sync workflow ${n8nWorkflow.name}: ${error}`
          console.error('❌', message)
          errors.push(message)
        }
      }

      if (skipped > 0) {
        console.log(`⏭️ Skipped ${skipped} unchanged workflows (smart sync)`)
      }

      // Mark workflows as archived if they're no longer in this n8n instance
      const archivedCount = await this.archiveDeletedWorkflowsForProvider(db, provider.id, n8nWorkflowIds)
      archived = archivedCount

      // db.close() // Using shared connection, don't close

      console.log(`✅ Workflow sync completed for ${provider.name}: ${synced} synced, ${created} created, ${updated} updated, ${archived} archived`)

      return {
        synced,
        created,
        updated,
        archived,
        errors,
        skipped: skipped || 0
      }
    } catch (error) {
      console.error(`❌ Workflow sync failed for ${provider.name}:`, error)
      // db.close() // Using shared connection, don't close
      throw error
    }
  }

  /**
   * Sync workflows from n8n with backup and archiving logic (legacy method using default n8n API)
   */
  async syncWorkflows(): Promise<{
    synced: number
    created: number
    updated: number
    archived: number
    skipped: number
    errors: string[]
  }> {
    const db = this.getSQLiteClient()
    const errors: string[] = []
    let synced = 0
    let created = 0
    let updated = 0
    let archived = 0

    console.log('🔄 Starting workflow sync with backup and archiving...')

    try {
      // Get current workflows from n8n
      const n8nWorkflows = await n8nApi.getWorkflows()
      const n8nWorkflowIds = new Set(n8nWorkflows.map(w => w.id))

      console.log(`📡 Found ${n8nWorkflows.length} workflows in n8n`)

      // Ensure default provider exists
      const providerId = await this.ensureDefaultProvider(db)

      // Process each n8n workflow with smart change detection
      let skipped = 0
      for (const n8nWorkflow of n8nWorkflows) {
        try {
          const result = await this.syncWorkflow(db, providerId, n8nWorkflow)
          synced++
          if (result.created) created++
          if (result.updated) updated++
          if (result.skipped) skipped++
        } catch (error) {
          const message = `Failed to sync workflow ${n8nWorkflow.name}: ${error}`
          console.error('❌', message)
          errors.push(message)
        }
      }

      if (skipped > 0) {
        console.log(`⏭️ Skipped ${skipped} unchanged workflows (smart sync)`)
      }

      // Mark workflows as deleted from n8n if they're no longer found
      const archivedCount = await this.archiveDeletedWorkflows(db, n8nWorkflowIds)
      archived = archivedCount

      // db.close() // Using shared connection, don't close

      console.log(`✅ Workflow sync completed: ${synced} synced, ${created} created, ${updated} updated, ${archived} archived`)

      return {
        synced,
        created,
        updated,
        archived,
        errors,
        skipped: skipped || 0
      }
    } catch (error) {
      console.error('❌ Workflow sync failed:', error)
      // db.close() // Using shared connection, don't close
      throw error
    }
  }

  /**
   * Sync a single workflow with intelligent change detection using updatedAt timestamps
   */
  private async syncWorkflow(
    db: Database,
    providerId: string,
    n8nWorkflow: N8nWorkflow
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    return new Promise((resolve, reject) => {
      // Check if workflow already exists and get last known updated timestamp
      db.get(`
        SELECT id, workflow_data, updated_at
        FROM workflows 
        WHERE provider_id = ? AND provider_workflow_id = ?
      `, [providerId, n8nWorkflow.id], (err, existing: any) => {
        if (err) {
          reject(err)
          return
        }

        const workflowData = {
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

        // Extract cron schedules from workflow nodes
        const cronSchedules = this.extractCronSchedules(n8nWorkflow)

        const now = new Date().toISOString()
        const n8nUpdatedAt = new Date(n8nWorkflow.updatedAt)

        if (!existing) {
          // Create new workflow
          const workflowId = `wf_${Date.now()}_${n8nWorkflow.id}`

          db.run(`
            INSERT INTO workflows (
              id, provider_id, provider_workflow_id, name, is_active,
              tags, node_count, workflow_data, cron_schedules, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            workflowId,
            providerId,
            n8nWorkflow.id,
            n8nWorkflow.name,
            n8nWorkflow.active ? 1 : 0,
            JSON.stringify(n8nWorkflow.tags || []),
            n8nWorkflow.nodes?.length || 0,
            JSON.stringify(workflowData),
            JSON.stringify(cronSchedules),
            n8nWorkflow.createdAt || now,
            n8nWorkflow.updatedAt || now
          ], (err) => {
            if (err) {
              reject(err)
            } else {
              console.log(`✅ Created workflow backup: ${n8nWorkflow.name}`)
              resolve({ created: true, updated: false, skipped: false })
            }
          })
        } else {
          const existingUpdatedAt = new Date(existing.updated_at)

          // SMART CHANGE DETECTION: Compare n8n's updatedAt with our stored updatedAt
          const hasTimestampChanged = n8nUpdatedAt.getTime() !== existingUpdatedAt.getTime()

          if (!hasTimestampChanged) {
            // Workflow hasn't changed since last sync - just update active status
            db.run(`
              UPDATE workflows SET
                is_active = ?
              WHERE id = ?
            `, [n8nWorkflow.active ? 1 : 0, existing.id], (err) => {
              if (err) {
                reject(err)
              } else {
                // console.log(`⏭️ Skipped unchanged workflow: ${n8nWorkflow.name}`)
                resolve({ created: false, updated: false, skipped: true })
              }
            })
            return
          }

          // Workflow has changed - check content for version bump
          const existingData = existing.workflow_data ? JSON.parse(existing.workflow_data) : {}
          const hasContentChanged = JSON.stringify(existingData.nodes) !== JSON.stringify(workflowData.nodes) ||
            JSON.stringify(existingData.connections) !== JSON.stringify(workflowData.connections)

          if (hasContentChanged) {
            console.log(`📝 Workflow content changed: ${n8nWorkflow.name}`)
          } else {
            console.log(`📋 Workflow metadata updated: ${n8nWorkflow.name}`)
          }

          // Update existing workflow with new timestamp and data
          db.run(`
            UPDATE workflows SET
              name = ?, is_active = ?, tags = ?, node_count = ?,
              workflow_data = ?, cron_schedules = ?, updated_at = ?
            WHERE id = ?
          `, [
            n8nWorkflow.name,
            n8nWorkflow.active ? 1 : 0,
            JSON.stringify(n8nWorkflow.tags || []),
            n8nWorkflow.nodes?.length || 0,
            JSON.stringify(workflowData),
            JSON.stringify(cronSchedules),
            n8nWorkflow.updatedAt || now,
            existing.id
          ], (err) => {
            if (err) {
              reject(err)
            } else {
              console.log(`✅ Updated workflow backup: ${n8nWorkflow.name}`)
              resolve({ created: false, updated: true, skipped: false })
            }
          })
        }
      })
    })
  }

  /**
   * Mark workflows as archived for a specific provider if they're no longer found
   */
  private async archiveDeletedWorkflowsForProvider(
    db: Database,
    providerId: string,
    currentN8nWorkflowIds: Set<string>
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      // Get all active workflows for this provider
      db.all(`
        SELECT id, provider_workflow_id, name
        FROM workflows 
        WHERE is_active = 1 AND provider_id = ?
      `, [providerId], (err, workflows: any[]) => {
        if (err) {
          reject(err)
          return
        }

        let archivedCount = 0
        let processed = 0

        if (workflows.length === 0) {
          resolve(0)
          return
        }

        // Check each stored workflow
        for (const workflow of workflows) {
          if (!currentN8nWorkflowIds.has(workflow.provider_workflow_id)) {
            // Workflow no longer exists in this n8n instance - mark as inactive
            db.run(`
              UPDATE workflows SET
                is_active = 0,
                updated_at = ?
              WHERE id = ?
            `, [new Date().toISOString(), workflow.id], (err) => {
              processed++

              if (err) {
                console.error(`❌ Failed to archive workflow ${workflow.name}:`, err)
              } else {
                console.log(`📦 Archived workflow: ${workflow.name}`)
                archivedCount++
              }

              if (processed === workflows.length) {
                resolve(archivedCount)
              }
            })
          } else {
            processed++
            if (processed === workflows.length) {
              resolve(archivedCount)
            }
          }
        }
      })
    })
  }

  /**
   * Mark workflows as deleted from n8n if they're no longer found (legacy method)
   */
  private async archiveDeletedWorkflows(
    db: Database,
    currentN8nWorkflowIds: Set<string>
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      // Get all active workflows from our database
      db.all(`
        SELECT id, provider_workflow_id, name
        FROM workflows 
        WHERE is_active = 1
      `, (err, workflows: any[]) => {
        if (err) {
          reject(err)
          return
        }

        let archivedCount = 0
        let processed = 0

        if (workflows.length === 0) {
          resolve(0)
          return
        }

        // Check each stored workflow
        for (const workflow of workflows) {
          if (!currentN8nWorkflowIds.has(workflow.provider_workflow_id)) {
            // Workflow no longer exists in n8n - mark as inactive
            db.run(`
              UPDATE workflows SET
                is_active = 0,
                updated_at = ?
              WHERE id = ?
            `, [new Date().toISOString(), workflow.id], (err) => {
              processed++

              if (err) {
                console.error(`❌ Failed to archive workflow ${workflow.name}:`, err)
              } else {
                console.log(`📦 Archived workflow: ${workflow.name}`)
                archivedCount++
              }

              if (processed === workflows.length) {
                resolve(archivedCount)
              }
            })
          } else {
            processed++
            if (processed === workflows.length) {
              resolve(archivedCount)
            }
          }
        }
      })
    })
  }

  /**
   * Manually archive a workflow (user action)
   */
  async archiveWorkflow(
    workflowId: string,
    reason: string = 'Manually archived by user'
  ): Promise<void> {
    const db = this.getSQLiteClient()

    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE workflows SET
          is_active = 0,
          updated_at = ?
        WHERE id = ?
      `, [new Date().toISOString(), workflowId], (err) => {
        // db.close() // Using shared connection, don't close
        if (err) {
          reject(err)
        } else {
          console.log(`📦 Manually archived workflow: ${workflowId}`)
          resolve()
        }
      })
    })
  }

  /**
   * Delete workflow backup from database (user action)
   */
  async deleteWorkflowBackup(workflowId: string): Promise<void> {
    const db = this.getSQLiteClient()

    return new Promise((resolve, reject) => {
      db.run('DELETE FROM workflows WHERE id = ?', [workflowId], (err) => {
        // db.close() // Using shared connection, don't close
        if (err) {
          reject(err)
        } else {
          console.log(`🗑️ Deleted workflow backup: ${workflowId}`)
          resolve()
        }
      })
    })
  }

  /**
   * Toggle backup setting for a workflow (simplified version)
   */
  async toggleWorkflowBackup(
    workflowId: string,
    backupEnabled: boolean
  ): Promise<void> {
    // Note: backup_enabled column doesn't exist in current schema
    // This is a placeholder for future implementation
    console.log(`💾 Backup toggle requested for workflow ${workflowId}: ${backupEnabled}`)
  }

  /**
   * Toggle tracking for a workflow
   */
  async toggleTracking(
    providerWorkflowId: string,
    isTracked: boolean,
    deleteData: boolean = false
  ): Promise<void> {
    const db = this.getSQLiteClient()

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION')

        // Update tracking status
        db.run(
          'UPDATE workflows SET is_tracked = ? WHERE provider_workflow_id = ?',
          [isTracked ? 1 : 0, providerWorkflowId],
          (err) => {
            if (err) {
              console.error(`Failed to update tracking for workflow ${providerWorkflowId}:`, err)
            }
          }
        )

        if (!isTracked && deleteData) {
          console.log(`🗑️ Deleting executions for untracked workflow: ${providerWorkflowId}`)
          db.run(
            'DELETE FROM executions WHERE workflow_id = (SELECT id FROM workflows WHERE provider_workflow_id = ?)',
            [providerWorkflowId],
            (err) => {
              if (err) {
                console.error(`Failed to delete executions for workflow ${providerWorkflowId}:`, err)
              }
            }
          )
        }

        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Failed to commit transaction:', err)
            db.run('ROLLBACK')
            reject(err)
          } else {
            resolve()
          }
        })
      })
    })
  }

  /**
   * Extract cron schedules from workflow nodes
   * Supports both cron expressions and interval-based schedules
   */
  private extractCronSchedules(n8nWorkflow: N8nWorkflow): Array<{
    nodeName: string
    nodeType: string
    cronExpression: string
  }> {
    const schedules: Array<{
      nodeName: string
      nodeType: string
      cronExpression: string
    }> = []

    const nodes = n8nWorkflow.nodes || []

    for (const node of nodes) {
      // Skip disabled nodes
      if (node.disabled) {
        continue
      }

      // Check for Schedule Trigger nodes
      if (node.type === 'n8n-nodes-base.scheduleTrigger') {
        // console.log(`🔍 Inspecting Schedule Trigger node: ${node.name}`, JSON.stringify(node.parameters, null, 2))
        const params = node.parameters || {}
        const rule = params.rule as any

        // Handle case where rule might be directly on params (older versions?) or structured differently
        // In some versions, it might be params.rule.interval

        // Check if rule exists
        if (!rule) {
          console.log(`⚠️ No rule found for schedule trigger: ${node.name}`)
          continue
        }

        let scheduleString = ''
        const interval = rule.interval?.[0]

        // Handle interval-based schedules
        if (interval && interval.field) {
          if (interval.field === 'cronExpression') {
            scheduleString = interval.expression || ''
          } else if (interval.field === 'seconds') {
            scheduleString = `Every ${interval.secondsInterval || 30} seconds`
          } else if (interval.field === 'minutes') {
            scheduleString = `Every ${interval.minutesInterval || 1} minutes`
          } else if (interval.field === 'hours') {
            scheduleString = `Every ${interval.hoursInterval || 1} hours`
          } else if (interval.field === 'days') {
            scheduleString = `Every ${interval.daysInterval || 1} days`
          } else if (interval.field === 'weeks') {
            scheduleString = `Every ${interval.weeksInterval || 1} weeks`
          } else if (interval.field === 'months') {
            scheduleString = `Every ${interval.monthsInterval || 1} months`
          }
        }

        // Handle specific time schedules (e.g. "Every Day at 6:00")
        if (!scheduleString && (rule.days || rule.hours || rule.minutes)) {
          const days = rule.days && rule.days.length ? rule.days.join(', ') : 'Daily'
          const hours = rule.hours && rule.hours.length ? rule.hours.join(',') : '*'
          const minutes = rule.minutes && rule.minutes.length ? rule.minutes.join(',') : '0'
          scheduleString = `${days} @ ${hours}:${minutes}`
        }

        // Fallback for unknown interval types
        if (!scheduleString && interval) {
          if (interval.field) {
            scheduleString = `${interval.field}: ${JSON.stringify(interval)}`
          } else {
            scheduleString = 'Unknown Schedule'
            console.log(`⚠️ Unknown interval format for ${node.name}:`, JSON.stringify(interval))
            console.log(`🔍 Full parameters for ${node.name}:`, JSON.stringify(node.parameters))
          }
        }

        if (scheduleString) {
          schedules.push({
            nodeName: node.name,
            nodeType: 'Schedule Trigger',
            cronExpression: scheduleString
          })
        }
      }

      // Check for Cron nodes
      if (node.type === 'n8n-nodes-base.cron') {
        const params = node.parameters || {}
        const cronExpression = params.cronExpression as string

        // console.log(`🔍 Inspecting Cron node: ${node.name}`, cronExpression)

        if (cronExpression) {
          schedules.push({
            nodeName: node.name,
            nodeType: 'Cron',
            cronExpression
          })
        }
      }
    }

    if (schedules.length > 0) {
      console.log(`✅ Extracted ${schedules.length} schedules for workflow ${n8nWorkflow.name}`)
    }

    return schedules
  }

  private async ensureDefaultProvider(db: Database): Promise<string> {
    return new Promise((resolve, reject) => {
      db.get('SELECT id FROM providers LIMIT 1', (err, row: any) => {
        if (err) {
          reject(err)
          return
        }

        if (row) {
          resolve(row.id)
          return
        }

        // Create default provider
        const providerId = `provider_${Date.now()}`
        db.run(`
          INSERT INTO providers (id, name, base_url, api_key_encrypted, is_connected)
          VALUES (?, ?, ?, ?, ?)
        `, [
          providerId,
          'Default n8n Instance',
          'http://localhost:5678',
          'default',
          1
        ], (err) => {
          if (err) {
            reject(err)
          } else {
            console.log('✅ Created default provider for workflow sync')
            resolve(providerId)
          }
        })
      })
    })
  }
}

// Export singleton instance
export const workflowSync = new WorkflowSyncService()