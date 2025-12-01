/**
 * Sync Scheduler
 * 
 * This handles automatic background syncing of n8n data from all client instances.
 * Different sync types run at different intervals based on data importance and change frequency.
 */

import { executionSync } from './execution-sync'
import { syncAIModels } from '@/lib/services/ai-pricing-sync'

export class SyncScheduler {
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private runningJobs: Set<string> = new Set()

  /**
   * Start all scheduled sync jobs
   */
  start() {
    console.log('🕐 Starting sync scheduler...')

    // Critical: Execution sync every 30 seconds for near real-time monitoring
    this.scheduleJob('executions', this.syncExecutions.bind(this), 30 * 1000)

    // Moderate: Workflow metadata sync every 6 hours  
    this.scheduleJob('workflows', this.syncWorkflows.bind(this), 6 * 60 * 60 * 1000)

    // Low priority: Full workflow backups daily
    this.scheduleJob('backups', this.syncBackups.bind(this), 24 * 60 * 60 * 1000)

    // Maintenance: AI Pricing sync weekly
    this.scheduleJob('pricing', this.syncPricing.bind(this), 7 * 24 * 60 * 60 * 1000)

    console.log('✅ All sync jobs scheduled')
  }

  /**
   * Stop all scheduled sync jobs
   */
  stop() {
    console.log('🛑 Stopping sync scheduler...')

    for (const [name, interval] of this.intervals) {
      clearInterval(interval)
      console.log(`✅ Stopped ${name} sync job`)
    }

    this.intervals.clear()
    this.runningJobs.clear()
    console.log('✅ All sync jobs stopped')
  }

  /**
   * Schedule a sync job
   */
  private scheduleJob(name: string, syncFunction: () => Promise<void>, intervalMs: number) {
    // Run immediately on startup
    console.log(`🚀 Starting initial ${name} sync...`)
    this.runJob(name, syncFunction)

    // Then schedule regular intervals
    const interval = setInterval(() => {
      this.runJob(name, syncFunction)
    }, intervalMs)

    this.intervals.set(name, interval)

    const nextRun = new Date(Date.now() + intervalMs)
    console.log(`📅 ${name} sync scheduled every ${intervalMs / 1000}s, next run: ${nextRun.toISOString()}`)
  }

  /**
   * Run a sync job with overlap protection
   */
  private async runJob(name: string, syncFunction: () => Promise<void>) {
    if (this.runningJobs.has(name)) {
      console.log(`⚠️ Skipping ${name} sync - previous run still in progress`)
      return
    }

    this.runningJobs.add(name)

    try {
      console.log(`⏰ Scheduled ${name} sync starting...`)
      await syncFunction()
      console.log(`✅ Scheduled ${name} sync completed`)
    } catch (error) {
      console.error(`❌ Scheduled ${name} sync failed:`, error)
    } finally {
      this.runningJobs.delete(name)
    }
  }

  /**
   * Sync executions from all providers
   */
  private async syncExecutions(): Promise<void> {
    await executionSync.syncAllProviders({
      syncType: 'executions',
      batchSize: 100
    })
  }

  /**
   * Sync workflow metadata from all providers
   */
  private async syncWorkflows(): Promise<void> {
    await executionSync.syncAllProviders({
      syncType: 'workflows',
      batchSize: 50
    })
  }

  /**
   * Sync full workflow backups from all providers
   */
  private async syncBackups(): Promise<void> {
    await executionSync.syncAllProviders({
      syncType: 'backups',
      batchSize: 20
    })
  }

  /**
   * Sync AI Pricing models from OpenRouter
   */
  private async syncPricing(): Promise<void> {
    await syncAIModels()
  }

  /**
   * Trigger immediate sync of specific type
   */
  async triggerSync(syncType: 'executions' | 'workflows' | 'backups' | 'full') {
    console.log(`🎯 Triggering immediate ${syncType} sync...`)

    try {
      const result = await executionSync.syncAllProviders({
        syncType,
        batchSize: syncType === 'executions' ? 200 : 100 // Larger batches for manual triggers
      })

      console.log(`✅ Manual ${syncType} sync completed:`, result)
      return result
    } catch (error) {
      console.error(`❌ Manual ${syncType} sync failed:`, error)
      throw error
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    const jobs = Array.from(this.intervals.keys())
    return {
      running: jobs.length > 0,
      activeJobs: jobs,
      nextRuns: {
        executions: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        workflows: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        backups: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    }
  }
}

// Export singleton instance
export const syncScheduler = new SyncScheduler()
