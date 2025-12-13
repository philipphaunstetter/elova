'use client'

import { useState, useMemo } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { TimeRange } from '@/types'
import { ChartDataPoint, ProviderChartData } from '@/app/api/dashboard/charts/route'
import { Switch, SwitchField } from '@/components/switch'
import { Label } from '@/components/fieldset'
import { getTimeDomain } from '@/lib/chart-utils'

interface VolumeChartProps {
  data: ChartDataPoint[]
  byProvider?: ProviderChartData[]
  providers?: Array<{ id: string; name: string; color: string }>
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
    // Get the timestamp from the first payload item
    const firstPayload = payload[0]?.payload
    const timestamp = firstPayload?.timestamp
    const date = timestamp ? new Date(timestamp) : new Date()
    
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
            <div key={index} className="flex items-center justify-between min-w-[140px]">
              <div className="flex items-center">
                <div 
                  className="w-2 h-2 rounded-full mr-2" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600 dark:text-slate-400">{entry.name}:</span>
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

export function VolumeChart({ data, byProvider, providers, timeRange }: VolumeChartProps) {
  const { theme } = useTheme()
  const [combineInstances, setCombineInstances] = useState(true)
  
  const gridColor = theme === 'dark' ? '#3f3f46' : '#f3f4f6'
  const textColor = theme === 'dark' ? '#94a3b8' : '#64748b'
  
  // Calculate the time domain based on selected time range
  const timeDomain = getTimeDomain(timeRange)
  
  // Check if we have multiple providers
  const hasMultipleProviders = (providers?.length ?? 0) > 1
  
  // Merge all provider data into a single dataset for the multi-line chart
  // Each data point will have a timestamp and execution count per provider
  const mergedProviderData = useMemo(() => {
    if (!byProvider || byProvider.length === 0) return []
    
    // Collect all unique timestamps
    const timestampMap = new Map<number, Record<string, number>>()
    
    for (const provider of byProvider) {
      for (const point of provider.data) {
        if (!timestampMap.has(point.timestamp)) {
          timestampMap.set(point.timestamp, { timestamp: point.timestamp })
        }
        const entry = timestampMap.get(point.timestamp)!
        entry[provider.providerId] = point.totalExecutions
      }
    }
    
    // Sort by timestamp
    return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp)
  }, [byProvider])

  if (data.length === 0 && mergedProviderData.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">
        No data available
      </div>
    )
  }

  // Show combined view (single area) or per-provider view (multiple lines)
  const showCombined = combineInstances || !hasMultipleProviders

  return (
    <div className="space-y-4">
      {/* Toggle for multiple providers */}
      {hasMultipleProviders && (
        <div className="flex items-center justify-end">
          <SwitchField>
            <Label className="text-xs text-gray-500 dark:text-slate-400 mr-3">Combine instances</Label>
            <Switch
              checked={combineInstances}
              onChange={setCombineInstances}
              color="blue"
            />
          </SwitchField>
        </div>
      )}
      
      <ResponsiveContainer width="100%" height={hasMultipleProviders ? 290 : 320}>
        {showCombined ? (
          // Combined view - single stacked area
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
              domain={timeDomain}
              tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: textColor }}
              dy={10}
              minTickGap={30}
            />
            
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: textColor }}
            />
            
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: theme === 'dark' ? '#334155' : '#cbd5e1', strokeWidth: 1 }} />
            
            <Area
              type="monotone"
              dataKey="totalExecutions"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#executionsGradient)"
              name="Total Executions"
              animationDuration={1000}
            />
          </AreaChart>
        ) : (
          // Per-provider view - multiple lines
          <LineChart data={mergedProviderData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={timeDomain}
              tickFormatter={(timestamp) => formatXAxisLabel(timestamp, timeRange)}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: textColor }}
              dy={10}
              minTickGap={30}
            />
            
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: textColor }}
            />
            
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: theme === 'dark' ? '#334155' : '#cbd5e1', strokeWidth: 1 }} />
            
            <Legend 
              iconType="circle" 
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            />
            
            {providers?.map((provider) => (
              <Line
                key={provider.id}
                type="monotone"
                dataKey={provider.id}
                stroke={provider.color}
                strokeWidth={2}
                dot={{ fill: provider.color, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, strokeWidth: 0 }}
                name={provider.name}
                animationDuration={1000}
                connectNulls
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
