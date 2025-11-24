'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import { WithN8NConnection } from '@/components/with-n8n-connection'
import { apiClient } from '@/lib/api-client'
import { N8nDemoWorkflow } from '@/components/n8n-demo-workflow'
import {
  ArrowLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
  CalendarIcon,
  TagIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'

interface WorkflowData {
  id: string
  providerId: string
  providerWorkflowId: string
  name: string
  description?: string
  isActive: boolean
  isArchived?: boolean
  tags: string[]
  createdAt: Date
  updatedAt: Date
  lastExecutedAt?: Date
  totalExecutions: number
  successCount: number
  failureCount: number
  successRate: number
  avgDuration?: number
  workflowJson: any // n8n workflow JSON data
  metadata?: {
    nodeCount: number
    n8nWorkflowId: string
    connections?: Record<string, unknown>
  }
}

function WorkflowDetailContent() {
  const params = useParams()
  const router = useRouter()
  const workflowId = params?.id as string
  
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkflow = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<{ data: WorkflowData }>(`/workflows/${workflowId}`)
      setWorkflow(response.data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch workflow:', err)
      setError('Failed to load workflow details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (workflowId) {
      fetchWorkflow()
    }
  }, [workflowId])

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date))
  }

  const handleDownloadWorkflow = () => {
    if (!workflow?.workflowJson) {
      alert('No workflow data available to download')
      return
    }
    
    // Create downloadable JSON file
    const dataStr = JSON.stringify(workflow.workflowJson, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    
    const exportFileDefaultName = `${workflow.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_workflow.json`
    
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ${seconds % 60}s`
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-rose-600"></div>
      </div>
    )
  }

  if (error || !workflow) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Error loading workflow</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400 dark:text-slate-400">{error || 'Workflow not found'}</p>
        <div className="mt-6 space-x-3">
          <Button onClick={() => router.back()}>
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Go Back
          </Button>
          <Button outline onClick={fetchWorkflow}>
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <Button 
            outline 
            onClick={() => router.back()}
            className="flex items-center"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{workflow.name}</h1>
              <Badge 
                color={workflow.isActive ? 'green' : (workflow.isArchived ?? false) ? 'orange' : 'zinc'}
                className="flex items-center space-x-1"
              >
                {workflow.isActive ? (
                  <CheckCircleIcon className="h-3 w-3" />
                ) : (workflow.isArchived ?? false) ? (
                  <ArchiveBoxIcon className="h-3 w-3" />
                ) : (
                  <ClockIcon className="h-3 w-3" />
                )}
                <span>
                  {workflow.isActive ? 'Active' : (workflow.isArchived ?? false) ? 'Archived' : 'Inactive'}
                </span>
              </Badge>
            </div>
            {workflow.description && (
              <p className="text-gray-600 dark:text-slate-400">{workflow.description}</p>
            )}
            <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-slate-400 mt-2">
              <span className="font-mono">{workflow.id}</span>
              <span>•</span>
              <span>{workflow.metadata?.nodeCount || 0} nodes</span>
            </div>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button 
            outline 
            onClick={handleDownloadWorkflow}
            disabled={!workflow.workflowJson}
            title={workflow.workflowJson ? 'Download workflow JSON' : 'No workflow data available'}
          >
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-slate-400 truncate">Total Executions</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{workflow.totalExecutions}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-slate-400 truncate">Success Rate</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{workflow.successRate.toFixed(1)}%</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-6 w-6 text-rose-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-slate-400 truncate">Avg Duration</dt>
                  <dd className="text-lg font-medium text-gray-900 dark:text-white">{formatDuration(workflow.avgDuration)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CalendarIcon className="h-6 w-6 text-purple-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-slate-400 truncate">Last Executed</dt>
                  <dd className="text-sm font-medium text-gray-900 dark:text-white">
                    {workflow.lastExecutedAt ? formatDate(workflow.lastExecutedAt) : 'Never'}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tags */}
      {workflow.tags && workflow.tags.length > 0 && (
        <div className="bg-white dark:bg-slate-800 shadow rounded-lg p-6">
          <div className="flex items-center mb-4">
            <TagIcon className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Tags</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {workflow.tags.map((tag, index) => (
              <Badge key={index} color="zinc">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Visualization */}
      <div className="bg-white dark:bg-slate-800 shadow rounded-lg flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-300 flex-shrink-0">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Workflow Visualization</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Interactive preview of your n8n workflow</p>
        </div>
        <div className="flex-1 flex flex-col" style={{ minHeight: '85vh', height: '85vh' }}>
          {workflow.workflowJson ? (
            <N8nDemoWorkflow 
              workflow={workflow.workflowJson} 
              height="85vh"
              className="flex-1"
              frame={true}
              fitView={true}
              zoom={0.8}
            />
          ) : (
            <div className="text-center py-12 flex-1 flex items-center justify-center">
              <div>
                <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No workflow data available</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400 dark:text-slate-400">
                  The workflow JSON data is not available for visualization.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-white dark:bg-slate-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Workflow Details</h3>
        </div>
        <div className="px-6 py-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{formatDate(workflow.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{formatDate(workflow.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Provider ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{workflow.providerId}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">n8n Workflow ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{workflow.providerWorkflowId}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Success Count</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{workflow.successCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Failure Count</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-white">{workflow.failureCount}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

export default function WorkflowDetailPage() {
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
        <WorkflowDetailContent />
      </WithN8NConnection>
    </AppLayout>
  )
}