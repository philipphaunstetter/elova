// Provider-Agnostic Data Model
// These interfaces define the common data structures across all automation providers

export interface Provider {
  id: string
  name: string
  type: 'n8n' | 'zapier' | 'make' | 'pipedream' | 'other'
  baseUrl: string
  apiKey?: string // Never sent to client
  isConnected: boolean
  lastChecked: Date
  version?: string
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  metadata?: Record<string, unknown>
  userId: string // Belongs to specific user
}

export interface Workflow {
  id: string
  providerId: string
  providerWorkflowId: string // Original ID from provider
  name: string
  description?: string
  isActive: boolean
  isArchived?: boolean // Computed field for workflows that are inactive and stale
  tags?: string[]
  createdAt: Date
  updatedAt: Date
  lastExecutedAt?: Date

  // Stats (computed from executions)
  totalExecutions: number
  successCount: number
  failureCount: number
  successRate: number // Percentage
  avgDuration?: number // In milliseconds

  // Graph/Flow data
  graph?: WorkflowGraph

  // Provider-specific metadata
  metadata?: Record<string, unknown>
}

export interface Execution {
  id: string
  providerId: string
  workflowId: string // Our internal workflow ID
  providerExecutionId: string // Original ID from provider
  providerWorkflowId: string // Original workflow ID from provider

  status: ExecutionStatus
  startedAt: Date
  stoppedAt?: Date
  duration?: number // In milliseconds

  // Error information
  error?: {
    message: string
    stack?: string
    nodeId?: string // If error occurred at specific node
    timestamp: Date
  }

  // Execution data (limited for privacy/size)
  inputData?: Record<string, unknown>
  outputData?: Record<string, unknown>

  // Mode info
  mode: 'manual' | 'trigger' | 'webhook' | 'cron' | 'unknown'

  // AI Metrics (token usage and costs)
  totalTokens?: number
  inputTokens?: number
  outputTokens?: number
  aiCost?: number
  aiProvider?: string | null
  aiModel?: string | null

  // Provider-specific metadata
  metadata?: Record<string, unknown>
}

export type ExecutionStatus =
  | 'running'
  | 'success'
  | 'error'
  | 'canceled'
  | 'waiting'
  | 'unknown'

export interface WorkflowGraph {
  nodes: GraphNode[]
  connections: GraphConnection[]
  metadata?: {
    version?: string
    lastModified?: Date
    [key: string]: unknown
  }
}

export interface GraphNode {
  id: string
  name: string
  type: string // e.g., 'n8n-nodes-base.httpRequest', 'webhook', etc.
  position: { x: number; y: number }

  // Node configuration (simplified)
  parameters?: Record<string, unknown>

  // Execution context
  executionData?: {
    status?: ExecutionStatus
    startedAt?: Date
    completedAt?: Date
    duration?: number
    error?: string
    outputData?: Record<string, unknown>
  }

  // UI metadata
  disabled?: boolean
  notes?: string
  color?: string
}

export interface GraphConnection {
  sourceNodeId: string
  targetNodeId: string
  sourceOutputIndex?: number // For nodes with multiple outputs
  targetInputIndex?: number // For nodes with multiple inputs
}

export interface EndpointCheck {
  id: string
  providerId: string
  name: string
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'
  expectedStatus?: number
  timeout: number // In milliseconds
  interval: number // Check interval in minutes

  isEnabled: boolean
  createdAt: Date
  updatedAt: Date

  // Latest result
  lastResult?: EndpointResult
}

export interface EndpointResult {
  id: string
  endpointCheckId: string
  timestamp: Date

  success: boolean
  responseTime?: number // In milliseconds
  statusCode?: number
  error?: string

  // Response data (limited)
  responseHeaders?: Record<string, string>
  responseBody?: string // Truncated
}

// Dashboard & Analytics Types
export interface DashboardStats {
  providerId?: string // If null, stats across all providers
  timeRange: TimeRange

  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  successRate: number
  avgResponseTime?: number

  // AI Stats
  totalCost?: number
  totalTokens?: number

  // Time series data for charts
  executionsTrend?: TimeSeriesPoint[]
  successRateTrend?: TimeSeriesPoint[]

  // Top workflows by executions
  topWorkflows?: Array<{
    workflowId: string
    name: string
    executions: number
    successRate: number
  }>

  // Recent failures
  recentFailures?: Array<{
    executionId: string
    workflowName: string
    error: string
    timestamp: Date
  }>

  // Recent activity (latest executions)
  recentActivity?: Array<{
    executionId: string
    workflowName: string
    status: ExecutionStatus
    timestamp: Date
    workflowId: string
  }>
}

export interface TimeSeriesPoint {
  timestamp: Date
  value: number
  label?: string
}

export type TimeRange =
  | '1h'
  | '24h'
  | '7d'
  | '30d'
  | '90d'
  | 'all'
  | 'custom'

export interface CustomTimeRange {
  start: Date
  end: Date
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

// Filters for lists
export interface ExecutionFilters {
  providerId?: string
  workflowId?: string
  status?: ExecutionStatus[]
  timeRange?: TimeRange
  customTimeRange?: CustomTimeRange
  search?: string
}

export interface WorkflowFilters {
  providerId?: string
  isActive?: boolean
  isArchived?: boolean
  tags?: string[]
  search?: string
}

// User preferences
export interface UserPreferences {
  defaultTimeRange: TimeRange
  refreshInterval: number // In seconds
  theme: 'light' | 'dark' | 'system'
  notifications: {
    executionFailures: boolean
    endpointDown: boolean
    email: boolean
  }
}