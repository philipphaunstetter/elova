'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import { WithN8NConnection } from '@/components/with-n8n-connection'
import { apiClient } from '@/lib/api-client'
import { useDebounce } from '@/hooks/use-debounce'
import {
  ExecutionStatus,
  TimeRange,
  Execution,
  Provider
} from '@/types'
import {
  PlayIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ListBulletIcon
} from '@heroicons/react/24/outline'
import { DEMO_WORKFLOWS } from '@/lib/demo-data'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Input, InputGroup } from '@/components/input'
import { Listbox, ListboxOption, ListboxLabel } from '@/components/listbox'
import { showToast } from '@/components/toast'
import { formatExecutionId, createN8nExecutionUrl } from '@/lib/utils'
import { AICostTooltip } from '@/components/ai-cost-tooltip'
import { PricingSidePanel } from '@/components/pricing-side-panel'

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

const modeColors: Record<string, 'cyan' | 'amber' | 'violet' | 'emerald' | 'zinc' | 'blue' | 'rose'> = {
  'manual': 'cyan',
  'trigger': 'amber',
  'webhook': 'violet',
  'cron': 'emerald',
  'unknown': 'zinc',
  'poll': 'blue',
  'error': 'rose'
}

interface ExecutionGroup {
  type: 'group'
  id: string
  executions: Execution[]
  workflowId: string
  status: ExecutionStatus
  providerId: string
  mode: string
  startTime: Date
  endTime: Date
  avgDuration: number
  totalTokens: number
  totalCost: number
}

type ExecutionItem = Execution | ExecutionGroup

function isExecutionGroup(item: ExecutionItem): item is ExecutionGroup {
  return (item as any).type === 'group'
}

