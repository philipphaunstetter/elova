'use client'

import { useTheme } from '@/contexts/ThemeContext'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { ChartDataPoint } from '@/app/api/dashboard/charts/route'
import { TimeRange } from '@/types'

interface CostChartProps {
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
                {entry.name === 'AI Cost' ? `$${Number(entry.value).toFixed(4)}` : entry.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export function CostChart({ data, timeRange }: CostChartProps) {
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

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: textColor }}
          dy={10}
          minTickGap={30}
        />
        <YAxis
          yAxisId="left"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: textColor }}
          tickFormatter={(val) => `$${val}`}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: textColor }}
          tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9', opacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
        <Bar 
          yAxisId="left"
          dataKey="aiCost" 
          name="AI Cost" 
          fill="#8b5cf6" 
          radius={[4, 4, 0, 0]} 
          barSize={20}
        />
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="totalTokens" 
          name="Tokens" 
          stroke="#fbbf24" 
          strokeWidth={2} 
          dot={false} 
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}