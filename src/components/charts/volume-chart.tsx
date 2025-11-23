'use client'

import { useState } from 'react'
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
import { ChartDataPoint } from '@/app/api/dashboard/charts/route'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Label } from '@/components/fieldset'

interface VolumeChartProps {
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

export function VolumeChart({ data, timeRange }: VolumeChartProps) {
  const { theme } = useTheme()
  const [showExecutions, setShowExecutions] = useState(true)
  
  const gridColor = theme === 'dark' ? '#3f3f46' : '#f3f4f6'
  const textColor = theme === 'dark' ? '#94a3b8' : '#64748b'

  if (data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">
        No data available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CheckboxField>
          <Checkbox
            checked={showExecutions}
            onChange={setShowExecutions}
          />
          <Label className="text-xs">Show volume</Label>
        </CheckboxField>
      </div>
      
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="executionsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          
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
          />
          
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: textColor }}
            tickFormatter={(val) => `${val}%`}
          />
          
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: theme === 'dark' ? '#334155' : '#cbd5e1', strokeWidth: 1 }} />
          
          {showExecutions && (
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="totalExecutions"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#executionsGradient)"
              name="Total Executions"
              animationDuration={1000}
            />
          )}
          
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="successRate"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="Success Rate"
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}