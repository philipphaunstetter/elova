import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/api-auth'
import { TimeRange, Execution } from '@/types'
import { getDb } from '@/lib/db'
import { ExecutionStatus } from '@/types'


// Apply time range filters (same as other APIs)
function applyTimeRangeFilter(executions: Execution[], timeRange: TimeRange): Execution[] {
  if (timeRange === 'custom') return executions
  
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
  
  return executions.filter(exec => new Date(exec.startedAt as any) >= startDate)
}

export interface ChartDataPoint {
  date: string
  timestamp: number
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  successRate: number
  avgResponseTime: number | null
  aiCost: number
  totalTokens: number
}

// Per-provider chart data for multi-instance support
export interface ProviderChartData {
  providerId: string
  providerName: string
  color: string
  data: ChartDataPoint[]
}

export interface ChartsResponse {
  combined: ChartDataPoint[]
  byProvider: ProviderChartData[]
  providers: Array<{ id: string; name: string; color: string }>
}

// Provider colors for chart lines
const PROVIDER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
]

interface ExecutionWithProvider extends Execution {
  providerName?: string
}

/**
 * Aggregate execution data into time series for charts
 * Returns both combined data and per-provider breakdown
 */
async function generateChartData(userId: string, timeRange: TimeRange): Promise<ChartsResponse> {
  try {
    const db = getDb()
    
    // Calculate time range filter for SQL query to avoid loading all data into memory
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
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      case 'custom':
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }
    
    const startDateISO = startDate.toISOString()
    
    // Fetch executions with provider info from database - WITH TIME FILTER
    const allExecutions = await new Promise<ExecutionWithProvider[]>((resolve, reject) => {
      db.all(
        `SELECT e.*, w.name as workflow_name, p.name as provider_name, p.id as p_id
         FROM executions e
         LEFT JOIN workflows w ON e.workflow_id = w.id
         LEFT JOIN providers p ON e.provider_id = p.id
         WHERE p.user_id = ?
         AND e.started_at >= ?
         ORDER BY e.started_at DESC`,
        [userId, startDateISO],
        (err, rows: any[]) => {
          if (err) {
            reject(err)
            return
          }
          
          const executions: ExecutionWithProvider[] = rows.map(row => ({
            id: row.id,
            providerId: row.provider_id,
            workflowId: row.workflow_id,
            providerExecutionId: row.provider_execution_id,
            providerWorkflowId: row.provider_workflow_id,
            status: row.status as ExecutionStatus,
            mode: row.mode,
            startedAt: row.started_at,
            stoppedAt: row.stopped_at || undefined,
            duration: row.duration,
            totalTokens: row.total_tokens || 0,
            inputTokens: row.input_tokens || 0,
            outputTokens: row.output_tokens || 0,
            aiCost: row.ai_cost || 0,
            aiProvider: row.ai_provider,
            aiModel: row.ai_model,
            providerName: row.provider_name || 'Unknown',
            metadata: {
              workflowName: row.workflow_name || 'Unknown',
              finished: Boolean(row.finished)
            }
          }) as any)
          
          resolve(executions)
        }
      )
    })
    
    // Time filtering is now done in SQL query, no need for in-memory filtering
    const filteredExecutions = allExecutions
    
    // Determine granularity based on time range
    let granularity: 'hour' | 'day' | 'week'
    switch (timeRange) {
      case '1h':
      case '24h':
        granularity = 'hour'
        break
      case '7d':
      case '30d':
        granularity = 'day'
        break
      case '90d':
      default:
        granularity = 'week'
    }

    // Create time buckets based on granularity
    const timeBuckets = new Map<string, {
      date: string
      timestamp: number
      executions: Execution[]
    }>()

    for (const execution of filteredExecutions) {
      const executionDate = new Date(execution.startedAt as any) // Parse ISO string
      let bucketKey: string
      let bucketDate: Date

      if (granularity === 'hour') {
        // Round to nearest hour
        bucketDate = new Date(executionDate.getFullYear(), executionDate.getMonth(), 
          executionDate.getDate(), executionDate.getHours())
        bucketKey = bucketDate.toISOString()
      } else if (granularity === 'day') {
        // Round to day
        bucketDate = new Date(executionDate.getFullYear(), executionDate.getMonth(), 
          executionDate.getDate())
        bucketKey = bucketDate.toISOString().split('T')[0]
      } else {
        // Week - round to beginning of week (Monday)
        const dayOfWeek = executionDate.getDay()
        const mondayDate = new Date(executionDate)
        mondayDate.setDate(executionDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
        bucketDate = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate())
        bucketKey = bucketDate.toISOString().split('T')[0]
      }

      if (!timeBuckets.has(bucketKey)) {
        timeBuckets.set(bucketKey, {
          date: bucketKey,
          timestamp: bucketDate.getTime(),
          executions: []
        })
      }

      timeBuckets.get(bucketKey)!.executions.push(execution)
    }

    // Get unique providers
    const providerMap = new Map<string, string>()
    for (const exec of filteredExecutions) {
      if (exec.providerId && !providerMap.has(exec.providerId)) {
        providerMap.set(exec.providerId, (exec as ExecutionWithProvider).providerName || 'Unknown')
      }
    }
    
    const providers = Array.from(providerMap.entries()).map(([id, name], index) => ({
      id,
      name,
      color: PROVIDER_COLORS[index % PROVIDER_COLORS.length]
    }))

    // Generate combined chart data points
    const combinedData: ChartDataPoint[] = []
    
    // Sort buckets chronologically
    const sortedBuckets = Array.from(timeBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))

    for (const [bucketKey, bucket] of sortedBuckets) {
      const totalExecutions = bucket.executions.length
      const successfulExecutions = bucket.executions.filter(e => e.status === 'success').length
      const failedExecutions = bucket.executions.filter(e => e.status === 'error').length
      const successRate = totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0

      // Calculate AI stats for bucket
      const aiCost = bucket.executions.reduce((sum, e) => sum + (e.aiCost || 0), 0)
      const totalTokens = bucket.executions.reduce((sum, e) => sum + (e.totalTokens || 0), 0)

      // Calculate average response time using duration from internal format
      const completedExecutions = bucket.executions.filter(e => e.duration !== undefined)
      let avgResponseTime: number | null = null

      if (completedExecutions.length > 0) {
        const totalDuration = completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0)
        avgResponseTime = Math.round(totalDuration / completedExecutions.length)
      }

      combinedData.push({
        date: bucketKey,
        timestamp: bucket.timestamp,
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate,
        avgResponseTime,
        aiCost,
        totalTokens
      })
    }

    // Generate per-provider chart data
    const byProvider: ProviderChartData[] = []
    
    for (const provider of providers) {
      // Create time buckets for this provider only
      const providerBuckets = new Map<string, {
        date: string
        timestamp: number
        executions: Execution[]
      }>()
      
      const providerExecutions = filteredExecutions.filter(e => e.providerId === provider.id)
      
      for (const execution of providerExecutions) {
        const executionDate = new Date(execution.startedAt as any)
        let bucketKey: string
        let bucketDate: Date

        if (granularity === 'hour') {
          bucketDate = new Date(executionDate.getFullYear(), executionDate.getMonth(), 
            executionDate.getDate(), executionDate.getHours())
          bucketKey = bucketDate.toISOString()
        } else if (granularity === 'day') {
          bucketDate = new Date(executionDate.getFullYear(), executionDate.getMonth(), 
            executionDate.getDate())
          bucketKey = bucketDate.toISOString().split('T')[0]
        } else {
          const dayOfWeek = executionDate.getDay()
          const mondayDate = new Date(executionDate)
          mondayDate.setDate(executionDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
          bucketDate = new Date(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate())
          bucketKey = bucketDate.toISOString().split('T')[0]
        }

        if (!providerBuckets.has(bucketKey)) {
          providerBuckets.set(bucketKey, {
            date: bucketKey,
            timestamp: bucketDate.getTime(),
            executions: []
          })
        }

        providerBuckets.get(bucketKey)!.executions.push(execution)
      }
      
      // Convert to chart data points
      const providerData: ChartDataPoint[] = []
      const sortedProviderBuckets = Array.from(providerBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
      
      for (const [bucketKey, bucket] of sortedProviderBuckets) {
        const totalExecutions = bucket.executions.length
        const successfulExecutions = bucket.executions.filter(e => e.status === 'success').length
        const failedExecutions = bucket.executions.filter(e => e.status === 'error').length
        const successRate = totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0
        const aiCost = bucket.executions.reduce((sum, e) => sum + (e.aiCost || 0), 0)
        const totalTokens = bucket.executions.reduce((sum, e) => sum + (e.totalTokens || 0), 0)
        const completedExecutions = bucket.executions.filter(e => e.duration !== undefined)
        let avgResponseTime: number | null = null
        if (completedExecutions.length > 0) {
          const totalDuration = completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0)
          avgResponseTime = Math.round(totalDuration / completedExecutions.length)
        }

        providerData.push({
          date: bucketKey,
          timestamp: bucket.timestamp,
          totalExecutions,
          successfulExecutions,
          failedExecutions,
          successRate,
          avgResponseTime,
          aiCost,
          totalTokens
        })
      }
      
      byProvider.push({
        providerId: provider.id,
        providerName: provider.name,
        color: provider.color,
        data: providerData
      })
    }

    return {
      combined: combinedData,
      byProvider,
      providers
    }
  } catch (error) {
    console.error('Error generating chart data:', error)
    throw error
  }
}

// GET /api/dashboard/charts - Get time series chart data
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const timeRange = (searchParams.get('timeRange') as TimeRange) || '24h'

    // Require authentication
    const { user, error: authError } = await authenticateRequest(request)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate chart data from database
    try {
      const chartData = await generateChartData(user.id, timeRange)
      
      return NextResponse.json({
        success: true,
        data: chartData.combined, // Backward compatible: main data array
        byProvider: chartData.byProvider,
        providers: chartData.providers,
        timeRange,
        count: chartData.combined.length
      })
    } catch (error) {
      console.error('Failed to generate chart data from database:', error)
      
      // Fallback to empty chart data
      return NextResponse.json({
        success: true,
        data: [],
        byProvider: [],
        providers: [],
        timeRange,
        count: 0
      })
    }
  } catch (error) {
    console.error('Failed to fetch chart data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}