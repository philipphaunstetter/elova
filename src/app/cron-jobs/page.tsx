'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import { WithN8NConnection } from '@/components/with-n8n-connection'
import { apiClient } from '@/lib/api-client'
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline'
import { Provider } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Listbox, ListboxOption, ListboxLabel } from '@/components/listbox'
import { showToast } from '@/components/toast'
import cronstrue from 'cronstrue'
import { TablePagination } from '@/components/TablePagination'

interface CronJob {
  id: string
  workflowId: string
  workflowName: string
  providerId: string
  providerName: string
  isActive: boolean
  isArchived: boolean
  cronSchedules: Array<{
    nodeName: string
    nodeType: string
    cronExpression: string
  }>
  updatedAt: string
}

function CronJobsContent() {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'archived'>('active')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const itemsPerPage = 20
  const router = useRouter()

  useEffect(() => {
    fetchProviders()
  }, [])

  const fetchProviders = async () => {
    try {
      const response = await apiClient.get<{ data: Provider[] }>('/providers')
      setProviders(response.data)
    } catch (error) {
      console.error('Failed to fetch providers:', error)
    }
  }

  const fetchCronJobs = useCallback(async (page = 1) => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append('page', page.toString())
      params.append('limit', itemsPerPage.toString())

      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      if (providerFilter !== 'all') {
        params.append('providerId', providerFilter)
      }

      const response = await apiClient.get<{ data: { items: CronJob[], total: number, page: number, totalPages: number } }>(`/cron-jobs?${params}`)
      setCronJobs(response.data.items)
      setTotalCount(response.data.total)
      setTotalPages(response.data.totalPages)
      setCurrentPage(page)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch cron jobs:', err)
      setError('Failed to load cron jobs')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, providerFilter, itemsPerPage])

  useEffect(() => {
    setCurrentPage(1)
    fetchCronJobs(1)
  }, [statusFilter, providerFilter])

  useEffect(() => {
    fetchCronJobs(currentPage)
  }, [currentPage])

  const syncWorkflows = async () => {
    try {
      setSyncing(true)
      await apiClient.post('/sync/workflows')
      await fetchCronJobs()
      setError(null)

      showToast({
        type: 'success',
        title: 'Workflows synced successfully',
        message: 'Cron schedules have been updated'
      })
    } catch (err) {
      console.error('Failed to sync workflows:', err)
      const errorMessage = 'Failed to sync workflows. Please try again.'
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

  const formatDate = (date: string | undefined | null) => {
    if (!date) return 'Never'
    try {
      const dateObj = new Date(date)
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(dateObj)
    } catch (error) {
      console.error('Failed to format date:', date, error)
      return 'Invalid date'
    }
  }

  const formatCronExpression = (expression: string) => {
    // If it's already human-readable (e.g., "Every 12 hours"), return as-is
    if (expression.toLowerCase().startsWith('every')) {
      return expression
    }

    // Try to parse as cron expression
    try {
      return cronstrue.toString(expression, { verbose: true })
    } catch (error) {
      // If parsing fails, return the original expression
      return expression
    }
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white dark:text-white">Error loading cron jobs</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{error}</p>
        <Button onClick={() => fetchCronJobs(currentPage)} className="mt-4">
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white dark:text-white">Cron Jobs</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            View all scheduled cron jobs from your workflows
          </p>
        </div>
        <div className="flex space-x-3">
          <Button
            outline
            onClick={syncWorkflows}
            disabled={syncing || loading}
            className="flex items-center space-x-2"
          >
            <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync'}</span>
          </Button>
          <Button onClick={() => fetchCronJobs(currentPage)} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="provider" className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-slate-300 mb-1">
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
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-slate-300 dark:text-slate-300 mb-1">
            Workflow Status
          </label>
          <Listbox
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as 'all' | 'active' | 'inactive' | 'archived')}
          >
            <ListboxOption value="all"><ListboxLabel>All workflows</ListboxLabel></ListboxOption>
            <ListboxOption value="active"><ListboxLabel>Active only</ListboxLabel></ListboxOption>
            <ListboxOption value="inactive"><ListboxLabel>Inactive only</ListboxLabel></ListboxOption>
            <ListboxOption value="archived"><ListboxLabel>Archived only</ListboxLabel></ListboxOption>
          </Listbox>
        </div>
      </div>

      {/* Results Summary */}
      <div className="bg-white dark:bg-slate-800 px-4 py-3 border border-gray-200 dark:border-slate-300 rounded-md">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-slate-400">
          <span>
            Showing {cronJobs.length} workflow{cronJobs.length !== 1 ? 's' : ''} with cron schedules
          </span>
          <span>
            {cronJobs.filter(w => w.isActive).length} active, {cronJobs.filter(w => !w.isActive && !w.isArchived).length} inactive, {cronJobs.filter(w => w.isArchived).length} archived
          </span>
        </div>
      </div>

      {/* Cron Jobs Table */}
      <div className="bg-white dark:bg-slate-800 shadow overflow-hidden sm:rounded-md ring-1 ring-zinc-950/5 dark:ring-white/10">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Status</TableHeader>
              <TableHeader>Instance</TableHeader>
              <TableHeader>Workflow Name</TableHeader>
              <TableHeader>Cron Schedules</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              // Loading rows
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
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
            ) : cronJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                  No workflows with cron schedules found
                </TableCell>
              </TableRow>
            ) : (
              cronJobs.map((job) => {
                const provider = providers.find(p => p.id === job.providerId)
                return (
                  <TableRow
                    key={job.id}
                    className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                    onClick={() => router.push(`/workflows/${job.workflowId}`)}
                  >
                    <TableCell>
                      <Badge
                        color={job.isActive ? 'green' : job.isArchived ? 'orange' : 'zinc'}
                        className="flex items-center space-x-1"
                      >
                        {job.isActive ? (
                          <CheckCircleIcon className="h-3 w-3" />
                        ) : job.isArchived ? (
                          <ArchiveBoxIcon className="h-3 w-3" />
                        ) : (
                          <ClockIcon className="h-3 w-3" />
                        )}
                        <span>
                          {job.isActive ? 'Active' : job.isArchived ? 'Archived' : 'Inactive'}
                        </span>
                      </Badge>
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
                        <span
                          className="font-medium text-gray-900 dark:text-white truncate max-w-xs"
                          title={job.workflowName}
                        >
                          {job.workflowName}
                        </span>
                        <span className="text-xs text-gray-500 font-mono truncate max-w-xs" title={job.workflowId}>
                          {job.workflowId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        {job.cronSchedules.map((schedule, index) => (
                          <div key={index} className="text-sm text-gray-900 dark:text-white">
                            {formatCronExpression(schedule.cronExpression)}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalCount > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            onPageChange={(page) => setCurrentPage(page)}
          />
        )}
      </div>
    </div>
  )
}

export default function CronJobsPage() {
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
        <CronJobsContent />
      </WithN8NConnection>
    </AppLayout>
  )
}
