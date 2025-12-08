import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-auth'
import { getDb } from '@/lib/db'
import { TimeRange } from '@/types'

/**
 * GET /api/executions/metrics
 * Returns aggregated AI metrics (tokens, costs) across executions
 * 
 * Query params:
 * - timeRange: '1h' | '24h' | '7d' | '30d' | '90d' (default: '24h')
 * - providerId: Filter by specific provider
 * - workflowId: Filter by specific workflow (provider_workflow_id)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate the request
    const { user, error: authError } = await authenticateRequest(request)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const timeRange = (searchParams.get('timeRange') || '24h') as TimeRange
    const providerId = searchParams.get('providerId') || undefined
    const workflowId = searchParams.get('workflowId') || undefined

    const db = getDb()

    // Calculate time range filter
    const now = new Date()
    let startDate: Date
    switch (timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(now)
        startDate.setUTCDate(startDate.getUTCDate() - 7)
        startDate.setUTCHours(0, 0, 0, 0)
        break
      case '30d':
        startDate = new Date(now)
        startDate.setUTCDate(startDate.getUTCDate() - 30)
        startDate.setUTCHours(0, 0, 0, 0)
        break
      case '90d':
        startDate = new Date(now)
        startDate.setUTCDate(startDate.getUTCDate() - 90)
        startDate.setUTCHours(0, 0, 0, 0)
        break
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }

    // Build SQL query for total metrics
    let sql = `
      SELECT 
        COUNT(*) as total_executions,
        SUM(total_tokens) as total_tokens,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(ai_cost) as total_ai_cost,
        COUNT(CASE WHEN total_tokens > 0 THEN 1 END) as executions_with_ai,
        AVG(CASE WHEN total_tokens > 0 THEN total_tokens END) as avg_tokens_per_execution
      FROM executions
      WHERE started_at >= ?
    `
    
    const params: any[] = [startDate.toISOString()]
    
    if (providerId) {
      sql += ' AND provider_id = ?'
      params.push(providerId)
    }
    
    if (workflowId) {
      sql += ' AND provider_workflow_id = ?'
      params.push(workflowId)
    }

    // Get total metrics
    const totalMetrics = await new Promise<any>((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err)
        else resolve(row || {})
      })
    })

    // Get breakdown by workflow
    let workflowSql = `
      SELECT 
        w.provider_workflow_id,
        w.name as workflow_name,
        COUNT(*) as execution_count,
        SUM(e.total_tokens) as total_tokens,
        SUM(e.ai_cost) as total_cost
      FROM executions e
      LEFT JOIN workflows w ON e.workflow_id = w.id
      WHERE e.started_at >= ? AND e.total_tokens > 0
    `
    
    const workflowParams: any[] = [startDate.toISOString()]
    
    if (providerId) {
      workflowSql += ' AND e.provider_id = ?'
      workflowParams.push(providerId)
    }
    
    if (workflowId) {
      workflowSql += ' AND e.provider_workflow_id = ?'
      workflowParams.push(workflowId)
    }
    
    workflowSql += ' GROUP BY w.provider_workflow_id, w.name ORDER BY total_tokens DESC LIMIT 10'

    const byWorkflow = await new Promise<any[]>((resolve, reject) => {
      db.all(workflowSql, workflowParams, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    // Get breakdown by AI provider
    let providerSql = `
      SELECT 
        ai_provider,
        COUNT(*) as execution_count,
        SUM(total_tokens) as total_tokens,
        SUM(ai_cost) as total_cost
      FROM executions
      WHERE started_at >= ? AND ai_provider IS NOT NULL
    `
    
    const providerParams: any[] = [startDate.toISOString()]
    
    if (providerId) {
      providerSql += ' AND provider_id = ?'
      providerParams.push(providerId)
    }
    
    if (workflowId) {
      providerSql += ' AND provider_workflow_id = ?'
      providerParams.push(workflowId)
    }
    
    providerSql += ' GROUP BY ai_provider ORDER BY total_tokens DESC'

    const byProvider = await new Promise<any[]>((resolve, reject) => {
      db.all(providerSql, providerParams, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    // Return aggregated metrics
    return NextResponse.json({
      success: true,
      data: {
        timeRange,
        totalExecutions: totalMetrics.total_executions || 0,
        executionsWithAI: totalMetrics.executions_with_ai || 0,
        totalTokens: totalMetrics.total_tokens || 0,
        totalInputTokens: totalMetrics.total_input_tokens || 0,
        totalOutputTokens: totalMetrics.total_output_tokens || 0,
        totalAICost: totalMetrics.total_ai_cost || 0,
        avgTokensPerExecution: Math.round(totalMetrics.avg_tokens_per_execution || 0),
        byWorkflow: byWorkflow.map(row => ({
          workflowId: row.provider_workflow_id,
          workflowName: row.workflow_name || 'Unknown',
          executionCount: row.execution_count,
          totalTokens: row.total_tokens || 0,
          totalCost: row.total_cost || 0
        })),
        byProvider: byProvider.map(row => ({
          provider: row.ai_provider,
          executionCount: row.execution_count,
          totalTokens: row.total_tokens || 0,
          totalCost: row.total_cost || 0
        }))
      }
    })

  } catch (error) {
    console.error('Failed to fetch AI metrics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
