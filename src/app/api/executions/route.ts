import { NextRequest, NextResponse } from 'next/server'
import { ExecutionFilters, ExecutionStatus, Execution } from '@/types'
import { N8nExecution, N8nWorkflow } from '@/lib/n8n-api'
import { authenticateRequest } from '@/lib/api-auth'
import { getDb, isMissingTableError } from '@/lib/db'

// GET /api/executions - List executions across all providers
// Supports query parameters:
// - limit: Number of executions to fetch (default: 500, max recommended: 1000)
// - cursor: Pagination cursor for fetching next page
// - workflowId: Filter by specific workflow
// - status: Filter by execution status (comma-separated)
// - timeRange: Filter by time range (1h, 24h, 7d, 30d, 90d)
// - search: Search in execution ID, workflow name, or error message
export async function GET(request: NextRequest) {
  try {
    // Authenticate the request (handles both dev and Supabase auth)
    const { user, error: authError } = await authenticateRequest(request)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    let limit = parseInt(searchParams.get('limit') || '2000') // Increased default to show more executions
    let page = parseInt(searchParams.get('page') || '1')
    if (page < 1) page = 1

    // Validate and cap the limit to prevent performance issues
    if (limit > 5000) {
      console.warn(`Execution limit ${limit} exceeds maximum of 5000, capping to 5000`)
      limit = 5000
    }
    if (limit < 1) {
      limit = 2000 // Reset to default if invalid
    }
    const offset = (page - 1) * limit

    const filters: ExecutionFilters = {
      providerId: searchParams.get('providerId') || undefined,
      workflowId: searchParams.get('workflowId') || undefined,
      status: searchParams.get('status')?.split(',') as any || undefined,
      timeRange: searchParams.get('timeRange') as any || '24h',
      search: searchParams.get('search') || undefined
    }

    // Parse custom time range if provided
    const customStart = searchParams.get('customStart')
    const customEnd = searchParams.get('customEnd')
    if (customStart && customEnd) {
      filters.customTimeRange = {
        start: new Date(customStart),
        end: new Date(customEnd)
      }
      filters.timeRange = 'custom'
    }

    // Fetch executions from local SQLite database for long-term storage
    let allExecutions: Execution[] = []
    let totalCount = 0

    try {
      console.log(`Fetching executions from SQLite database (page: ${page}, limit: ${limit})...`)

      const db = getDb()

      // Build WHERE clause and params for both queries
      let whereClause = 'WHERE 1=1'
      const params: any[] = []

      // Add filters
      if (filters.providerId) {
        whereClause += ' AND e.provider_id = ?'
        params.push(filters.providerId)
      }

      if (filters.workflowId) {
        whereClause += ' AND w.provider_workflow_id = ?'
        params.push(filters.workflowId)
      }

      if (filters.status && filters.status.length > 0) {
        const placeholders = filters.status.map(() => '?').join(',')
        whereClause += ` AND e.status IN (${placeholders})`
        params.push(...filters.status)
      }

      // Add time range filter
      if (filters.timeRange && filters.timeRange !== 'custom' && filters.timeRange !== 'all') {
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
        whereClause += ' AND e.started_at >= ?'
        params.push(startDate.toISOString())
      }

      // Custom time range
      if (filters.timeRange === 'custom' && filters.customTimeRange) {
        whereClause += ' AND e.started_at >= ? AND e.started_at <= ?'
        params.push(
          filters.customTimeRange.start.toISOString(),
          filters.customTimeRange.end.toISOString()
        )
      }

      // Add search filter
      if (filters.search) {
        whereClause += ` AND (
          e.id LIKE ? OR 
          e.provider_execution_id LIKE ? OR
          w.name LIKE ?
        )`
        const searchTerm = `%${filters.search}%`
        params.push(searchTerm, searchTerm, searchTerm)
      }

      // CTE for grouping logic
      const groupingCte = `
        WITH FilteredExecutions AS (
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
            e.total_tokens,
            e.input_tokens,
            e.output_tokens,
            e.ai_cost,
            e.ai_provider,
            w.name as workflow_name,
            p.name as provider_name
          FROM executions e
          LEFT JOIN workflows w ON e.workflow_id = w.id
          LEFT JOIN providers p ON e.provider_id = p.id
          ${whereClause}
        ),
        MarkedGroups AS (
          SELECT 
            *,
            CASE 
              WHEN 
                LAG(workflow_id) OVER (ORDER BY started_at DESC) = workflow_id AND 
                LAG(status) OVER (ORDER BY started_at DESC) = status AND
                LAG(mode) OVER (ORDER BY started_at DESC) = mode AND
                mode IN ('trigger', 'webhook', 'cron', 'schedule')
              THEN 0 
              ELSE 1 
            END as is_group_start
          FROM FilteredExecutions
        ),
        GroupedExecutions AS (
          SELECT 
            *,
            SUM(is_group_start) OVER (ORDER BY started_at DESC) as group_id
          FROM MarkedGroups
        )
      `

      // Count query (count distinct groups)
      const countSql = `
        ${groupingCte}
        SELECT COUNT(DISTINCT group_id) as total
        FROM GroupedExecutions
      `

      totalCount = await new Promise<number>((resolve, reject) => {
        db.get(countSql, params, (err, row: any) => {
          if (err) reject(err)
          else resolve(row?.total || 0)
        })
      })

      // Data query (fetch executions for the current page of groups)
      const sql = `
        ${groupingCte},
        PagedGroups AS (
          SELECT DISTINCT group_id
          FROM GroupedExecutions
          ORDER BY group_id ASC
          LIMIT ? OFFSET ?
        )
        SELECT *
        FROM GroupedExecutions
        WHERE group_id IN (SELECT group_id FROM PagedGroups)
        ORDER BY started_at DESC
      `

      // Execute query
      const rows = await new Promise<any[]>((resolve, reject) => {
        db.all(sql, [...params, limit, offset], (err, rows) => {
          if (err) {
            console.error('Database query error:', err)
            reject(err)
          } else {
            resolve(rows || [])
          }
        })
      })


      // Convert database results to internal Execution format
      allExecutions = rows.map(row => {
        let parsedMeta: any = {}
        try {
          parsedMeta = row.metadata ? JSON.parse(row.metadata) : {}
        } catch {
          parsedMeta = {}
        }
        const metadata = parsedMeta
        return {
          id: row.id,
          providerId: row.provider_id,
          workflowId: row.workflow_id,
          providerExecutionId: row.provider_execution_id,
          providerWorkflowId: row.provider_workflow_id,
          status: row.status as ExecutionStatus,
          startedAt: new Date(row.started_at),
          stoppedAt: row.stopped_at ? new Date(row.stopped_at) : undefined,
          duration: row.duration,
          mode: row.mode as any,
          error: row.status === 'error' ? {
            message: `Execution failed`,
            timestamp: row.stopped_at ? new Date(row.stopped_at) : new Date(row.started_at)
          } : undefined,
          // AI Metrics
          totalTokens: row.total_tokens || 0,
          inputTokens: row.input_tokens || 0,
          outputTokens: row.output_tokens || 0,
          aiCost: row.ai_cost || 0,
          aiProvider: row.ai_provider || null,
          metadata: {
            workflowName: row.workflow_name || 'Unknown Workflow',
            providerName: row.provider_name || 'Unknown Provider',
            finished: Boolean(row.finished),
            retryOf: row.retry_of,
            retrySuccessId: row.retry_success_id,
            ...metadata
          }
        } as Execution
      })

      console.log(`Fetched ${allExecutions.length} executions from SQLite database`)

      // If no executions found, suggest running sync
      if (allExecutions.length === 0) {
        console.log('⚠️  No executions found in database. Consider running sync to fetch from n8n.')
      }

    } catch (error) {
      console.error('Failed to fetch executions from database:', error)
      // If schema isn't initialized yet, return an empty result set gracefully
      if (isMissingTableError(error)) {
        return NextResponse.json({
          success: true,
          data: {
            items: [],
            total: 0,
            limit: limit,
            page: page,
            totalPages: 0
          },
          warning: 'Database schema not initialized yet. Run initial sync to populate data.'
        })
      }
      return NextResponse.json(
        { error: 'Failed to fetch executions from database.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        items: allExecutions,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    })

  } catch (error) {
    console.error('Failed to fetch executions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

