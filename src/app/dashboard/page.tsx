'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import { WithN8NConnection } from '@/components/with-n8n-connection'
import { VolumeChart } from '@/components/charts/volume-chart'
import { StatusDistributionChart } from '@/components/charts/status-distribution-chart'
import { CostChart } from '@/components/charts/cost-chart'
import { RecentExecutionsTable } from '@/components/recent-executions-table'
import { apiClient } from '@/lib/api-client'
import { DashboardStats, TimeRange } from '@/types'
import { ChartDataPoint } from '@/app/api/dashboard/charts/route'
import { Skeleton } from '@/components/skeleton'
import { Listbox, ListboxOption, ListboxLabel } from '@/components/listbox'
import { 
  PlayIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline'

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
      icon: CurrencyDollarIcon, 
      changeType: 'neutral' as const
    },
    { 
      name: 'Failed Executions', 
      value: loading ? '...' : (stats?.failedExecutions ?? '0').toLocaleString(),
      icon: XCircleIcon, 
      changeType: (stats?.failedExecutions ?? 0) > 0 ? 'negative' as const : 'neutral' as const
    },
  ]

  // Generate dynamic pulse text
  const renderPulseContent = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      )
    }
    
    const errors = stats?.failedExecutions ?? 0
    const successRate = stats?.successRate ?? 0
    
    const text = errors === 0
      ? `System is healthy. ${successRate}% success rate over the last ${timeRange}.`
      : `Attention needed. ${errors} failed executions recorded in the last ${timeRange}.`

    return (
      <p className="text-xl font-light text-gray-600 dark:text-slate-300 mb-6 leading-relaxed">
        {text}
      </p>
    )
  }

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

      {/* Row 1: Pulse & Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Pulse */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">System Pulse</h3>
          <div className="flex-1 flex flex-col justify-center">
            {renderPulseContent()}
            <div className="space-y-4">
              {loading ? (
                <Skeleton className="h-20 w-full" />
              ) : stats?.recentFailures && stats.recentFailures.length > 0 ? (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Recent Issues</h4>
                  <ul className="space-y-2">
                    {stats.recentFailures.slice(0, 2).map((fail, i) => (
                      <li key={i} className="text-xs text-red-700 dark:text-red-300 flex items-start">
                        <XCircleIcon className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                        <span className="truncate">{fail.workflowName}: {fail.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <div className="flex items-center text-green-800 dark:text-green-200">
                    <CheckCircleIcon className="h-5 w-5 mr-2" />
                    <span className="text-sm font-medium">All systems operational</span>
                  </div>
                </div>
              )}
            </div>
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
            <dd className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              {loading ? <Skeleton className="h-9 w-24" /> : item.value}
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

      {/* Row 4: Integrated History */}
      <div className="pt-4">
        <RecentExecutionsTable timeRange={timeRange} />
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
