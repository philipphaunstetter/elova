'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import { TimeRange } from '@/types'
import { apiClient } from '@/lib/api-client'
import { ChartDataPoint } from '@/app/api/dashboard/charts/route'
import { 
  CalendarDaysIcon, 
  ClockIcon, 
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'

interface ChartResponse {
  success: boolean
  data: ChartDataPoint[]
  timeRange: TimeRange
  count: number
}

interface ExecutionChartsProps {
  timeRange: TimeRange
  onTimeRangeChange: (range: TimeRange) => void
}

// Time range options
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' }
]

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ChartDataPoint
    const date = new Date(data.timestamp)
    
    return (
      <div className="bg-white dark:bg-slate-800 p-4 shadow-lg rounded-lg border border-gray-200 dark:border-slate-300">
        <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
          {date.toLocaleDateString()} {date.toLocaleTimeString()}
        </p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              <span className="font-medium">{entry.name}:</span> {entry.value}
              {entry.name.includes('Time') && 'ms'}
              {entry.name.includes('Rate') && '%'}
            </p>
          ))}
        </div>
      </div>
    )
  }
  return null
}

// Format X-axis labels based on time range
const formatXAxisLabel = (timestamp: number, timeRange: TimeRange) => {
  const date = new Date(timestamp)
  
  if (timeRange === '1h' || timeRange === '24h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (timeRange === '7d' || timeRange === '30d') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

export function ExecutionCharts({ timeRange, onTimeRangeChange }: ExecutionChartsProps) {
  const { theme } = useTheme()
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Theme-aware colors
  const gridColor = theme === 'dark' ? '#3f3f46' : '#f3f4f6'
  const axisColor = theme === 'dark' ? '#a1a1aa' : '#6b7280'
  const textColor = theme === 'dark' ? '#e4e4e7' : '#374151'

  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setLoading(true)
        const response = await apiClient.get<ChartResponse>(`/dashboard/charts?timeRange=${timeRange}`)
        setChartData(response.data)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch chart data:', err)
        setError('Failed to load chart data')
        setChartData([])
      } finally {
        setLoading(false)
      }
    }

    fetchChartData()
  }, [timeRange])

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
        <div className="text-center">
          <XCircleIcon className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Error loading charts</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
            <CalendarDaysIcon className="h-5 w-5 mr-2 text-gray-400 dark:text-slate-400" />
            Execution Analytics
          </h3>
          <div className="flex space-x-2">
            {TIME_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => onTimeRangeChange(option.value)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  timeRange === option.value
                    ? 'bg-blue-100 text-rose-700 border border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
              <div className="h-64 bg-gray-200 dark:bg-slate-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Execution Volume Chart */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-green-500" />
              Execution Volume
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="failureGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis 
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
                  stroke={axisColor}
                  tick={{ fill: textColor }}
                />
                <YAxis stroke={axisColor} tick={{ fill: textColor }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="successfulExecutions"
                  stackId="1"
                  stroke="#10b981"
                  fill="url(#successGradient)"
                  name="Successful"
                />
                <Area
                  type="monotone"
                  dataKey="failedExecutions"
                  stackId="1"
                  stroke="#ef4444"
                  fill="url(#failureGradient)"
                  name="Failed"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Success Rate Chart */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-rose-500" />
              Success Rate
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis 
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
                  stroke={axisColor} tick={{ fill: textColor }}
                />
                <YAxis 
                  domain={[0, 100]}
                  stroke={axisColor} tick={{ fill: textColor }}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={90} stroke="#10b981" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                  name="Success Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Response Time Chart */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <ClockIcon className="h-5 w-5 mr-2 text-purple-500" />
              Average Response Time
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis 
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
                  stroke={axisColor} tick={{ fill: textColor }}
                />
                <YAxis 
                  stroke={axisColor} tick={{ fill: textColor }}
                  tickFormatter={(value) => `${value}ms`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="avgResponseTime"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                  connectNulls={false}
                  name="Avg Response Time"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Execution Distribution Chart */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow">
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-orange-500" />
              Execution Distribution
            </h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis 
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
                  stroke={axisColor} tick={{ fill: textColor }}
                />
                <YAxis stroke={axisColor} tick={{ fill: textColor }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar
                  dataKey="totalExecutions"
                  fill="#f59e0b"
                  name="Total Executions"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Chart Summary */}
      {!loading && chartData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-600">
            <p>
              Showing data for <span className="font-medium">{TIME_RANGE_OPTIONS.find(o => o.value === timeRange)?.label}</span>
              {' '}• {chartData.length} data points
              {' '}• Last updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}