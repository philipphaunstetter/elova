import { 
  ProviderAdapter, 
  ProviderCapabilities 
} from './base'
import { 
  Provider, 
  Workflow, 
  Execution, 
  WorkflowGraph,
  GraphNode,
  GraphConnection,
  ExecutionFilters,
  WorkflowFilters,
  PaginatedResponse,
  ApiResponse,
  ExecutionStatus
} from '@/types'

/**
 * n8n Provider Adapter
 * Implements the ProviderAdapter interface for n8n automation platform
 */
export class N8nAdapter extends ProviderAdapter {
  constructor(provider: Provider) {
    super(provider)
    this.validateConfig()
  }

  async testConnection(): Promise<ApiResponse<{
    version?: string
    status: 'healthy' | 'warning' | 'error'
    metadata?: Record<string, unknown>
  }>> {
    try {
      const info = await this.makeRequest<any>('/rest/login')
      
      return {
        success: true,
        data: {
          version: info.data?.version || 'unknown',
          status: 'healthy',
          metadata: {
            instanceId: info.data?.instanceId,
            personalizationSurveyState: info.data?.personalizationSurveyState
          }
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
        data: {
          status: 'error' as const,
          metadata: { error: String(error) }
        }
      }
    }
  }

  async getProviderInfo(): Promise<ApiResponse<{
    version: string
    health: 'healthy' | 'warning' | 'error'
    uptime?: number
    features?: string[]
    limits?: Record<string, number>
  }>> {
    try {
      // n8n doesn't have a dedicated health endpoint, so we use login
      const loginInfo = await this.makeRequest<any>('/rest/login')
      
      return {
        success: true,
        data: {
          version: loginInfo.data?.version || 'unknown',
          health: 'healthy',
          features: ['workflows', 'executions', 'triggers', 'webhooks'],
          limits: {
            maxExecutionsPerRequest: 100, // n8n default
            maxWorkflowsPerRequest: 100
          }
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get provider info',
        data: {
          version: 'unknown',
          health: 'error'
        }
      }
    }
  }

  async getWorkflows(filters?: WorkflowFilters): Promise<ApiResponse<PaginatedResponse<Workflow>>> {
    try {
      // Build query parameters
      const params = new URLSearchParams()
      if (filters?.isActive !== undefined) {
        params.append('active', filters.isActive.toString())
      }
      if (filters?.search) {
        params.append('filter', JSON.stringify({ name: { $like: `%${filters.search}%` } }))
      }

      const response = await this.makeRequest<any>(`/rest/workflows?${params}`)
      
      const workflows = response.data.map((workflow: any) => this.transformWorkflow(workflow))
      
      return {
        success: true,
        data: {
          items: workflows,
          total: workflows.length, // n8n doesn't return total in this endpoint
          page: 1,
          limit: workflows.length,
          hasNextPage: false,
          hasPreviousPage: false
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch workflows'
      }
    }
  }

  async getWorkflow(providerWorkflowId: string): Promise<ApiResponse<Workflow>> {
    try {
      const response = await this.makeRequest<any>(`/rest/workflows/${providerWorkflowId}`)
      
      return {
        success: true,
        data: this.transformWorkflow(response.data)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch workflow'
      }
    }
  }

  async getWorkflowGraph(providerWorkflowId: string): Promise<ApiResponse<WorkflowGraph>> {
    try {
      const response = await this.makeRequest<any>(`/rest/workflows/${providerWorkflowId}`)
      
      return {
        success: true,
        data: this.transformGraph(response.data)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch workflow graph'
      }
    }
  }

  async getExecutions(filters?: ExecutionFilters): Promise<ApiResponse<PaginatedResponse<Execution>>> {
    try {
      const params = new URLSearchParams()
      
      // Add filters
      if (filters?.workflowId) {
        params.append('workflowId', filters.workflowId)
      }
      if (filters?.status && filters.status.length > 0) {
        params.append('status', filters.status.join(','))
      }
      
      // Time range filtering
      if (filters?.timeRange) {
        const now = new Date()
        let startTime: Date
        
        switch (filters.timeRange) {
          case '1h':
            startTime = new Date(now.getTime() - 60 * 60 * 1000)
            break
          case '24h':
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            break
          case '7d':
            startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case '30d':
            startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
          default:
            startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000) // Default to 24h
        }
        
        params.append('startedAfter', startTime.toISOString())
      }
      
      if (filters?.customTimeRange) {
        params.append('startedAfter', filters.customTimeRange.start.toISOString())
        params.append('startedBefore', filters.customTimeRange.end.toISOString())
      }

      const response = await this.makeRequest<any>(`/rest/executions?${params}`)
      
      const executions = response.data.results.map((execution: any) => this.transformExecution(execution))
      
      return {
        success: true,
        data: {
          items: executions,
          total: response.data.count || executions.length,
          page: 1,
          limit: executions.length,
          hasNextPage: false,
          hasPreviousPage: false
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch executions'
      }
    }
  }

  async getExecution(providerExecutionId: string): Promise<ApiResponse<Execution>> {
    try {
      const response = await this.makeRequest<any>(`/rest/executions/${providerExecutionId}`)
      
      return {
        success: true,
        data: this.transformExecution(response.data)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch execution'
      }
    }
  }

  async triggerWorkflow(providerWorkflowId: string, inputData?: Record<string, unknown>): Promise<ApiResponse<Execution>> {
    try {
      const response = await this.makeRequest<any>(`/rest/workflows/${providerWorkflowId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ inputData })
      })
      
      return {
        success: true,
        data: this.transformExecution(response.data)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger workflow'
      }
    }
  }

  protected transformWorkflow(providerData: any): Workflow {
    const workflow = providerData
    
    return {
      id: `${this.provider.id}_${workflow.id}`, // Composite ID
      providerId: this.provider.id,
      providerWorkflowId: workflow.id.toString(),
      name: workflow.name || 'Untitled Workflow',
      description: workflow.description || undefined,
      isActive: workflow.active || false,
      tags: workflow.tags || [],
      createdAt: new Date(workflow.createdAt || Date.now()),
      updatedAt: new Date(workflow.updatedAt || Date.now()),
      
      // Stats - will be computed separately or set to defaults
      totalExecutions: 0,
      successCount: 0,
      failureCount: 0,
      successRate: 0,
      
      // Store raw workflow data in metadata
      metadata: {
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings,
        staticData: workflow.staticData,
        pinData: workflow.pinData
      }
    }
  }

  protected transformExecution(providerData: any): Execution {
    const execution = providerData
    
    return {
      id: `${this.provider.id}_${execution.id}`, // Composite ID
      providerId: this.provider.id,
      workflowId: `${this.provider.id}_${execution.workflowId}`, // Composite workflow ID
      providerExecutionId: execution.id.toString(),
      providerWorkflowId: execution.workflowId.toString(),
      
      status: this.mapExecutionStatus(execution.status),
      startedAt: new Date(execution.startedAt),
      stoppedAt: execution.stoppedAt ? new Date(execution.stoppedAt) : undefined,
      duration: execution.stoppedAt && execution.startedAt 
        ? new Date(execution.stoppedAt).getTime() - new Date(execution.startedAt).getTime()
        : undefined,
        
      error: execution.data?.resultData?.error ? {
        message: execution.data.resultData.error.message || 'Unknown error',
        stack: execution.data.resultData.error.stack,
        nodeId: execution.data.resultData.error.node,
        timestamp: new Date(execution.stoppedAt || execution.startedAt)
      } : undefined,
      
      mode: this.mapExecutionMode(execution.mode),
      
      metadata: {
        workflowData: execution.workflowData,
        data: execution.data
      }
    }
  }

  protected transformGraph(providerData: any): WorkflowGraph {
    const workflow = providerData
    const nodes: GraphNode[] = []
    const connections: GraphConnection[] = []

    // Transform nodes
    if (workflow.nodes) {
      for (const node of workflow.nodes) {
        nodes.push({
          id: node.id || node.name,
          name: node.name,
          type: node.type,
          position: node.position || { x: 0, y: 0 },
          parameters: node.parameters,
          disabled: node.disabled || false,
          notes: node.notes,
          color: node.color
        })
      }
    }

    // Transform connections
    if (workflow.connections) {
      for (const [sourceNodeName, nodeConnections] of Object.entries(workflow.connections)) {
        const sourceConnections = nodeConnections as any
        
        for (const [outputType, outputs] of Object.entries(sourceConnections)) {
          if (Array.isArray(outputs)) {
            for (let outputIndex = 0; outputIndex < outputs.length; outputIndex++) {
              const outputConnections = outputs[outputIndex]
              if (Array.isArray(outputConnections)) {
                for (const connection of outputConnections) {
                  connections.push({
                    sourceNodeId: sourceNodeName,
                    targetNodeId: connection.node,
                    sourceOutputIndex: outputIndex,
                    targetInputIndex: connection.index || 0
                  })
                }
              }
            }
          }
        }
      }
    }

    return {
      nodes,
      connections,
      metadata: {
        version: workflow.version,
        lastModified: workflow.updatedAt ? new Date(workflow.updatedAt) : undefined,
        settings: workflow.settings,
        staticData: workflow.staticData
      }
    }
  }

  protected getAuthHeaders(): Record<string, string> {
    const apiKey = this.provider.apiKey || ''
    
    if (apiKey.startsWith('ey') && apiKey.includes('.')) {
      return {
        'Authorization': `Bearer ${apiKey}`
      }
    }
    
    return {
      'X-N8N-API-KEY': apiKey
    }
  }

  getCapabilities(): ProviderCapabilities {
    return {
      canTriggerWorkflows: true,
      canStopExecutions: true,
      canGetRealTimeStatus: false, // n8n doesn't support real-time status via API
      canGetWorkflowGraph: true,
      canGetExecutionLogs: true,
      supportsWebhooks: true,
      supportsScheduling: true,
      maxExecutionsPerRequest: 100,
      maxWorkflowsPerRequest: 100,
      rateLimit: {
        requests: 120,
        per: 'minute'
      }
    }
  }

  private mapExecutionStatus(n8nStatus: string): ExecutionStatus {
    switch (n8nStatus) {
      case 'running':
        return 'running'
      case 'success':
        return 'success'
      case 'error':
        return 'error'
      case 'canceled':
        return 'canceled'
      case 'waiting':
        return 'waiting'
      default:
        return 'unknown'
    }
  }

  private mapExecutionMode(n8nMode: string): 'manual' | 'trigger' | 'webhook' | 'cron' | 'unknown' {
    switch (n8nMode) {
      case 'manual':
        return 'manual'
      case 'trigger':
        return 'trigger'
      case 'webhook':
        return 'webhook'
      case 'cli':
        return 'manual'
      default:
        return 'unknown'
    }
  }
}