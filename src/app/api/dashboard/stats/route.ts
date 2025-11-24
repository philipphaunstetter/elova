import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-auth'
import { DashboardStats, TimeRange, ExecutionFilters, Execution } from '@/types'
import { getDb } from '@/lib/db'
import { ExecutionStatus } from '@/types'

// Helper function to apply filters to executions (copied from executions API)
function applyExecutionFilters(executions: Execution[], filters: ExecutionFilters): Execution[] {
  let filtered = executions
  
  // Filter by status
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter(exec => filters.status!.includes(exec.status))
  }
  
  // Filter by time range
  if (filters.timeRange && filters.timeRange !== 'custom') {
    const now = new Date()
    let startDate: Date
    
    switch (filters.timeRange) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }
    
    filtered = filtered.filter(exec => new Date(exec.startedAt as any) >= startDate)
  }
  
  // Filter by custom time range
  if (filters.timeRange === 'custom' && filters.customTimeRange) {
    const { start, end } = filters.customTimeRange
    filtered = filtered.filter(exec => {
      const execDate = new Date(exec.startedAt as any)
      return execDate >= start && execDate <= end
    })
  }
  
  return filtered
}


/**
 * Fetch dashboard statistics from database
 */
async function fetchDashboardStatsFromDb(userId: string, timeRange: TimeRange): Promise<DashboardStats> {
  try {
    const db = getDb()
    
    // Fetch executions from database
    const allExecutions = await new Promise<Execution[]>((resolve, reject) => {
      db.all(
        `SELECT e.*, w.name as workflow_name
         FROM executions e
         LEFT JOIN workflows w ON e.workflow_id = w.id
         LEFT JOIN providers p ON e.provider_id = p.id
         WHERE p.user_id = ?
         ORDER BY e.started_at DESC`,
        [userId],
        (err, rows: any[]) => {
          if (err) {
            reject(err)
            return
          }
          
          const executions: Execution[] = rows.map(row => ({
            id: row.id,
            providerId: row.provider_id,
            workflowId: row.workflow_id,
            providerExecutionId: row.provider_execution_id,
            providerWorkflowId: row.provider_workflow_id,
            status: row.status as ExecutionStatus,
            mode: row.mode,
            startedAt: row.started_at, // Keep as ISO string from database
            stoppedAt: row.stopped_at || undefined, // Keep as ISO string from database
            duration: row.duration,
            // AI Metrics
            totalTokens: row.total_tokens || 0,
            inputTokens: row.input_tokens || 0,
            outputTokens: row.output_tokens || 0,
            aiCost: row.ai_cost || 0,
            aiProvider: row.ai_provider,
            aiModel: row.ai_model,
            metadata: {
              workflowName: row.workflow_name || 'Unknown',
              finished: Boolean(row.finished)
            }
          }) as any)
          
          resolve(executions)
        }
      )
    })
    
    // Create filters object using same structure as executions API
    const filters: ExecutionFilters = {
      timeRange: timeRange === 'custom' ? '24h' : timeRange // Handle 'custom' case
    }
    
    // Apply filters using the same function as executions API
    const filteredExecutions = applyExecutionFilters(allExecutions, filters)
    
    // Calculate basic stats
    const totalExecutions = filteredExecutions.length
    const successfulExecutions = filteredExecutions.filter(e => e.status === 'success').length
    const failedExecutions = filteredExecutions.filter(e => e.status === 'error').length
    const successRate = totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0

    // Calculate AI stats
    const totalCost = filteredExecutions.reduce((sum, e) => sum + (e.aiCost || 0), 0)
    const totalTokens = filteredExecutions.reduce((sum, e) => sum + (e.totalTokens || 0), 0)

    // Calculate average response time (duration)
    const completedExecutions = filteredExecutions.filter(e => e.duration !== undefined)
    let avgResponseTime: number | undefined
    
    if (completedExecutions.length > 0) {
      const totalDuration = completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0)
      avgResponseTime = Math.round(totalDuration / completedExecutions.length)
    }

    // Get recent failures
    const recentFailures = filteredExecutions
      .filter(e => e.status === 'error')
      .sort((a, b) => new Date(b.startedAt as any).getTime() - new Date(a.startedAt as any).getTime())
      .slice(0, 5)
      .map(execution => ({
        executionId: execution.id,
        workflowName: (execution.metadata?.workflowName as string) || 'Unknown Workflow',
        error: execution.error?.message || 'Execution failed',
        timestamp: execution.startedAt
      }))

    // Get recent activity (latest 5 executions)
    const recentActivity = filteredExecutions
      .slice(0, 5)
      .map(execution => ({
        executionId: execution.id,
        workflowName: (execution.metadata?.workflowName as string) || 'Unknown Workflow',
        status: execution.status,
        timestamp: execution.startedAt,
        workflowId: execution.workflowId
      }))

    // Calculate top workflows by execution count
    const workflowStats = new Map<string, {
      workflowId: string
      name: string
      executions: number
      successes: number
    }>()

    for (const execution of filteredExecutions) {
      const workflowId = execution.workflowId
      if (!workflowStats.has(workflowId)) {
        workflowStats.set(workflowId, {
          workflowId,
          name: (execution.metadata?.workflowName as string) || 'Unknown Workflow',
          executions: 0,
          successes: 0
        })
      }
      
      const stats = workflowStats.get(workflowId)!
      stats.executions++
      if (execution.status === 'success') {
        stats.successes++
      }
    }

    const topWorkflows = Array.from(workflowStats.values())
      .map(w => ({
        ...w,
        successRate: w.executions > 0 ? Math.round((w.successes / w.executions) * 100) : 0
      }))
      .sort((a, b) => b.executions - a.executions)
      .slice(0, 5)

    return {
      timeRange,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      successRate,
      avgResponseTime,
      totalCost,
      totalTokens,
      topWorkflows,
      recentFailures,
      recentActivity
    }
  } catch (error) {
    console.error('Error fetching n8n dashboard stats:', error)
    throw error
  }
}

// GET /api/dashboard/stats - Get dashboard statistics
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const timeRange = (searchParams.get('timeRange') as TimeRange) || '24h'
    const providerId = searchParams.get('providerId') || undefined

    // Require authentication for all requests
    const { user, error: authError } = await authenticateRequest(request)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch data from database
    try {
      const stats = await fetchDashboardStatsFromDb(user.id, timeRange)
      
      return NextResponse.json({
        success: true,
        data: stats
      })
    } catch (error) {
      console.error('Failed to fetch dashboard stats from database:', error)
      
      // Fallback to empty stats
      const emptyStats: DashboardStats = {
        providerId,
        timeRange,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        successRate: 0,
        totalCost: 0,
        totalTokens: 0,
        topWorkflows: [],
        recentFailures: [],
        recentActivity: []
      }
      
      return NextResponse.json({
        success: true,
        data: emptyStats
      })
    }
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
