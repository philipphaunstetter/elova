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

    // Clean up URL and API key
    const cleanUrl = url.replace(/\/$/, '')
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

    // Strategy 1: Try standard X-N8N-API-KEY
    let workflowsResponse = await tryRequest({ 'X-N8N-API-KEY': effectiveApiKey })

    // Strategy 2: If 401 and looks like JWT, try Bearer Token
    if (workflowsResponse.status === 401 && effectiveApiKey.startsWith('ey') && effectiveApiKey.includes('.')) {
      console.log('Retrying with Bearer Auth...')
      workflowsResponse = await tryRequest({ 'Authorization': `Bearer ${effectiveApiKey}` })
    }

    // Strategy 3: Try Internal API if Public API fails
    if (!workflowsResponse.ok) {
      try {
        console.log('Public API failed, trying Internal API (/rest/workflows)...')
        let internalHeaders: Record<string, string> = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }

        if (effectiveApiKey.startsWith('ey') && effectiveApiKey.includes('.')) {
          internalHeaders['Authorization'] = `Bearer ${effectiveApiKey}`
        } else {
          internalHeaders['X-N8N-API-KEY'] = effectiveApiKey
        }

        const internalResponse = await fetch(`${cleanUrl}/rest/workflows`, {
          method: 'GET',
          headers: internalHeaders,
          signal: AbortSignal.timeout(10000)
        })

        if (internalResponse.ok) {
          const internalData = await internalResponse.json()
          const workflows = (internalData.data || internalData || []).map((wf: any) => ({
            id: wf.id,
            name: wf.name,
            isActive: wf.active || false,
            tags: wf.tags?.map((t: any) => typeof t === 'string' ? t : t?.name).filter(Boolean) || []
          }))

          return NextResponse.json({
            success: true,
            data: workflows
          })
        }
      } catch (error) {
        console.error('Internal API fallback failed:', error)
      }
    }

    if (!workflowsResponse.ok) {
      let errorMessage = 'Failed to fetch workflows'
      
      switch (workflowsResponse.status) {
        case 401:
          errorMessage = 'Invalid API key'
          break
        case 404:
          errorMessage = 'Workflows endpoint not found'
          break
        case 403:
          errorMessage = 'Access forbidden'
          break
        default:
          errorMessage = `Request failed with status ${workflowsResponse.status}`
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    const workflowsData = await workflowsResponse.json()
    const workflows = (workflowsData.data || []).map((wf: any) => ({
      id: wf.id,
      name: wf.name,
      isActive: wf.active || false,
      tags: wf.tags?.map((t: any) => typeof t === 'string' ? t : t?.name).filter(Boolean) || []
    }))

    return NextResponse.json({
      success: true,
      data: workflows
    })

  } catch (error) {
    console.error('Failed to fetch workflows:', error)
    
    let errorMessage = 'Network error: Unable to fetch workflows'
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout'
      } else {
        errorMessage = `Error: ${error.message}`
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
