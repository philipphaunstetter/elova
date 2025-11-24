'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import { WithN8NConnection } from '@/components/with-n8n-connection'
import { VolumeChart } from '@/components/charts/volume-chart'
import { StatusDistributionChart } from '@/components/charts/status-distribution-chart'
import { CostChart } from '@/components/charts/cost-chart'
import { apiClient } from '@/lib/api-client'
import { DashboardStats, TimeRange } from '@/types'
import { ChartDataPoint } from '@/app/api/dashboard/charts/route'
import { Skeleton } from '@/components/skeleton'
import { Badge } from '@/components/badge'
import { Listbox, ListboxOption, ListboxLabel } from '@/components/listbox'
import { 
  PlayIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline'

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

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' }
]

function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [statsRes, chartsRes] = await Promise.all([
          apiClient.get<{ data: DashboardStats }>(`/dashboard/stats?timeRange=${timeRange}`),
          apiClient.get<{ data: ChartDataPoint[] }>(`/dashboard/charts?timeRange=${timeRange}`)
        ])
        
        setStats(statsRes.data)
        setChartData(chartsRes.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [timeRange])

  const statsDisplay = [
    { 
      name: 'Success Rate', 
      value: loading ? '...' : `${stats?.successRate ?? 0}%`,
      icon: CheckCircleIcon, 
      changeType: 'positive' as const
    },
    { 
      name: 'Total Executions', 
      value: loading ? '...' : (stats?.totalExecutions ?? '0').toLocaleString(),
      icon: PlayIcon, 
      changeType: 'neutral' as const
    },
    { 
      name: 'AI Cost', 
      value: loading ? '...' : `$${(stats?.totalCost ?? 0).toFixed(2)}`,
      icon: BanknotesIcon, 
      changeType: 'neutral' as const,
      subtext: TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label || timeRange
    },
    { 
      name: 'Failed Executions', 
      value: loading ? '...' : (stats?.failedExecutions ?? '0').toLocaleString(),
      icon: XCircleIcon, 
      changeType: (stats?.failedExecutions ?? 0) > 0 ? 'negative' as const : 'neutral' as const
    },
  ]


  if (error) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Error loading dashboard</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Operations Center</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Monitor workflow performance and costs
          </p>
        </div>
        <div className="w-40">
          <Listbox
            value={timeRange}
            onChange={(value) => setTimeRange(value as TimeRange)}
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <ListboxOption key={option.value} value={option.value}>
                <ListboxLabel>{option.label}</ListboxLabel>
              </ListboxOption>
            ))}
          </Listbox>
        </div>
      </div>

      {/* Row 1: Recent Activity & Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Activity */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Activity</h3>
          <div className="flex-1">
            {loading ? (
              <div className="space-y-4">
                 {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                 ))}
              </div>
            ) : (
              <div className="flow-root">
                <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                  {stats?.recentActivity?.map((execution) => {
                    const StatusIcon = statusIcons[execution.status] || ClockIcon
                    return (
                    <li key={execution.executionId} className="py-3">
                      <div className="flex items-center space-x-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                            {execution.workflowName}
                          </p>
                          <div className="mt-1 flex items-center space-x-2">
                            <Badge color={statusColors[execution.status] || 'zinc'} className="flex items-center space-x-1">
                                <StatusIcon className="h-3 w-3" />
                                <span className="capitalize">{execution.status}</span>
                            </Badge>
                            <span className="text-xs text-gray-500 dark:text-slate-400">&bull; {new Date(execution.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div>
                          <a
                            href={`/executions/${execution.executionId}`}
                            className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-slate-700 dark:text-white dark:ring-slate-600 dark:hover:bg-slate-600"
                          >
                            View
                          </a>
                        </div>
                      </div>
                    </li>
                    )
                  })}
                   {(!stats?.recentActivity || stats.recentActivity.length === 0) && (
                    <li className="py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                       No recent activity found
                    </li>
                   )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right: Volume Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Execution Volume</h3>
          {loading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <VolumeChart data={chartData} timeRange={timeRange} />
          )}
        </div>
      </div>

      {/* Row 2: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsDisplay.map((item) => (
          <div key={item.name} className="bg-white dark:bg-slate-800 px-6 py-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
            <dt className="text-sm font-medium text-gray-500 dark:text-slate-400 truncate flex items-center mb-2">
              <item.icon className={`h-5 w-5 mr-2 ${
                loading ? 'text-gray-300 dark:text-slate-600' :
                item.changeType === 'positive' ? 'text-green-500' : 
                item.changeType === 'negative' ? 'text-red-500' : 
                'text-gray-400'
              }`} />
              {item.name}
            </dt>
            <dd className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-baseline gap-2">
              {loading ? <Skeleton className="h-9 w-24" /> : item.value}
              {item.subtext && !loading && (
                 <span className="text-xs font-normal text-gray-500 dark:text-slate-400">
                   {item.subtext}
                 </span>
              )}
            </dd>
          </div>
        ))}
      </div>

      {/* Row 3: Deep Dive Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Status Distribution</h3>
          {loading ? <Skeleton className="h-[300px] w-full" /> : <StatusDistributionChart data={chartData} timeRange={timeRange} />}
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">AI Costs & Tokens</h3>
          {loading ? <Skeleton className="h-[300px] w-full" /> : <CostChart data={chartData} timeRange={timeRange} />}
        </div>
      </div>

    </div>
  )
}

export default function Dashboard() {
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <AppLayout>
      <WithN8NConnection>
        <DashboardContent />
      </WithN8NConnection>
    </AppLayout>
  )
}
