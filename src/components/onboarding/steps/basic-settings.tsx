'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Cog6ToothIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

interface BasicSettingsStepProps {
  initialData?: {
    timezone?: string
  }
  onNext: (data: { timezone: string }) => void
  onBack?: () => void
  loading?: boolean
}

// Common timezones for the dropdown
const TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (New York)' },
  { value: 'America/Chicago', label: 'Central Time (Chicago)' },
  { value: 'America/Denver', label: 'Mountain Time (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
  { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
  { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
  { value: 'Europe/London', label: 'GMT (London)' },
  { value: 'Europe/Paris', label: 'Central European Time (Paris)' },
  { value: 'Europe/Berlin', label: 'Central European Time (Berlin)' },
  { value: 'Europe/Rome', label: 'Central European Time (Rome)' },
  { value: 'Europe/Amsterdam', label: 'Central European Time (Amsterdam)' },
  { value: 'Europe/Zurich', label: 'Central European Time (Zurich)' },
  { value: 'Asia/Tokyo', label: 'Japan Time (Tokyo)' },
  { value: 'Asia/Shanghai', label: 'China Time (Shanghai)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong Time' },
  { value: 'Asia/Singapore', label: 'Singapore Time' },
  { value: 'Asia/Seoul', label: 'Korea Time (Seoul)' },
  { value: 'Asia/Kolkata', label: 'India Time (Kolkata)' },
  { value: 'Asia/Dubai', label: 'Gulf Time (Dubai)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (Sydney)' },
  { value: 'Australia/Melbourne', label: 'Australian Eastern Time (Melbourne)' },
  { value: 'Australia/Perth', label: 'Australian Western Time (Perth)' },
  { value: 'Pacific/Auckland', label: 'New Zealand Time (Auckland)' },
]

export function BasicSettingsStep({ initialData, onNext, onBack, loading }: BasicSettingsStepProps) {
  const [timezone, setTimezone] = useState(initialData?.timezone || 'UTC')

  // Auto-detect user timezone
  const detectTimezone = () => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const found = TIMEZONES.find(tz => tz.value === userTimezone)
    if (found) {
      setTimezone(userTimezone)
    }
  }

  const handleNext = () => {
    onNext({ timezone })
  }

  const canProceed = timezone.length > 0

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Cog6ToothIcon className="h-8 w-8 text-rose-600" />
          </div>
          <CardTitle className="text-2xl">Regional Settings</CardTitle>
          <CardDescription className="text-base">
            Configure your timezone for accurate timestamp display and data synchronization.
            This can be changed later in the admin settings.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Timezone */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                Timezone <span className="text-red-500">*</span>
              </Label>
              <Button
                type="button"
plain
                onClick={detectTimezone}
                className="text-xs"
              >
                Auto-detect
              </Button>
            </div>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger>
                <SelectValue placeholder="Select your timezone..." />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-gray-500">
              Used for displaying timestamps and scheduling data synchronization
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t">
            {onBack && (
              <Button plain onClick={onBack}>
                Back
              </Button>
            )}
            
            <div className="flex space-x-3 ml-auto">
              <Button
                onClick={handleNext}
                disabled={!canProceed || loading}
                className="min-w-32"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}