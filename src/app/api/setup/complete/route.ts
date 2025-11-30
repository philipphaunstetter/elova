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
          name: 'Primary n8n',
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
                  db.run('UPDATE workflows SET is_tracked = 0 WHERE provider_id = ?', [provider.id], (err) => {
                    if (err) reject(err)
                    else resolve()
                  })
                })

                // Then set tracked ones if any are selected
                if (trackedWorkflowIds.length > 0) {
                  const placeholders = trackedWorkflowIds.map(() => '?').join(',')
                  await new Promise<void>((resolve, reject) => {
                    db.run(
                      `UPDATE workflows SET is_tracked = 1 WHERE provider_id = ? AND provider_workflow_id IN (${placeholders})`,
                      [provider.id, ...trackedWorkflowIds],
                      (err) => {
                        if (err) reject(err)
                        else resolve()
                      }
                    )
                  })
                }
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
