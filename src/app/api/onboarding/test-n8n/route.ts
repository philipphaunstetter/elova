import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, apiKey } = body

    if (!url || !apiKey) {
      return NextResponse.json(
        { error: 'URL and API key are required' },
        { status: 400 }
      )
    }

    // Clean up URL (remove trailing slash)
    const cleanUrl = url.replace(/\/$/, '')
    
    // Clean up API key (handle potential copy-paste errors like leading 'x')
    let effectiveApiKey = apiKey.trim()
    if (effectiveApiKey.startsWith('xeyJ')) {
      effectiveApiKey = effectiveApiKey.substring(1)
    }

    // Helper to perform request with specific headers
    const tryRequest = async (headers: Record<string, string>) => {
        return fetch(`${cleanUrl}/api/v1/workflows`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...headers
            },
            signal: AbortSignal.timeout(10000)
        })
    }

    // Strategy 1: Try standard X-N8N-API-KEY (works for standard keys and some JWT configurations)
    let testResponse = await tryRequest({ 'X-N8N-API-KEY': effectiveApiKey })

    // Strategy 2: If 401 and looks like JWT, try Bearer Token
    if (testResponse.status === 401 && effectiveApiKey.startsWith('ey') && effectiveApiKey.includes('.')) {
        console.log('Retrying with Bearer Auth...')
        testResponse = await tryRequest({ 'Authorization': `Bearer ${effectiveApiKey}` })
    }

    // Strategy 3: Fallback to Internal API (/rest/login) if Public API fails
    // This is useful if the user provided credentials that only work for the Internal API
    // or if the Public API is disabled/unreachable
    if (!testResponse.ok) {
        try {
            console.log('Public API failed, trying Internal API (/rest/login)...')
            let internalHeaders: Record<string, string> = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            };

            if (effectiveApiKey.startsWith('ey') && effectiveApiKey.includes('.')) {
                internalHeaders['Authorization'] = `Bearer ${effectiveApiKey}`;
            } else {
                internalHeaders['X-N8N-API-KEY'] = effectiveApiKey;
            }
            
            const internalResponse = await fetch(`${cleanUrl}/rest/login`, {
                method: 'GET',
                headers: internalHeaders,
                signal: AbortSignal.timeout(5000)
            })

            if (internalResponse.ok) {
                const loginData = await internalResponse.json()
                // Fetch workflow count from internal API
                let workflowCount = 0
                try {
                    const wfResponse = await fetch(`${cleanUrl}/rest/workflows`, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            ...internalHeaders,
                        },
                        signal: AbortSignal.timeout(5000)
                    })
                    if (wfResponse.ok) {
                        const wfData = await wfResponse.json()
                        workflowCount = wfData.data?.length || wfData.length || 0
                    }
                } catch (e) { /* ignore workflow count error */ }

                return NextResponse.json({
                    success: true,
                    message: 'Successfully connected to n8n (Internal API)',
                    workflowCount,
                    version: loginData.data?.version || 'Unknown',
                    instanceId: loginData.data?.instanceId || 'Unknown',
                    url: cleanUrl,
                    authMode: effectiveApiKey.startsWith('ey') ? 'bearer' : 'apikey'
                })
            }
        } catch (error) {
            console.error('Internal API fallback failed:', error)
        }
    }

    if (!testResponse.ok) {
      let errorMessage = 'Failed to connect to n8n instance'
      
      switch (testResponse.status) {
        case 401:
          errorMessage = 'Invalid API key - please check your n8n API key'
          break
        case 404:
          errorMessage = 'n8n API endpoint not found - please check your URL'
          break
        case 403:
          errorMessage = 'API access forbidden - please check your API key permissions'
          break
        case 500:
          errorMessage = 'n8n server error - please check your n8n instance'
          break
        default:
          errorMessage = `Connection failed with status ${testResponse.status}`
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const workflows = await testResponse.json()
    
    // Also try to get instance info
    let instanceInfo: { version?: string; id?: string } = {}
    try {
      const getInfoHeaders = () => {
        if (effectiveApiKey.startsWith('ey') && effectiveApiKey.includes('.')) {
           // If we are here, we don't know for sure which method succeeded unless we tracked it
           // But since we want to be robust, let's try the one that matches the format 
           // or we could use the same retry logic.
           // For simplicity in this non-critical call, let's guess based on the successful strategy above.
           // Actually, simpler: just try one, if fail try other? 
           // Or just use X-N8N-API-KEY as default fallback.
           return { 'X-N8N-API-KEY': effectiveApiKey }
        }
        return { 'X-N8N-API-KEY': effectiveApiKey }
      }
      
      // We should really use the same auth method that worked for workflows.
      // But we didn't store which one worked. 
      // Let's assume X-N8N-API-KEY for info, and if it fails, oh well (it's optional).
      // OR better: try Bearer if it looks like JWT, since that's the likely case for JWTs.
      
      let infoHeaders: Record<string, string> = { 'Accept': 'application/json' }
      if (effectiveApiKey.startsWith('ey') && effectiveApiKey.includes('.')) {
          // Try Bearer first for JWTs? Or stick to previous logic?
          // Let's stick to X-N8N-API-KEY first to match Strategy 1.
          infoHeaders['X-N8N-API-KEY'] = effectiveApiKey
      } else {
          infoHeaders['X-N8N-API-KEY'] = effectiveApiKey
      }

      let infoResponse = await fetch(`${cleanUrl}/api/v1/owner`, {
        method: 'GET',
        headers: infoHeaders,
        signal: AbortSignal.timeout(5000)
      })
      
      // Retry info with Bearer if 401 and JWT
      if (!infoResponse.ok && infoResponse.status === 401 && effectiveApiKey.startsWith('ey')) {
          infoResponse = await fetch(`${cleanUrl}/api/v1/owner`, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${effectiveApiKey}` },
            signal: AbortSignal.timeout(5000)
          })
      }
      
      if (infoResponse.ok) {
        instanceInfo = await infoResponse.json()
      }
    } catch (error) {
      // Info endpoint might not be available, that's okay
      console.warn('Could not fetch n8n instance info:', error)
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully connected to n8n instance',
      workflowCount: workflows.data?.length || workflows.length || 0,
      version: instanceInfo.version || 'Unknown',
      instanceId: instanceInfo.id || 'Unknown',
      url: cleanUrl
    })

  } catch (error) {
    console.error('n8n connection test failed:', error)
    
    let errorMessage = 'Network error: Unable to connect to n8n instance'
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Connection timeout - please check your n8n URL and network'
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot reach n8n instance - please check your URL'
      } else {
        errorMessage = `Connection error: ${error.message}`
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}