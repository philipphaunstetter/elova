import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-auth'
import { getDb } from '@/lib/db'
import { ExecutionStatus } from '@/types'

// GET /api/executions/[id] - Get a single execution with full details
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate the request
    const { user, error: authError } = await authenticateRequest(request)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const executionId = params.id

    const db = getDb()
    
    // Fetch execution with related data
    const sql = `
      SELECT 
        e.id,
        e.provider_id,
        e.workflow_id,
        e.provider_execution_id,
        e.provider_workflow_id,
        e.status,
        e.mode,
        e.started_at,
        e.stopped_at,
        e.duration,
        e.finished,
        e.retry_of,
        e.retry_success_id,
        e.metadata,
        e.execution_data,
        e.total_tokens,
        e.input_tokens,
        e.output_tokens,
        e.ai_cost,
        e.ai_provider,
        e.ai_metrics_json,
        w.name as workflow_name,
        w.workflow_json,
        p.name as provider_name,
        p.base_url as provider_base_url
      FROM executions e
      LEFT JOIN workflows w ON e.workflow_id = w.id
      LEFT JOIN providers p ON e.provider_id = p.id
      WHERE e.id = ?
    `
    
    const row = await new Promise<any>((resolve, reject) => {
      db.get(sql, [executionId], (err, row) => {
        if (err) {
          console.error('Database query error:', err)
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
    
    if (!row) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }
    
    // Parse JSON fields
    let metadata: any = {}
    let executionData: any = null
    let workflowJson: any = null
    let aiMetrics: any = null
    
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : {}
    } catch {
      metadata = {}
    }
    
    try {
      executionData = row.execution_data ? JSON.parse(row.execution_data) : null
    } catch {
      executionData = null
    }
    
    try {
      workflowJson = row.workflow_json ? JSON.parse(row.workflow_json) : null
    } catch {
      workflowJson = null
    }

    try {
      aiMetrics = row.ai_metrics_json ? JSON.parse(row.ai_metrics_json) : null
    } catch {
      aiMetrics = null
    }
    
    // Build response
    const execution = {
      id: row.id,
      providerId: row.provider_id,
      workflowId: row.workflow_id,
      providerExecutionId: row.provider_execution_id,
      providerWorkflowId: row.provider_workflow_id,
      status: row.status as ExecutionStatus,
      mode: row.mode,
      startedAt: new Date(row.started_at),
      stoppedAt: row.stopped_at ? new Date(row.stopped_at) : undefined,
      duration: row.duration,
      finished: Boolean(row.finished),
      retryOf: row.retry_of,
      retrySuccessId: row.retry_success_id,
      
      // AI Metrics
      totalTokens: row.total_tokens || 0,
      inputTokens: row.input_tokens || 0,
      outputTokens: row.output_tokens || 0,
      aiCost: row.ai_cost || 0,
      aiProvider: row.ai_provider || null,
      aiMetrics,
      
      // Metadata
      metadata: {
        workflowName: row.workflow_name || 'Unknown Workflow',
        providerName: row.provider_name || 'Unknown Provider',
        ...metadata
      },
      
      // Detailed execution data
      executionData,
      
      // Workflow data
      workflow: {
        name: row.workflow_name,
        providerWorkflowId: row.provider_workflow_id,
        workflowJson
      },
      
      // Provider data
      provider: {
        name: row.provider_name,
        baseUrl: row.provider_base_url
      }
    }
    
    return NextResponse.json({
      success: true,
      data: execution
    })
  } catch (error) {
    console.error('Failed to fetch execution:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
