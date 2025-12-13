'use client'

import { useTheme } from '@/contexts/ThemeContext'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { ChartDataPoint } from '@/app/api/dashboard/charts/route'
import { TimeRange } from '@/types'

interface StatusDistributionChartProps {
  data: ChartDataPoint[]
  timeRange: TimeRange
}

const formatXAxisLabel = (timestamp: number, timeRange: TimeRange) => {
  const date = new Date(timestamp)
  
  if (timeRange === '1h' || timeRange === '24h') {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const date = new Date(payload[0].payload.timestamp)
    
    return (
      <div className="bg-white dark:bg-slate-800 p-3 shadow-lg rounded-lg border border-gray-200 dark:border-slate-700 text-xs">
        <p className="font-medium text-gray-900 dark:text-white mb-2">
          {date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between min-w-[120px]">
              <div className="flex items-center">
                <div 
                  className="w-2 h-2 rounded-full mr-2" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600 dark:text-slate-400 capitalize">{entry.name}:</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-white ml-2">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export function StatusDistributionChart({ data, timeRange }: StatusDistributionChartProps) {
  const { theme } = useTheme()
  
  const gridColor = theme === 'dark' ? '#3f3f46' : '#f3f4f6'
  const textColor = theme === 'dark' ? '#94a3b8' : '#64748b'

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">
        No data available
      </div>
    )
  }

  // Add index to each data point for categorical scale
  const indexedData = data.map((point, index) => ({
    ...point,
    index
  }))
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart 
        data={indexedData} 
        margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="index"
          type="category"
          tickFormatter={(index) => formatXAxisLabel(data[index].timestamp, timeRange)}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: textColor }}
          dy={10}
          minTickGap={30}
          padding={{ left: 20, right: 20 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: textColor }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9', opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
        <Bar 
          dataKey="successfulExecutions" 
          name="Success" 
          stackId="a" 
          fill="#10b981" 
          radius={[0, 0, 4, 4]}
        />
        <Bar 
          dataKey="failedExecutions" 
          name="Failed" 
          stackId="a" 
          fill="#ef4444" 
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
