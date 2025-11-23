'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import {
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { TimeRange } from '@/types'
import { apiClient } from '@/lib/api-client'
import { ChartDataPoint } from '@/app/api/dashboard/charts/route'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Label } from '@/components/fieldset'
import { Listbox, ListboxOption, ListboxLabel } from '@/components/listbox'

interface MetricsChartProps {
  timeRange: TimeRange
  onTimeRangeChange: (range: TimeRange) => void
}

interface ChartResponse {
  success: boolean
  data: ChartDataPoint[]
  timeRange: TimeRange
  count: number
}

// Time range options matching PlanetScale style
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' }
]

// Custom tooltip matching PlanetScale design
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ChartDataPoint
    const date = new Date(data.timestamp)
    
    return (
      <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200 text-xs">
        <p className="font-medium text-gray-900 dark:text-white mb-1">
          {date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center">
                <div 
                  className="w-2 h-2 rounded-full mr-2" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600">{entry.name}:</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-white ml-2">
                {entry.value}
                {entry.name.includes('Time') && ' ms'}
                {entry.name.includes('Rate') && '%'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

// Format X-axis labels
const formatXAxisLabel = (timestamp: number, timeRange: TimeRange) => {
  const date = new Date(timestamp)
  
  if (timeRange === '1h') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } else if (timeRange === '24h') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } else if (timeRange === '7d') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

export function MetricsChart({ timeRange, onTimeRangeChange }: MetricsChartProps) {
  const { theme } = useTheme()
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showEvents, setShowEvents] = useState(true)
  
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
      <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-300 rounded-lg p-6">
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  // Stats for the header
  const totalExecutions = chartData.reduce((sum, d) => sum + d.totalExecutions, 0)
  const avgSuccessRate = chartData.length > 0 
    ? Math.round(chartData.reduce((sum, d) => sum + d.successRate, 0) / chartData.length) 
    : 0

  return (
    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-300 rounded-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-300">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Execution Metrics</h3>
            <div className="flex items-center mt-1 space-x-4 text-sm text-gray-600">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-1" />
                <span>Total: {totalExecutions}</span>
              </div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-blue-500 rounded-full mr-1" />
                <span>Success Rate: {avgSuccessRate}%</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* Time Range Selector */}
            <div className="w-40">
              <Listbox
                value={timeRange}
                onChange={(value) => onTimeRangeChange(value as TimeRange)}
              >
                {TIME_RANGE_OPTIONS.map((option) => (
                  <ListboxOption key={option.value} value={option.value}>
                    <ListboxLabel>{option.label}</ListboxLabel>
                  </ListboxOption>
                ))}
              </Listbox>
            </div>
            
            {/* Show Events Toggle */}
            <CheckboxField>
              <Checkbox
                checked={showEvents}
                onChange={setShowEvents}
              />
              <Label>Show events</Label>
            </CheckboxField>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-6">
        {loading ? (
          <div className="h-80 flex items-center justify-center">
            <div className="animate-pulse text-sm text-gray-500 dark:text-slate-400">Loading metrics...</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-slate-400">No execution data available</p>
              <p className="text-xs text-gray-400 mt-1">Execute some workflows to see metrics</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                {/* Gradients similar to PlanetScale */}
                <linearGradient id="executionsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="responseTimeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              
              {/* Grid */}
              <CartesianGrid strokeDasharray="1 1" stroke={gridColor} vertical={false} />
              
              {/* X Axis */}
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: textColor }}
                dy={10}
              />
              
              {/* Y Axis */}
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: textColor }}
                width={40}
              />
              
              {/* Tooltip */}
              <Tooltip content={<CustomTooltip />} />
              
              {/* Areas */}
              {showEvents && (
                <Area
                  type="monotone"
                  dataKey="totalExecutions"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#executionsGradient)"
                  name="Total Executions"
                />
              )}
              
              {/* Success rate line */}
              <Line
                type="monotone"
                dataKey="successRate"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Success Rate"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-slate-300 bg-gray-50 dark:bg-slate-800 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <span>
            {chartData.length > 0 
              ? `${chartData.length} data points • Last updated: ${new Date().toLocaleTimeString()}`
              : 'No data available'
            }
          </span>
          <button className="text-blue-600 hover:text-blue-700">
            Drag-select to zoom in
          </button>
        </div>
      </div>
    </div>
  )
}