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

/**
 * Generate all expected time bucket keys for a given time range
 * This ensures charts show complete time series even when there's no data
 */
export function generateTimeBuckets(
  timeRange: TimeRange,
  granularity: 'hour' | 'day' | 'week'
): Array<{ key: string; timestamp: number }> {
  const [startTime, endTime] = getTimeDomain(timeRange)
  const buckets: Array<{ key: string; timestamp: number }> = []
  
  let currentDate = new Date(startTime)
  const endDate = new Date(endTime)
  
  if (granularity === 'hour') {
    // Round to the start of the hour
    currentDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
      currentDate.getHours()
    )
    
    while (currentDate <= endDate) {
      buckets.push({
        key: currentDate.toISOString(),
        timestamp: currentDate.getTime()
      })
      currentDate = new Date(currentDate.getTime() + 60 * 60 * 1000) // Add 1 hour
    }
  } else if (granularity === 'day') {
    // Round to the start of the day
    currentDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    )
    
    while (currentDate <= endDate) {
      buckets.push({
        key: currentDate.toISOString().split('T')[0],
        timestamp: currentDate.getTime()
      })
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000) // Add 1 day
    }
  } else {
    // Week - round to the start of the week (Monday)
    const dayOfWeek = currentDate.getDay()
    const mondayDate = new Date(currentDate)
    mondayDate.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    currentDate = new Date(
      mondayDate.getFullYear(),
      mondayDate.getMonth(),
      mondayDate.getDate()
    )
    
    while (currentDate <= endDate) {
      buckets.push({
        key: currentDate.toISOString().split('T')[0],
        timestamp: currentDate.getTime()
      })
      currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000) // Add 1 week
    }
  }
  
  return buckets
}
