'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { Execution, TimeRange } from '@/types'
import { 
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Input, InputGroup } from '@/components/input'
import { Listbox, ListboxOption, ListboxLabel } from '@/components/listbox'
import { createN8nExecutionUrl } from '@/lib/utils'
import { Skeleton } from '@/components/skeleton'

const statusIcons = {
  'success': CheckCircleIcon,
  'error': XCircleIcon,
  'running': PlayIcon,
  'waiting': ClockIcon,
  'canceled': ExclamationTriangleIcon,
  'unknown': ClockIcon
}

const statusColors = {
  'success': 'green',
  'error': 'red', 
  'running': 'blue',
  'waiting': 'yellow',
  'canceled': 'zinc',
  'unknown': 'zinc'
} as const

interface RecentExecutionsTableProps {
  timeRange: TimeRange
}

export function RecentExecutionsTable({ timeRange }: RecentExecutionsTableProps) {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'startedAt' | 'duration' | 'status'>('startedAt')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [n8nUrl, setN8nUrl] = useState<string>('')

  const fetchExecutions = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      params.append('timeRange', timeRange)
      // Limit to 100 for dashboard view to keep it lightweight
      params.append('limit', '100')
      
      const response = await apiClient.get<{ data: { items: Execution[] } }>(`/executions?${params}`)
      setExecutions(response.data.items)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch execution history:', err)
      setError('Failed to load execution history')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, timeRange])

  useEffect(() => {
    fetchExecutions()
  }, [fetchExecutions])

  useEffect(() => {
    // Fetch n8n URL on component mount
    const fetchN8nUrl = async () => {
      try {
        const response = await apiClient.get<{ n8nUrl: string }>('/config/n8n-url')
        setN8nUrl(response.n8nUrl)
      } catch (err) {
        console.error('Failed to fetch n8n URL:', err)
        // Fallback to default
        setN8nUrl('http://localhost:5678')
      }
    }
    fetchN8nUrl()
  }, [])

  const filteredAndSortedExecutions = executions
    .filter(execution => {
      if (!searchTerm) return true
      const searchLower = searchTerm.toLowerCase()
      const workflowName = execution.metadata?.workflowName || ''
      return (
        execution.providerExecutionId.toLowerCase().includes(searchLower) ||
        execution.providerWorkflowId.toLowerCase().includes(searchLower) ||
        (typeof workflowName === 'string' && workflowName.toLowerCase().includes(searchLower)) ||
        execution.error?.message?.toLowerCase().includes(searchLower)
      )
    })
    .sort((a, b) => {
      let aValue, bValue
      switch (sortBy) {
        case 'duration':
          aValue = a.duration || 0
          bValue = b.duration || 0
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        default:
          aValue = new Date(a.startedAt).getTime()
          bValue = new Date(b.startedAt).getTime()
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

  const formatDuration = (duration?: number) => {
    if (!duration) return '-'
    if (duration < 1000) return `${duration}ms`
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(date))
  }

  const openN8nExecution = (execution: Execution) => {
    if (!n8nUrl) {
      console.error('n8n URL not available')
      return
    }
    
    // Create properly formatted execution URL
    const executionUrl = createN8nExecutionUrl(
      n8nUrl,
      execution.providerWorkflowId,
      execution.providerExecutionId
    )
    
    // Open in new tab
    window.open(executionUrl, '_blank')
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Error loading history</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{error}</p>
        <Button onClick={fetchExecutions} className="mt-4">
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Live Execution Log</h3>
        <div className="flex space-x-3">
          <Button 
            outline
            onClick={fetchExecutions} 
            disabled={loading}
            className="flex items-center space-x-2"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Loading...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white dark:bg-slate-800 p-4 shadow rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Search
            </label>
            <InputGroup>
              <MagnifyingGlassIcon data-slot="icon" />
              <Input
                name="search"
                placeholder="Search ID, workflow..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </InputGroup>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Status
            </label>
            <Listbox
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <ListboxOption value="all"><ListboxLabel>All statuses</ListboxLabel></ListboxOption>
              <ListboxOption value="success"><ListboxLabel>Success</ListboxLabel></ListboxOption>
              <ListboxOption value="error"><ListboxLabel>Error</ListboxLabel></ListboxOption>
              <ListboxOption value="running"><ListboxLabel>Running</ListboxLabel></ListboxOption>
              <ListboxOption value="waiting"><ListboxLabel>Waiting</ListboxLabel></ListboxOption>
              <ListboxOption value="canceled"><ListboxLabel>Canceled</ListboxLabel></ListboxOption>
            </Listbox>
          </div>

          <div>
            <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Sort By
            </label>
            <Listbox
              value={sortBy}
              onChange={(value) => setSortBy(value as 'startedAt' | 'duration' | 'status')}
            >
              <ListboxOption value="startedAt"><ListboxLabel>Start Time</ListboxLabel></ListboxOption>
              <ListboxOption value="duration"><ListboxLabel>Duration</ListboxLabel></ListboxOption>
              <ListboxOption value="status"><ListboxLabel>Status</ListboxLabel></ListboxOption>
            </Listbox>
          </div>

          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Order
            </label>
            <Listbox
              value={sortOrder}
              onChange={(value) => setSortOrder(value as 'asc' | 'desc')}
            >
              <ListboxOption value="desc"><ListboxLabel>Descending</ListboxLabel></ListboxOption>
              <ListboxOption value="asc"><ListboxLabel>Ascending</ListboxLabel></ListboxOption>
            </Listbox>
          </div>
        </div>
      </div>

      {/* Executions List */}
      <div className="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-lg border border-gray-200 dark:border-slate-700">
        {loading && executions.length === 0 ? (
          <div className="divide-y divide-gray-200 dark:divide-slate-700">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-4 sm:px-6 flex items-center justify-between">
                <div className="flex items-center flex-1 space-x-4">
                  <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-3">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <Skeleton className="h-3 w-64" />
                  </div>
                </div>
                <Skeleton className="h-7 w-16 ml-4" />
              </div>
            ))}
          </div>
        ) : filteredAndSortedExecutions.length === 0 ? (
          <div className="p-8 text-center">
            <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No executions found</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              {executions.length === 0 
                ? 'No executions found for this time range'
                : 'No executions match your search criteria'
              }
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-slate-700 max-h-[600px] overflow-y-auto">
            {filteredAndSortedExecutions.map((execution) => {
              const StatusIcon = statusIcons[execution.status]
              const statusColor = statusColors[execution.status]
              
              return (
                <li key={execution.id} className="px-4 py-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0 flex-1">
                      <div className="flex-shrink-0">
                        <StatusIcon className={`h-5 w-5 ${
                          execution.status === 'success' ? 'text-green-500' :
                          execution.status === 'error' ? 'text-red-500' :
                          execution.status === 'running' ? 'text-blue-500' :
                          execution.status === 'waiting' ? 'text-yellow-500' :
                          'text-gray-400'
                        }`} />
                      </div>
                      <div className="ml-4 min-w-0 flex-1">
                        <div className="flex items-center space-x-3">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {(execution.metadata as { workflowName?: string })?.workflowName || execution.providerWorkflowId}
                          </p>
                          <Badge color={statusColor} className="capitalize text-[10px] px-1.5 py-0.5">
                            {execution.status}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-slate-400 mt-1">
                          <span className="font-mono">{execution.providerExecutionId.substring(0, 8)}...</span>
                          <span>•</span>
                          <span>{formatDate(execution.startedAt)}</span>
                          <span>•</span>
                          <span>{formatDuration(execution.duration)}</span>
                          {execution.aiCost && execution.aiCost > 0 && (
                            <>
                              <span>•</span>
                              <span className="font-medium text-gray-700 dark:text-slate-300">${execution.aiCost.toFixed(4)}</span>
                            </>
                          )}
                        </div>
                        {execution.error && (
                          <p className="text-xs text-red-600 truncate mt-1 max-w-md">
                            {execution.error.message}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 ml-2">
                      <Button 
                        outline
                        className="text-xs px-2 py-1 h-7"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation()
                          openN8nExecution(execution)
                        }}
                      >
                        Open
                      </Button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}