import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-auth'
import { getProviderService } from '@/lib/services/provider-service'

// GET /api/providers - List all providers
export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await authenticateRequest(request)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providerService = getProviderService()
    const providers = await providerService.listProviders(user.id)

    return NextResponse.json({
      success: true,
      data: providers
    })
  } catch (error) {
    console.error('Failed to list providers:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to list providers' 
      },
      { status: 500 }
    )
  }
}

// POST /api/providers - Create a new provider
export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await authenticateRequest(request)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    let { name, baseUrl, apiKey, metadata } = body

    // Clean up API key if needed
    if (apiKey && typeof apiKey === 'string') {
      apiKey = apiKey.trim()
      if (apiKey.startsWith('xeyJ')) {
        apiKey = apiKey.substring(1)
      }
    }

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Provider name is required' 
        },
        { status: 400 }
      )
    }

    if (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.startsWith('http')) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Valid base URL is required (must start with http:// or https://)' 
        },
        { status: 400 }
      )
    }

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'API key is required' 
        },
        { status: 400 }
      )
    }

    const providerService = getProviderService()

    // Test connection before creating
    const connectionTest = await providerService.testConnection(baseUrl, apiKey)
    if (!connectionTest.success) {
      return NextResponse.json(
        { 
          success: false,
          error: `Connection test failed: ${connectionTest.error}` 
        },
        { status: 400 }
      )
    }

    // Create provider
    const provider = await providerService.createProvider(user.id, {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      metadata: metadata || {}
    })

    // Update connection status
    await providerService.updateConnectionStatus(
      provider.id,
      user.id,
      true,
      'healthy',
      connectionTest.version
    )

    // Fetch updated provider to return
    const updatedProvider = await providerService.getProvider(provider.id, user.id)

    return NextResponse.json({
      success: true,
      data: updatedProvider,
      message: 'Provider created successfully'
    })
  } catch (error) {
    console.error('Failed to create provider:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create provider' 
      },
      { status: 500 }
    )
  }
}
