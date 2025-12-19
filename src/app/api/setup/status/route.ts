import { NextResponse } from 'next/server'
import { getConfigManager } from '@/lib/config/config-manager'


export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const config = getConfigManager()
    await config.initialize()

    // Check the explicit completion flag first (fastest)
    const initDoneFlag = await config.get<string | boolean>('app.initDone')
    
    // Check initial sync status
    const initialSyncStatus = await config.get<string>('sync.initial.status')
    const initialSyncError = await config.get<string>('sync.initial.error')
    const initialSyncProgress = await config.get<number>('sync.initial.progress') || 0
    const initialSyncStep = await config.get<string>('sync.initial.step') || 'Initializing'

    if (initDoneFlag === 'true' || initDoneFlag === true) {
      return NextResponse.json({
        initDone: true,
        requiresSetup: false,
        nextStep: 'signin',
        message: 'Setup completed (flag set)',
        initialSync: {
          status: initialSyncStatus || 'unknown',
          error: initialSyncError,
          progress: initialSyncProgress,
          step: initialSyncStep
        }
      })
    }

    // Fallback: Check if admin account actually exists
    const values = await config.getMany([
      'setup.admin_email',
      'setup.admin_password_hash',
      'setup.admin_user_id'
    ])

    const adminEmail = values['setup.admin_email']
    const hasAdminData = Boolean(adminEmail && values['setup.admin_password_hash'] && values['setup.admin_user_id'])

    if (hasAdminData) {
      console.log(`Setup status: Admin account found (${adminEmail})`)
      // Fix missing flag if data exists
      await config.upsert('app.initDone', 'true', 'boolean', 'system', 'Setup completion flag')

      return NextResponse.json({
        initDone: true,
        requiresSetup: false,
        nextStep: 'signin',
        message: `Setup completed - admin account: ${adminEmail}`
      })
    } else {
      console.log('Setup status: No admin account found - setup required')
      // Setup is required - redirect to setup wizard
      return NextResponse.json({
        initDone: false,
        requiresSetup: true,
        nextStep: 'setup',
        message: 'Initial setup required - no admin account found'
      })
    }
  } catch (error) {
    console.error('Failed to check setup status:', error)

    // On error, assume setup is required
    return NextResponse.json({
      initDone: false,
      requiresSetup: true,
      nextStep: 'setup',
      error: 'Failed to check setup status - assuming setup required'
    })
  }
}
