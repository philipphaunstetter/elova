import { NextRequest, NextResponse } from 'next/server'
import { workflowSync } from '@/lib/sync/workflow-sync'
import { authenticateRequest } from '@/lib/api-auth'
import { getDb } from '@/lib/db'

// GET /api/workflows/[id] - Get individual workflow details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    console.log(`📋 GET /api/workflows/${id} - Fetching workflow details`)
    
    // Authenticate the request
    const { user, error: authError } = await authenticateRequest(request)
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch workflow from database
    const db = getDb()
    const workflow = await new Promise<any>((resolve, reject) => {
      db.get(
        `SELECT w.*, 
          COUNT(e.id) as total_executions,
          SUM(CASE WHEN e.status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN e.status = 'error' THEN 1 ELSE 0 END) as failure_count,
          AVG(CASE WHEN e.duration IS NOT NULL THEN e.duration ELSE NULL END) as avg_duration,
          MAX(COALESCE(e.stopped_at, e.started_at)) as last_executed_at
        FROM workflows w
        LEFT JOIN executions e ON w.id = e.workflow_id
        WHERE w.provider_workflow_id = ?
        GROUP BY w.id`,
        [id],
        (err, row) => {
          if (err) reject(err)
          else resolve(row || null)
        }
      )
    })
    
    if (!workflow) {
      console.log(`❌ Workflow ${id} not found in database`)
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      )
    }
    
    console.log(`✅ Found workflow: ${workflow.name}`)
    
    // Parse workflow data
    let workflowJson: any = {}
    try {
      workflowJson = workflow.workflow_data ? JSON.parse(workflow.workflow_data) : {}
    } catch (e) {
      console.error('Failed to parse workflow_data:', e)
    }
    
    let tags: any[] = []
    try {
      tags = workflow.tags ? JSON.parse(workflow.tags) : []
    } catch (e) {}
    
    const successRate = workflow.total_executions > 0 
      ? (workflow.success_count / workflow.total_executions) * 100
      : 0
    
    // Convert to API format with full workflow JSON
    const workflowData = {
      id: workflow.provider_workflow_id,
      providerId: workflow.provider_id || 'n8n-main',
      providerWorkflowId: workflow.provider_workflow_id,
      name: workflow.name,
      description: '', // n8n workflows don't have descriptions
      isActive: Boolean(workflow.is_active),
      isArchived: Boolean(workflow.is_archived),
      tags: tags,
      createdAt: new Date(workflow.created_at),
      updatedAt: new Date(workflow.updated_at),
      lastExecutedAt: workflow.last_executed_at ? new Date(workflow.last_executed_at) : undefined,
      totalExecutions: parseInt(workflow.total_executions) || 0,
      successCount: parseInt(workflow.success_count) || 0,
      failureCount: parseInt(workflow.failure_count) || 0,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: workflow.avg_duration ? Math.round(workflow.avg_duration) : undefined,
      workflowJson: workflowJson, // Include the full n8n workflow JSON from database
      graph: {
        nodes: workflowJson.nodes || [],
        connections: workflowJson.connections || {}
      },
      metadata: {
        nodeCount: workflow.node_count || 0,
        n8nWorkflowId: workflow.provider_workflow_id,
        connections: workflowJson.connections
      }
    }
    
    return NextResponse.json({
      success: true,
      data: workflowData
    })
  } catch (error) {
    console.error('❌ Failed to fetch workflow:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/workflows/[id] - Update workflow settings (archive, backup toggle)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, ...data } = body

    console.log(`🔧 Workflow action: ${action} for workflow ${id}`)

    switch (action) {
      case 'archive':
        await workflowSync.archiveWorkflow(id, data.reason)
        return NextResponse.json({
          success: true,
          message: 'Workflow archived successfully'
        })

      case 'toggle_backup':
        await workflowSync.toggleWorkflowBackup(id, data.backupEnabled)
        return NextResponse.json({
          success: true,
          message: `Backup ${data.backupEnabled ? 'enabled' : 'disabled'} for workflow`
        })

      case 'toggle_tracking':
        await workflowSync.toggleTracking(id, data.isTracked, data.deleteData)
        return NextResponse.json({
          success: true,
          message: `Tracking ${data.isTracked ? 'enabled' : 'disabled'} for workflow`
        })

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Failed to update workflow:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/workflows/[id] - Delete workflow backup from database
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    console.log(`🗑️ Deleting workflow backup: ${id}`)
    
    await workflowSync.deleteWorkflowBackup(id)
    
    return NextResponse.json({
      success: true,
      message: 'Workflow backup deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete workflow backup:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}