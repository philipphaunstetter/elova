import { NextRequest, NextResponse } from 'next/server'
import { getConfigManager } from '@/lib/config/config-manager'
import { getProviderService } from '@/lib/services/provider-service'
import { workflowSync } from '@/lib/sync/workflow-sync'
import { getDb } from '@/lib/db'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { adminData, n8nConfig, configuration, emailConfig, trackedWorkflowIds } = body

    const config = getConfigManager()
    console.log('Setup Complete API called with body:', JSON.stringify(body, null, 2))


    // Create admin account
    if (adminData) {
      await config.upsert('setup.admin_account_created', 'true', 'boolean', 'setup', 'Admin account created flag')
      await config.upsert('setup.admin_email', adminData.email || '', 'string', 'setup', 'Admin email address')
      await config.upsert('setup.admin_name', adminData.name || 'Admin', 'string', 'setup', 'Admin name')

      // Store admin password securely (hashed)
      if (adminData.password) {
        // For simplicity, we'll store a simple hash. In production, use proper password hashing
        const passwordHash = crypto.createHash('sha256').update(adminData.password).digest('hex')
        await config.upsert('setup.admin_password_hash', passwordHash, 'encrypted', 'auth', 'Admin password hash', true)
        await config.upsert('setup.admin_user_id', 'admin-001', 'string', 'auth', 'Admin user ID')
      }
    }





    // Configure n8n integration
    if (n8nConfig) {
      await config.upsert('integrations.n8n.url', n8nConfig.url || '', 'string', 'integration', 'n8n instance URL')
      await config.upsert('integrations.n8n.api_key', n8nConfig.apiKey || '', 'encrypted', 'integration', 'n8n API key', true)

      // Create provider entry for the new multi-provider system
      try {
        const providerService = getProviderService()
        // Use the same admin ID as stored in config
        const userId = 'admin-001'

        const provider = await providerService.createProvider(userId, {
          name: n8nConfig.name || 'Primary n8n',
          baseUrl: n8nConfig.url,
          apiKey: n8nConfig.apiKey,
          metadata: {
            createdVia: 'setup-wizard'
          }
        })
        console.log('Created default provider from setup wizard')

        // Test connection immediately and update status
        try {
          const connectionResult = await providerService.testConnection(n8nConfig.url, n8nConfig.apiKey)

          await providerService.updateConnectionStatus(
            provider.id,
            userId,
            connectionResult.success,
            connectionResult.success ? 'healthy' : 'error',
            connectionResult.version
          )

          if (connectionResult.success) {
            console.log('Provider connection tested and marked as healthy')

            // Sync workflows immediately so we can set tracking preferences
            try {
              console.log('Syncing workflows during setup...')
              await workflowSync.syncProvider({
                id: provider.id,
                name: provider.name,
                baseUrl: provider.baseUrl,
                apiKey: n8nConfig.apiKey // Use the raw key here as it's needed for the sync
              })

              // Update tracking status if provided
              if (Array.isArray(trackedWorkflowIds)) {
                const db = getDb()
                
                // First set all to untracked for this provider
                await new Promise<void>((resolve, reject) => {
                  db.run('UPDATE workflows SET is_tracked = 0 WHERE provider_id = ?', [provider.id], function(err) {
                    if (err) reject(err)
                    else {
                      console.log(`✅ Set ${this.changes} workflows to is_tracked=0 for provider ${provider.id}`)
                      resolve()
                    }
                  })
                })

                // Then set tracked ones if any are selected
                if (trackedWorkflowIds.length > 0) {
                  // Ensure all IDs are strings to match database column type
                  const stringIds = trackedWorkflowIds.map(String)
                  
                  console.log(`Setting is_tracked=1 for ${stringIds.length} workflows individually`)

                  // Update one by one to ensure reliability and avoid SQLite variable limits or type issues with IN clause
                  let updatedCount = 0
                  console.log(`🔍 Attempting to mark these workflow IDs as tracked: [${stringIds.join(', ')}]`)
                  
                  // First, let's see what workflow IDs actually exist in the database
                  const existingWorkflows = await new Promise<Array<{provider_workflow_id: string, name: string}>>((resolve, reject) => {
                    db.all(
                      'SELECT provider_workflow_id, name FROM workflows WHERE provider_id = ?',
                      [provider.id],
                      (err, rows: Array<{provider_workflow_id: string, name: string}>) => {
                        if (err) reject(err)
                        else resolve(rows || [])
                      }
                    )
                  })
                  console.log(`📊 Existing workflow IDs in database: [${existingWorkflows.map(w => `${w.provider_workflow_id} (${w.name})`).join(', ')}]`)
                  
                  for (const id of stringIds) {
                    await new Promise<void>((resolve, reject) => {
                      db.run(
                        'UPDATE workflows SET is_tracked = 1 WHERE provider_id = ? AND provider_workflow_id = ?',
                        [provider.id, id],
                        function(err) {
                          if (err) {
                            console.error(`❌ Failed to update tracking for workflow ${id}:`, err)
                            // Don't reject, just log and continue
                          } else {
                            if (this.changes > 0) {
                              updatedCount++
                              console.log(`✅ Successfully marked workflow ${id} as tracked (${this.changes} row updated)`)
                            } else {
                              console.warn(`⚠️ Workflow ${id} not found in database - no rows updated`)
                            }
                          }
                          resolve()
                        }
                      )
                    })
                  }
                  console.log(`Successfully updated is_tracked=1 for ${updatedCount} workflows`)
                } else {
                  console.log('No workflows selected for tracking - all workflows will be untracked')
                }
                
                // Verify tracking status was set correctly
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
                console.log(`✅ Tracking status verified: ${verifyTracking.tracked} tracked, ${verifyTracking.untracked} untracked`)
                console.log(`Updated tracking status for ${trackedWorkflowIds.length} workflows`)
              }
            } catch (syncError) {
              console.error('Failed to sync workflows during setup:', syncError)
              // Continue with setup even if sync fails
            }
          } else {
            console.warn('Provider connection test failed:', connectionResult.error)
          }
        } catch (testError) {
          console.error('Failed to test provider connection during setup:', testError)
          // Don't fail setup if connection test fails
        }
      } catch (error) {
        console.error('Failed to create default provider:', error)
        // Don't fail setup if provider creation fails, but log it
      }
    }

    // Set configuration values
    if (configuration) {
      await config.upsert('features.sync_interval_minutes', configuration.syncInterval || '15', 'number', 'features', 'Data sync interval')
      await config.upsert('features.analytics_enabled', configuration.analyticsEnabled ? 'true' : 'false', 'boolean', 'features', 'Enable analytics')
    }

    // Set email configuration (placeholder for future functionality)
    if (emailConfig) {
      await config.upsert('notifications.email.enabled', emailConfig.enabled ? 'true' : 'false', 'boolean', 'notifications', 'Email notifications enabled')
      await config.upsert('notifications.email.smtp_host', emailConfig.smtpHost || '', 'string', 'notifications', 'SMTP host')
      await config.upsert('notifications.email.smtp_port', emailConfig.smtpPort || '587', 'number', 'notifications', 'SMTP port')
      await config.upsert('notifications.email.smtp_user', emailConfig.smtpUser || '', 'string', 'notifications', 'SMTP username')
      await config.upsert('notifications.email.smtp_password', emailConfig.smtpPassword || '', 'encrypted', 'notifications', 'SMTP password', true)
    }

    // Set default configuration values
    await config.upsert('app.timezone', 'UTC', 'string', 'system', 'Application timezone')
    await config.upsert('app.demoMode', 'false', 'boolean', 'system', 'Demo mode flag')
    
    // Store tracked workflow IDs in config for initial sync to use
    // This ensures tracking preferences are set even if workflow sync fails during setup
    if (trackedWorkflowIds && Array.isArray(trackedWorkflowIds)) {
      await config.upsert('setup.tracked_workflow_ids', JSON.stringify(trackedWorkflowIds), 'string', 'setup', 'Workflow IDs selected for tracking')
      console.log(`💾 Stored ${trackedWorkflowIds.length} tracked workflow IDs in config for initial sync`)
    }

    // Mark setup as complete by setting the initDone flag
    await config.upsert('app.initDone', 'true', 'boolean', 'system', 'Initialization complete flag')
    await config.upsert('setup.completed_at', new Date().toISOString(), 'string', 'setup', 'Setup completion timestamp')

    // Set sync status to in_progress synchronously so the dashboard sees it immediately
    await config.upsert('sync.initial.status', 'in_progress', 'string', 'system', 'Initial sync status')
    await config.upsert('sync.initial.started_at', new Date().toISOString(), 'string', 'system', 'Initial sync start time')

    // Start initial sync in background (fire and forget)
    // This will now respect the is_tracked flag we just set
    fetch(new URL('/api/setup/initial-sync', request.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.warn('Background sync error:', err))

    return NextResponse.json({
      message: 'Setup completed successfully',
      redirectTo: '/dashboard'
    })
  } catch (error) {
    console.error('Failed to complete setup:', error)
    return NextResponse.json(
      { error: 'Failed to complete setup' },
      { status: 500 }
    )
  }
}
