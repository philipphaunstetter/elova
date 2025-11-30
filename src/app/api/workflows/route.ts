import { NextRequest, NextResponse } from 'next/server'
import { n8nApi, N8nWorkflow } from '@/lib/n8n-api'
import { authenticateRequest } from '@/lib/api-auth'
import { Workflow } from '@/types'
import { getDb, isMissingTableError } from '@/lib/db'

// GET /api/workflows - List workflows from database
export async function GET(request: NextRequest) {
  try {
    console.log('📋 GET /api/workflows - Fetching workflows from database')

    // Authenticate the request
    const { user, error: authError } = await authenticateRequest(request)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const isActiveFilter = searchParams.get('isActive')
    const isArchivedFilter = searchParams.get('isArchived')
    const providerIdFilter = searchParams.get('providerId')

    // Pagination parameters
    let page = parseInt(searchParams.get('page') || '1')
    if (page < 1) page = 1
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    const db = getDb()

    try {
      // Build SQL query with filters
      let whereConditions: string[] = []
      let queryParams: any[] = []

      if (providerIdFilter) {
        whereConditions.push('w.provider_id = ?')
        queryParams.push(providerIdFilter)
      }

      if (isActiveFilter !== null) {
        const isActiveValue = isActiveFilter.toLowerCase() === 'true'
        whereConditions.push('is_active = ?')
        queryParams.push(isActiveValue ? 1 : 0)
      }

      // Note: Archived filtering is applied after mapping to avoid conflicts with isActive.
      // We compute "archived" as inactive and not updated in 90 days.

      const whereClause = whereConditions.length > 0
        ? `WHERE ${whereConditions.join(' AND ')}`
        : ''

      // Get total count first
      const totalCount: number = await new Promise((resolve, reject) => {
        db.get(`
          SELECT COUNT(*) as total
          FROM workflows w
          ${whereClause}
        `, queryParams, (err, row: any) => {
          if (err) reject(err)
          else resolve(row?.total || 0)
        })
      })

      // Fetch workflows from database with execution stats
      const workflows: any[] = await new Promise((resolve, reject) => {
        db.all(`
          SELECT 
            w.*,
            COUNT(e.id) as total_executions,
            SUM(CASE WHEN e.status = 'success' THEN 1 ELSE 0 END) as success_count,
            SUM(CASE WHEN e.status = 'error' THEN 1 ELSE 0 END) as failure_count,
            AVG(CASE WHEN e.duration IS NOT NULL THEN e.duration ELSE NULL END) as avg_duration,
            MAX(COALESCE(e.stopped_at, e.started_at)) as last_executed_at,
            (
              SELECT e2.status 
              FROM executions e2 
              WHERE e2.workflow_id = w.id 
              ORDER BY COALESCE(e2.stopped_at, e2.started_at) DESC 
              LIMIT 1
            ) as last_execution_status
          FROM workflows w
          LEFT JOIN executions e ON w.id = e.workflow_id
          ${whereClause}
          GROUP BY w.id
          ORDER BY w.updated_at DESC
          LIMIT ? OFFSET ?
        `, [...queryParams, limit, offset], (err, rows) => {
          if (err) reject(err)
          else resolve(rows || [])
        })
      })

      console.log(`✅ Found ${workflows.length} workflows from database`)

      // Convert to API format
      let apiWorkflows: Workflow[] = workflows.map(dbWorkflow => {
        let workflowData: any = {}
        let tags: any[] = []
        try { workflowData = dbWorkflow.workflow_data ? JSON.parse(dbWorkflow.workflow_data) : {} } catch { }
        try { tags = dbWorkflow.tags ? JSON.parse(dbWorkflow.tags) : [] } catch { }
        // Normalize tags to string[] (n8n returns array of tag objects with id/name/createdAt/updatedAt)
        const tagNames: string[] = Array.isArray(tags)
          ? tags.map((t: any) => (typeof t === 'string' ? t : (t?.name ?? ''))).filter(Boolean)
          : []

        const successRate = dbWorkflow.total_executions > 0
          ? (dbWorkflow.success_count / dbWorkflow.total_executions) * 100
          : 0

        // Use database is_archived field (populated from n8n sync)
        const isArchived = Boolean(dbWorkflow.is_archived)

        return {
          id: dbWorkflow.provider_workflow_id, // Use n8n workflow ID as the main ID
          providerId: dbWorkflow.provider_id || 'n8n-main',
          providerWorkflowId: dbWorkflow.provider_workflow_id,
          name: dbWorkflow.name,
          description: '', // n8n workflows don't have descriptions
          isActive: Boolean(dbWorkflow.is_active),
          isArchived: isArchived,
          isTracked: dbWorkflow.is_tracked !== 0, // Default to true if null/undefined (though DB default is 1)
          tags: tagNames,
          createdAt: dbWorkflow.created_at, // Keep as ISO string from database
          updatedAt: dbWorkflow.updated_at, // Keep as ISO string from database
          lastExecutedAt: dbWorkflow.last_executed_at || undefined, // Keep as ISO string from database
          totalExecutions: parseInt(dbWorkflow.total_executions) || 0,
          successCount: parseInt(dbWorkflow.success_count) || 0,
          failureCount: parseInt(dbWorkflow.failure_count) || 0,
          successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
          avgDuration: dbWorkflow.avg_duration ? Math.round(dbWorkflow.avg_duration) : undefined,
          lastExecutionStatus: dbWorkflow.last_execution_status as 'success' | 'error' | 'running' | 'waiting' | 'canceled',
          metadata: {
            nodeCount: dbWorkflow.node_count || 0,
            n8nWorkflowId: dbWorkflow.provider_workflow_id,
            connections: workflowData.connections || {}
          }
        }
      })

      // Apply archived filter post-mapping to avoid SQL conflicts with isActive
      if (isArchivedFilter !== null) {
        const isArchivedValue = isArchivedFilter.toLowerCase() === 'true'
        const before = apiWorkflows.length
        apiWorkflows = apiWorkflows.filter(w => w.isArchived === isArchivedValue)
        console.log(`🔍 Archived post-filter: ${before} -> ${apiWorkflows.length} (isArchived=${isArchivedValue})`)
      }

      if (isActiveFilter !== null) {
        const isActiveValue = isActiveFilter.toLowerCase() === 'true'
        console.log(`🔍 Filtered to ${apiWorkflows.length} workflows with isActive=${isActiveValue}`)
      }

      return NextResponse.json({
        success: true,
        data: {
          items: apiWorkflows,
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        }
      })
    } catch (dbError) {
      console.error('❌ Database error:', dbError)
      // If schema is missing on first boot, respond with empty list instead of 500
      if (isMissingTableError(dbError)) {
        return NextResponse.json({
          success: true,
          data: {
            items: [],
            total: 0,
            page: 1,
            limit: 20,
            totalPages: 0
          },
          warning: 'Database schema not initialized yet. Run initial sync to populate data.'
        })
      }
      return NextResponse.json(
        { error: 'Failed to fetch workflows from database' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('❌ Failed to fetch workflows:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
