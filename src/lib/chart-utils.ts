import { TimeRange } from '@/types'

/**
 * Calculate the time domain (start and end timestamps) for a given time range
 * This ensures charts display the full requested time period, not just the range of existing data
 */
export function getTimeDomain(timeRange: TimeRange): [number, number] {
  const now = new Date()
  const endTime = now.getTime()
  let startTime: number
  
  switch (timeRange) {
    case '1h':
      startTime = endTime - 60 * 60 * 1000
      break
    case '24h':
      startTime = endTime - 24 * 60 * 60 * 1000
      break
    case '7d':
      startTime = endTime - 7 * 24 * 60 * 60 * 1000
      break
    case '30d':
      startTime = endTime - 30 * 24 * 60 * 60 * 1000
      break
    case '90d':
      startTime = endTime - 90 * 24 * 60 * 60 * 1000
      break
    case 'custom':
    default:
      // For custom or unknown ranges, fall back to 24h
      startTime = endTime - 24 * 60 * 60 * 1000
  }
  
  return [startTime, endTime]
}