function Pagination({
  currentPage,
  totalPages,
  totalCount,
  itemsPerPage,
  onPageChange
}: {
  currentPage: number
  totalPages: number
  totalCount: number
  itemsPerPage: number
  onPageChange: (page: number) => void
}) {
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalCount)

  const renderPageNumbers = () => {
    const pages = []
    const maxVisiblePages = 7

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 3) {
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
      } else {
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      }
    }

    return pages.map((page, index) => {
      if (page === '...') {
        return (
          <span
            key={`ellipsis-${index}`}
            className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 focus:outline-offset-0 dark:text-gray-400 dark:ring-slate-600"
          >
            ...
          </span>
        )
      }

      const isCurrent = page === currentPage
      return (
        <button
          key={page}
          onClick={() => onPageChange(page as number)}
          aria-current={isCurrent ? 'page' : undefined}
          className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 focus:outline-offset-0 ${isCurrent
            ? 'z-10 bg-rose-600 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-slate-600 dark:hover:bg-slate-700'
            }`}
        >
          {page}
        </button>
      )
    })
  }

  return (
    <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <Button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          outline
          className="relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium"
        >
          Previous
        </Button>
        <Button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          outline
          className="relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium"
        >
          Next
        </Button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-400">
            Showing <span className="font-medium">{startItem}</span> to <span className="font-medium">{endItem}</span> of{' '}
            <span className="font-medium">{totalCount}</span> results
          </p>
        </div>
        <div>
          <nav aria-label="Pagination" className="isolate inline-flex -space-x-px rounded-md shadow-sm">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed dark:ring-slate-600 dark:hover:bg-slate-700"
            >
              <span className="sr-only">Previous</span>
              <ChevronLeftIcon aria-hidden="true" className="h-5 w-5" />
            </button>
            {renderPageNumbers()}
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed dark:ring-slate-600 dark:hover:bg-slate-700"
            >
              <span className="sr-only">Next</span>
              <ChevronRightIcon aria-hidden="true" className="h-5 w-5" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  )
}

function ExecutionsContent() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 500)
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [n8nUrl, setN8nUrl] = useState<string>('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [showPricing, setShowPricing] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const itemsPerPage = 20

  const router = useRouter()

  useEffect(() => {
    fetchProviders()
  }, [])

  useEffect(() => {
    // Reset page when filters change
    setCurrentPage(1)
    fetchExecutions(1)
  }, [statusFilter, timeRange, providerFilter, debouncedSearchTerm])

  const fetchProviders = async () => {
    try {
      const response = await apiClient.get<{ data: Provider[] }>('/providers')
      setProviders(response.data)
    } catch (error) {
      console.error('Failed to fetch providers:', error)
    }
  }

  const syncExecutions = async (deep = false) => {
    try {
      setSyncing(true)
      const response = await apiClient.post('/sync/executions', { deep })
      // After successful sync, refresh the data
      await fetchExecutions()
      setError(null)

      showToast({
        type: 'success',
        title: 'Executions synced successfully',
        message: 'Latest execution data has been fetched from n8n'
      })
    } catch (err) {
      console.error('Failed to sync executions:', err)
      const errorMessage = 'Failed to sync executions. Please try again.'
      setError(errorMessage)

      showToast({
        type: 'error',
        title: 'Sync failed',
        message: errorMessage
      })
    } finally {
      setSyncing(false)
    }
  }

  const fetchExecutions = async (page = 1) => {
    try {
      setLoading(true)

      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      if (providerFilter !== 'all') {
        params.append('providerId', providerFilter)
      }
      if (debouncedSearchTerm) {
        params.append('search', debouncedSearchTerm)
      }
      params.append('timeRange', timeRange)
      params.append('page', page.toString())
      params.append('limit', itemsPerPage.toString())

      const response = await apiClient.get<{
        data: {
          items: Execution[],
          total: number,
          page: number,
          totalPages: number
        }
      }>(`/executions?${params}`)

      setExecutions(response.data.items)
      setTotalCount(response.data.total)
      setTotalPages(response.data.totalPages)
      setCurrentPage(page)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch executions:', err)
      setError('Failed to load executions')
    } finally {
      setLoading(false)
    }
  }

  const filteredExecutions = executions

  const groupedExecutions = (() => {
    const groups: ExecutionItem[] = []
    let currentGroup: Execution[] = []

    const flushGroup = () => {
      if (currentGroup.length === 0) return

      // Only group if we have 3 or more consecutive executions
      // AND they are automated runs (trigger/webhook/cron)
      // AND they have the same status
      const first = currentGroup[0]
      const isAutomated = ['trigger', 'webhook', 'cron'].includes(first.mode) ||
        (first.metadata as any)?.firstNode?.name?.toLowerCase().includes('schedule')

      if (currentGroup.length >= 5 && isAutomated) {
        const totalDuration = currentGroup.reduce((acc, curr) => acc + (curr.duration || 0), 0)
        const totalTokens = currentGroup.reduce((acc, curr) => acc + (curr.totalTokens || 0), 0)
        const totalCost = currentGroup.reduce((acc, curr) => acc + (curr.aiCost || 0), 0)

        groups.push({
          type: 'group',
          id: `group-${first.workflowId}-${first.id}-${currentGroup.length}`,
          executions: [...currentGroup],
          workflowId: first.workflowId,
          status: first.status,
          providerId: first.providerId,
          mode: first.mode,
          startTime: new Date(currentGroup[currentGroup.length - 1].startedAt), // Last one in list is actually first in time usually? Wait, list is usually desc.
          endTime: new Date(first.startedAt),
          avgDuration: totalDuration / currentGroup.length,
          totalTokens,
          totalCost
        })
      } else {
        groups.push(...currentGroup)
      }
      currentGroup = []
    }

    filteredExecutions.forEach((execution) => {
      if (currentGroup.length === 0) {
        currentGroup.push(execution)
        return
      }

      const prev = currentGroup[0]

      const matches =
        prev.workflowId === execution.workflowId &&
        prev.status === execution.status &&
        prev.mode === execution.mode

      if (matches) {
        currentGroup.push(execution)
      } else {
        flushGroup()
        currentGroup.push(execution)
      }
    })

    flushGroup()
    return groups
  })()

  const toggleGroup = (groupId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId)
    } else {
      newExpanded.add(groupId)
    }
    setExpandedGroups(newExpanded)
  }

  const formatDuration = (duration?: number) => {
    if (!duration) return '-'
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(1)}s`
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(date))
  }


  const openN8nExecution = (execution: Execution) => {
    // Find provider for this execution
    const provider = providers.find(p => p.id === execution.providerId)
    if (!provider) {
      console.error('Provider not found for execution')
      return
    }

    // Create properly formatted execution URL
    const executionUrl = createN8nExecutionUrl(
      provider.baseUrl,
      execution.providerWorkflowId,
      execution.providerExecutionId
    )

    // Open in new tab
    window.open(executionUrl, '_blank')
  }

  const viewExecutionDetails = (executionId: string) => {
    router.push(`/executions/${executionId}`)
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Error loading executions</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{error}</p>
        <Button onClick={() => fetchExecutions()} className="mt-4">
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative min-h-full">
        <div className="flex-1 min-w-0 space-y-6 transition-all duration-300 ease-in-out">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Executions</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
                Monitor and debug workflow execution history
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                outline
                onClick={() => syncExecutions(false)}
                disabled={syncing || loading}
                className="flex items-center space-x-2"
              >
                <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing...' : 'Sync'}</span>
              </Button>
              <Button
                outline
                onClick={() => syncExecutions(true)}
                disabled={syncing || loading}
                className="flex items-center space-x-2"
                title="Force a full sync of all executions (slower)"
              >
                <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>Full Sync</span>
              </Button>
              <Button onClick={() => fetchExecutions()} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div>
              <label htmlFor="provider" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                n8n Instance
              </label>
              <Listbox
                value={providerFilter}
                onChange={setProviderFilter}
              >
                <ListboxOption value="all">
                  <ListboxLabel>All instances</ListboxLabel>
                </ListboxOption>
                {providers.map(provider => (
                  <ListboxOption key={provider.id} value={provider.id}>
                    <ListboxLabel>{provider.name}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </div>

            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Search
              </label>
              <InputGroup>
                <MagnifyingGlassIcon data-slot="icon" />
                <Input
                  name="search"
                  placeholder="Search executions..."
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
                onChange={(value) => setStatusFilter(value as ExecutionStatus | 'all')}
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
              <label htmlFor="timeRange" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                Time Range
              </label>
              <Listbox
                value={timeRange}
                onChange={(value) => setTimeRange(value as TimeRange)}
              >
                <ListboxOption value="1h"><ListboxLabel>Last hour</ListboxLabel></ListboxOption>
                <ListboxOption value="24h"><ListboxLabel>Last 24 hours</ListboxLabel></ListboxOption>
                <ListboxOption value="7d"><ListboxLabel>Last 7 days</ListboxLabel></ListboxOption>
                <ListboxOption value="30d"><ListboxLabel>Last 30 days</ListboxLabel></ListboxOption>
                <ListboxOption value="all"><ListboxLabel>All Time</ListboxLabel></ListboxOption>
              </Listbox>
            </div>

            <div className="flex items-end">
              <Button outline className="flex items-center space-x-2">
                <FunnelIcon className="h-4 w-4" />
                <span>More</span>
              </Button>
            </div>
          </div>

          {/* Results Summary */}
          <div className="bg-white dark:bg-slate-800 px-4 py-3 border border-gray-200 dark:border-slate-300 rounded-md">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-400">
              <span>
                <span>
                  Showing {filteredExecutions.length} executions
                  {groupedExecutions.length !== filteredExecutions.length && (
                    <span className="ml-1 text-gray-500">
                      (grouped into {groupedExecutions.length} rows)
                    </span>
                  )}
                </span>
              </span>
              <span>
                {timeRange === '1h' && 'Last hour'}
                {timeRange === '24h' && 'Last 24 hours'}
                {timeRange === '7d' && 'Last 7 days'}
                {timeRange === '30d' && 'Last 30 days'}
              </span>
            </div>
          </div>

          {/* Executions Table */}
          <div className="bg-white dark:bg-slate-800 shadow border border-gray-200 dark:border-slate-300 overflow-hidden sm:rounded-md flex flex-col" style={{ height: 'calc(100vh - 24rem)' }}>
            <Table className="flex-1">
              <TableHead>
                <TableRow>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Execution ID</TableHeader>
                  <TableHeader>Instance</TableHeader>
                  <TableHeader>Workflow</TableHeader>
                  <TableHeader>Started</TableHeader>
                  <TableHeader>Duration</TableHeader>
                  <TableHeader>Mode</TableHeader>
                  <TableHeader>Tokens</TableHeader>
                  <TableHeader>
                    <div className="flex items-center gap-1">
                      <span>AI Cost</span>
                      <AICostTooltip type="header" onToggle={() => setShowPricing(!showPricing)} />
                    </div>
                  </TableHeader>
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  // Loading rows
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10}>
                        <div className="animate-pulse flex space-x-4 py-4">
                          <div className="rounded-full bg-gray-300 h-6 w-6"></div>
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredExecutions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                      {executions.length === 0
                        ? 'No executions found for this time range'
                        : 'No executions match your search criteria'
                      }
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedExecutions.map((item) => {
                    if (isExecutionGroup(item)) {
                      const isExpanded = expandedGroups.has(item.id)
                      const StatusIcon = statusIcons[item.status]
                      const provider = providers.find(p => p.id === item.providerId)
                      const workflowName = (typeof item.executions[0].metadata?.workflowName === 'string' ? item.executions[0].metadata.workflowName : null) ||
                        DEMO_WORKFLOWS.find(w => w.id === item.workflowId)?.name ||
                        item.workflowId

                      return (
                        <>
                          <TableRow
                            key={item.id}
                            className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer bg-gray-50/50 dark:bg-slate-800/50"
                            onClick={(e) => toggleGroup(item.id, e)}
                          >
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <button
                                  className="p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded"
                                >
                                  {isExpanded ? (
                                    <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                                  ) : (
                                    <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                                  )}
                                </button>
                                <Badge color={statusColors[item.status]} className="flex items-center space-x-1">
                                  <StatusIcon className="h-3 w-3" />
                                  <span className="capitalize">{item.status}</span>
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm text-gray-500">
                              <div className="flex items-center space-x-2">
                                <ListBulletIcon className="h-4 w-4" />
                                <span>{item.executions.length} runs</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {provider ? (
                                <Badge color="zinc" className="text-xs">
                                  {provider.name}
                                </Badge>
                              ) : (
                                <span className="text-xs text-gray-400">Unknown</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {workflowName}
                                </span>
                                <span className="text-xs text-gray-500 font-mono">
                                  {item.executions[0].providerWorkflowId}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-xs text-gray-500">
                                <div>Last: {formatDate(item.executions[0].startedAt)}</div>
                                <div>First: {formatDate(item.executions[item.executions.length - 1].startedAt)}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              ~{formatDuration(item.avgDuration)}
                            </TableCell>
                            <TableCell>
                              <Badge color={modeColors[item.mode] || 'zinc'} className="capitalize">
                                {item.mode}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {item.totalTokens > 0 ? (
                                <div className="text-sm font-medium">
                                  {item.totalTokens.toLocaleString()}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.totalCost > 0 ? (
                                <div className="text-sm font-medium">
                                  <AICostTooltip
                                    type="cell"
                                    cost={item.totalCost}
                                    inputTokens={item.executions.reduce((acc, curr) => acc + (curr.inputTokens || 0), 0)}
                                    outputTokens={item.executions.reduce((acc, curr) => acc + (curr.outputTokens || 0), 0)}
                                    model="Mixed (Group)"
                                  />
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-gray-400">–</span>
                            </TableCell>
                          </TableRow>
                          {isExpanded && item.executions.map((execution, idx) => {
                            const ExStatusIcon = statusIcons[execution.status]
                            return (
                              <TableRow
                                key={execution.id}
                                className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer bg-gray-50/30 dark:bg-slate-800/30"
                                onClick={() => viewExecutionDetails(execution.id)}
                              >
                                <TableCell>
                                  <div className="pl-8">
                                    <Badge color={statusColors[execution.status]} className="flex items-center space-x-1 scale-90 origin-left">
                                      <ExStatusIcon className="h-3 w-3" />
                                    </Badge>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs text-gray-500">
                                  {formatExecutionId(execution.providerExecutionId)}
                                </TableCell>
                                <TableCell></TableCell>
                                <TableCell></TableCell>
                                <TableCell className="text-xs">
                                  {formatDate(execution.startedAt)}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {formatDuration(execution.duration)}
                                </TableCell>
                                <TableCell></TableCell>
                                <TableCell>
                                  {execution.totalTokens && execution.totalTokens > 0 ? (
                                    <span className="text-xs text-gray-500">{execution.totalTokens.toLocaleString()}</span>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  {execution.aiCost && execution.aiCost > 0 ? (
                                    <AICostTooltip
                                      type="cell"
                                      cost={execution.aiCost}
                                      inputTokens={execution.inputTokens}
                                      outputTokens={execution.outputTokens}
                                      model={execution.aiModel}
                                    />
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    outline
                                    className="text-xs px-2 py-0.5"
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation()
                                      openN8nExecution(execution)
                                    }}
                                  >
                                    Open in n8n
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </>
                      )
                    }

                    // Regular execution row
                    const execution = item as Execution
                    const StatusIcon = statusIcons[execution.status]
                    const provider = providers.find(p => p.id === execution.providerId)
                    return (
                      <TableRow
                        key={execution.id}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                        onClick={() => viewExecutionDetails(execution.id)}
                      >
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <div className="w-6" />
                            <Badge color={statusColors[execution.status]} className="flex items-center space-x-1">
                              <StatusIcon className="h-3 w-3" />
                              <span className="capitalize">{execution.status}</span>
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {formatExecutionId(execution.providerExecutionId)}
                        </TableCell>
                        <TableCell>
                          {provider ? (
                            <Badge color="zinc" className="text-xs">
                              {provider.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-gray-400">Unknown</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {(typeof execution.metadata?.workflowName === 'string' ? execution.metadata.workflowName : null) ||
                                DEMO_WORKFLOWS.find(w => w.id === execution.workflowId)?.name ||
                                execution.workflowId}
                            </span>
                            <span className="text-xs text-gray-500 font-mono">
                              {execution.providerWorkflowId}
                            </span>
                            {execution.error && (
                              <span className="text-sm text-red-600 truncate max-w-xs">
                                {execution.error.message}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDate(execution.startedAt)}
                        </TableCell>
                        <TableCell>
                          {formatDuration(execution.duration)}
                        </TableCell>
                        <TableCell>
                          <Badge color={modeColors[execution.mode] || 'zinc'} className="capitalize">
                            {(execution.metadata as any)?.firstNode?.name || execution.mode}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {execution.totalTokens && execution.totalTokens > 0 ? (
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {execution.totalTokens.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {execution.aiCost && execution.aiCost > 0 ? (
                            <div className="text-sm">
                              <div className="font-medium text-gray-900 dark:text-white">
                                ${execution.aiCost.toFixed(4)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            outline
                            className="text-sm px-2 py-1"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation()
                              openN8nExecution(execution)
                            }}
                          >
                            Open in n8n
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalCount > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={(page) => fetchExecutions(page)}
              />
            )}
          </div>
        </div>


      </div>
      <PricingSidePanel
        isOpen={showPricing}
        onClose={() => setShowPricing(false)}
      />
    </div>
  )
}

export default function ExecutionsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-rose-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <AppLayout>
      <WithN8NConnection>
        <ExecutionsContent />
      </WithN8NConnection>
    </AppLayout>
  )
}