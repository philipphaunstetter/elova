import { NextRequest, NextResponse } from 'next/server'
import { getProviderService } from '@/lib/services/provider-service'

// POST /api/setup/test-connection - Test n8n connection during onboarding
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, apiKey } = body

    if (!url || !apiKey) {
      return NextResponse.json(
        { 
          success: false,
          error: 'URL and API key are required' 
        },
        { status: 400 }
      )
    }

    const providerService = getProviderService()
    const result = await providerService.testConnection(url, apiKey)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Connection successful',
        version: result.version
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Connection test failed'
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Failed to test connection:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test connection'
      },
      { status: 500 }
    )
  }
}
