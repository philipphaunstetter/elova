import { NextResponse } from 'next/server'
import { getConfigManager } from '@/lib/config/config-manager'

export async function POST() {
  try {
    const configManager = getConfigManager()
    await configManager.initialize()
    
    // Ensure the general category exists by checking if any config exists in the general category
    await configManager.get('app.timezone')
    // The category will be created automatically when we upsert items with category='general'
    
    // Check if n8n URL configuration exists, if not create it
    const n8nUrl = await configManager.get('integrations.n8n.url')
    if (n8nUrl === null) {
      await configManager.upsert(
        'integrations.n8n.url',
        '',
        'string',
        'integration',
        'n8n instance URL for workflow integration',
        false,
        false,
        '{"type": "string", "format": "url"}',
        { changedBy: 'system', changeReason: 'Auto-initialization of missing config values' }
      )
    }

    // Ensure timezone is set to UTC as default if not already configured
    const timezone = await configManager.get('app.timezone')
    if (timezone === null) {
      await configManager.upsert(
        'app.timezone',
        'UTC',
        'string',
        'general',
        'Default application timezone',
        false,
        false,
        '{"type": "string", "minLength": 1}',
        { changedBy: 'system', changeReason: 'Auto-initialization of missing config values' }
      )
    }

    return NextResponse.json({
      message: 'Configuration initialization completed successfully',
      initialized: {
        n8nUrl: n8nUrl === null,
        timezone: timezone === null
      }
    })
  } catch (error) {
    console.error('Failed to initialize configuration:', error)
    return NextResponse.json(
      { error: 'Failed to initialize configuration' },
      { status: 500 }
    )
  }
}