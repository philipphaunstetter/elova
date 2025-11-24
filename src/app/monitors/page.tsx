'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import { WithN8NConnection } from '@/components/with-n8n-connection'
import { 
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  EyeIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
  SignalIcon
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'

// Mock data for monitors until we implement the backend
const mockMonitors = [
  {
    id: '1',
    name: 'n8n Instance',
    url: 'https://n8n.srv1041535.hstgr.cloud',
    method: 'GET',
    status: 'healthy',
    lastCheck: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
    responseTime: 245,
    uptime: 99.8,
    interval: 5, // minutes
    isEnabled: true
  },
  {
    id: '2', 
    name: 'n8n API Health',
    url: 'https://n8n.srv1041535.hstgr.cloud/healthz',
    method: 'GET',
    status: 'healthy',
    lastCheck: new Date(Date.now() - 1 * 60 * 1000), // 1 minute ago
    responseTime: 89,
    uptime: 100,
    interval: 1, // minutes
    isEnabled: true
  },
  {
    id: '3',
    name: 'Webhook Endpoint',
    url: 'https://n8n.srv1041535.hstgr.cloud/webhook/test',
    method: 'POST',
    status: 'down',
    lastCheck: new Date(Date.now() - 30 * 1000), // 30 seconds ago
    responseTime: null,
    uptime: 87.5,
    interval: 1, // minutes
    isEnabled: true
  },
  {
    id: '4',
    name: 'Database Connection',
    url: 'Internal Check',
    method: 'GET',
    status: 'warning',
    lastCheck: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    responseTime: 1200,
    uptime: 98.2,
    interval: 5, // minutes
    isEnabled: false
  }
]

function MonitorsContent() {
  const [monitors] = useState(mockMonitors)
  const [loading, setLoading] = useState(false)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return CheckCircleIcon
      case 'down':
        return XCircleIcon
      case 'warning':
        return ExclamationTriangleIcon
      default:
        return ClockIcon
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'green'
      case 'down':
        return 'red'
      case 'warning':
        return 'yellow'
      default:
        return 'zinc'
    }
  }

  const formatLastCheck = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffSecs = Math.floor(diffMs / 1000)
    
    if (diffMins > 0) {
      return `${diffMins}m ago`
    } else {
      return `${diffSecs}s ago`
    }
  }

  const refreshMonitors = async () => {
    setLoading(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    setLoading(false)
  }

  const healthyCount = monitors.filter(m => m.status === 'healthy' && m.isEnabled).length
  const downCount = monitors.filter(m => m.status === 'down' && m.isEnabled).length
  const warningCount = monitors.filter(m => m.status === 'warning' && m.isEnabled).length
  const totalEnabled = monitors.filter(m => m.isEnabled).length

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monitors</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            Monitor your n8n instance and critical endpoints for availability and performance
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button 
            outline
            onClick={refreshMonitors}
            disabled={loading}
          >
            <ArrowPathIcon className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Monitor
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Healthy</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{healthyCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <XCircleIcon className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Down</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{downCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Warning</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{warningCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <SignalIcon className="h-6 w-6 text-rose-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Active</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{totalEnabled}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monitors List */}
      <div className="bg-white dark:bg-slate-800 shadow border border-gray-200 dark:border-slate-300 overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">All Monitors</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Endpoint monitoring and uptime tracking for your critical services
          </p>
        </div>
        
        <ul className="divide-y divide-gray-200">
          {monitors.map((monitor) => {
            const StatusIcon = getStatusIcon(monitor.status)
            const statusColor = getStatusColor(monitor.status)
            
            return (
              <li key={monitor.id} className="px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <StatusIcon className={`h-6 w-6 ${
                        monitor.status === 'healthy' ? 'text-green-500' :
                        monitor.status === 'down' ? 'text-red-500' :
                        monitor.status === 'warning' ? 'text-yellow-500' :
                        'text-gray-400'
                      }`} />
                    </div>
                    <div className="ml-4 min-w-0 flex-1">
                      <div className="flex items-center space-x-3">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {monitor.name}
                        </p>
                        <Badge color={statusColor} className="capitalize">
                          {monitor.status}
                        </Badge>
                        {!monitor.isEnabled && (
                          <Badge color="zinc">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                        <span>{monitor.method} {monitor.url}</span>
                        <span>•</span>
                        <span>Every {monitor.interval}m</span>
                        <span>•</span>
                        <span>{monitor.uptime}% uptime</span>
                        {monitor.responseTime && (
                          <>
                            <span>•</span>
                            <span>{monitor.responseTime}ms</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Last checked: {formatLastCheck(monitor.lastCheck)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button outline>
                      <EyeIcon className="h-4 w-4 mr-1" />
                      View
                    </Button>
                    <Button outline>
                      <Cog6ToothIcon className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <SignalIcon className="h-5 w-5 text-rose-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Monitor Configuration
            </h3>
            <div className="mt-2 text-sm text-rose-700">
              <p>
                Monitors help you track the availability and performance of your n8n instance and critical endpoints. 
                Configure alerts to get notified when issues are detected.
              </p>
            </div>
            <div className="mt-4">
              <div className="-mx-2 -my-1.5 flex">
                <Button outline className="bg-white text-rose-700 border-blue-300 hover:bg-blue-50">
                  Learn more about monitoring
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MonitorsPage() {
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-rose-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <AppLayout>
      <WithN8NConnection>
        <MonitorsContent />
      </WithN8NConnection>
    </AppLayout>
  )
}