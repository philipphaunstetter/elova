import { NextRequest, NextResponse } from 'next/server'
import { executionSync } from '@/lib/sync/execution-sync'
import { getConfigManager } from '@/lib/config/config-manager'
import { getDb } from '@/lib/db'

export async function POST(request: NextRequest) {
  const config = getConfigManager()
  await config.initialize()

  try {
    console.log('Starting initial sync after setup...')

    // Mark sync as in progress
    await config.upsert('sync.initial.status', 'in_progress', 'string', 'system', 'Initial sync status')
    await config.upsert('sync.initial.started_at', new Date().toISOString(), 'string', 'system', 'Initial sync start time')
    await config.upsert('sync.initial.error', '', 'string', 'system', 'Initial sync error message')

    // STEP 1: Sync workflows first (creates all workflows in database)
    console.log('Step 1: Syncing workflows...')
    await config.upsert('sync.initial.progress', 10, 'number', 'system', 'Initial sync progress')
    await config.upsert('sync.initial.step', 'Syncing workflows', 'string', 'system', 'Initial sync current step')
    await executionSync.syncAllProviders({ syncType: 'workflows' })
    await config.upsert('sync.initial.progress', 25, 'number', 'system', 'Initial sync progress')
    
    // STEP 2: Apply tracking flags (now that workflows exist in database)
    console.log('Step 2: Applying tracking flags...')
    await config.upsert('sync.initial.progress', 30, 'number', 'system', 'Initial sync progress')
    await config.upsert('sync.initial.step', 'Applying tracking preferences', 'string', 'system', 'Initial sync current step')
    const trackedWorkflowIdsJson = await config.get<string>('setup.tracked_workflow_ids')
    if (trackedWorkflowIdsJson) {
      try {
        const trackedWorkflowIds = JSON.parse(trackedWorkflowIdsJson) as string[]
        console.log(`🔍 Applying tracking flags for ${trackedWorkflowIds.length} workflows after initial sync`)
        
        const db = getDb()
        
        // Get all providers (should be just one during setup, but handle multiple)
        const providers = await new Promise<Array<{id: string, name: string}>>((resolve, reject) => {
          db.all(
            'SELECT id, name FROM providers WHERE is_connected = 1',
            (err, rows: Array<{id: string, name: string}>) => {
              if (err) reject(err)
              else resolve(rows || [])
            }
          )
        })
        
        for (const provider of providers) {
          // First set all to untracked for this provider
          await new Promise<void>((resolve, reject) => {
            db.run('UPDATE workflows SET is_tracked = 0 WHERE provider_id = ?', [provider.id], function(err) {
              if (err) reject(err)
              else {
                console.log(`✅ Set ${this.changes} workflows to is_tracked=0 for provider ${provider.name}`)
                resolve()
              }
            })
          })
          
          // Then set tracked ones
          if (trackedWorkflowIds.length > 0) {
            let updatedCount = 0
            for (const workflowId of trackedWorkflowIds) {
              await new Promise<void>((resolve) => {
                db.run(
                  'UPDATE workflows SET is_tracked = 1 WHERE provider_id = ? AND provider_workflow_id = ?',
                  [provider.id, String(workflowId)],
                  function(err) {
                    if (err) {
                      console.error(`❌ Failed to mark workflow ${workflowId} as tracked:`, err)
                    } else if (this.changes > 0) {
                      updatedCount++
                    }
                    resolve()
                  }
                )
              })
            }
            console.log(`✅ Marked ${updatedCount}/${trackedWorkflowIds.length} workflows as tracked for ${provider.name}`)
          }
          
          // Verify
          const verifyTracking = await new Promise<{tracked: number, untracked: number}>((resolve, reject) => {
            db.all(
              'SELECT is_tracked, COUNT(*) as count FROM workflows WHERE provider_id = ? GROUP BY is_tracked',
              [provider.id],
              (err, rows: Array<{is_tracked: number, count: number}>) => {
                if (err) reject(err)
                else {
                  const result = { tracked: 0, untracked: 0 }
                  rows?.forEach(row => {
                    if (row.is_tracked === 1) result.tracked = row.count
                    else result.untracked = row.count
                  })
                  resolve(result)
                }
              }
            )
          })
          console.log(`✅ Tracking status verified for ${provider.name}: ${verifyTracking.tracked} tracked, ${verifyTracking.untracked} untracked`)
        }
      } catch (err) {
        console.error('❌ Failed to apply tracking flags:', err)
      }
    } else {
      console.log('⚠️ No tracked workflow IDs found in config, skipping tracking flag setup')
    }
    
    // STEP 3: Sync executions and backups (now that tracking flags are set)
    console.log('Step 3: Syncing executions and backups...')
    await config.upsert('sync.initial.progress', 40, 'number', 'system', 'Initial sync progress')
    await config.upsert('sync.initial.step', 'Syncing executions', 'string', 'system', 'Initial sync current step')
    const syncResult = await executionSync.syncAllProviders({ syncType: 'executions' })
    await config.upsert('sync.initial.progress', 80, 'number', 'system', 'Initial sync progress')
    
    // Also trigger backup sync
    console.log('Step 4: Creating workflow backups...')
    await config.upsert('sync.initial.progress', 85, 'number', 'system', 'Initial sync progress')
    await config.upsert('sync.initial.step', 'Creating backups', 'string', 'system', 'Initial sync current step')
    await executionSync.syncAllProviders({ syncType: 'backups' })
    await config.upsert('sync.initial.progress', 95, 'number', 'system', 'Initial sync progress')
    
    console.log('Initial sync completed:', syncResult)

    // Mark sync as completed
    await config.upsert('sync.initial.progress', 100, 'number', 'system', 'Initial sync progress')
    await config.upsert('sync.initial.step', 'Completed', 'string', 'system', 'Initial sync current step')
    await config.upsert('sync.initial.status', 'completed', 'string', 'system', 'Initial sync status')
    await config.upsert('sync.initial.completed_at', new Date().toISOString(), 'string', 'system', 'Initial sync completion time')

    return NextResponse.json({
      success: true,
      message: 'Initial sync completed successfully',
      results: syncResult
    })

  } catch (error) {
    console.error('Initial sync failed:', error)

    // Mark sync as failed
    await config.upsert('sync.initial.status', 'failed', 'string', 'system', 'Initial sync status')
    await config.upsert('sync.initial.error', error instanceof Error ? error.message : 'Unknown error', 'string', 'system', 'Initial sync error message')

    return NextResponse.json({
      success: false,
      message: 'Initial sync failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}