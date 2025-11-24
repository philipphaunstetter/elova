'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/app-layout'
import { apiClient } from '@/lib/api-client'
import { Provider } from '@/types'
import {
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  PencilIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { showToast } from '@/components/toast'
import { Badge } from '@/components/badge'

interface ProviderFormData {
  name: string
  baseUrl: string
  apiKey: string
}

function ProvidersContent() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    baseUrl: '',
    apiKey: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  useEffect(() => {
    fetchProviders()
  }, [])

  const fetchProviders = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<{ data: Provider[] }>('/providers')
      setProviders(response.data)
    } catch (error) {
      console.error('Failed to fetch providers:', error)
      showToast({
        type: 'error',
        title: 'Failed to load providers',
        message: 'Please try again'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setFormData({ name: '', baseUrl: '', apiKey: '' })
    setEditingProvider(null)
    setShowAddModal(true)
  }

  const handleEdit = (provider: Provider) => {
    setFormData({
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: '' // Don't populate API key for security
    })
    setEditingProvider(provider)
    setShowAddModal(true)
  }

  const handleCloseModal = () => {
    setShowAddModal(false)
    setEditingProvider(null)
    setFormData({ name: '', baseUrl: '', apiKey: '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name || !formData.baseUrl) {
      showToast({
        type: 'error',
        title: 'Validation error',
        message: 'Name and URL are required'
      })
      return
    }

    if (!editingProvider && !formData.apiKey) {
      showToast({
        type: 'error',
        title: 'Validation error',
        message: 'API key is required for new providers'
      })
      return
    }

    try {
      setSubmitting(true)

      if (editingProvider) {
        // Update existing provider
        const updateData: any = {
          name: formData.name,
          baseUrl: formData.baseUrl
        }
        // Only include API key if it was changed
        if (formData.apiKey) {
          updateData.apiKey = formData.apiKey
        }

        await apiClient.put(`/providers/${editingProvider.id}`, updateData)
        
        showToast({
          type: 'success',
          title: 'Provider updated',
          message: `${formData.name} has been updated successfully`
        })
      } else {
        // Create new provider
        await apiClient.post('/providers', formData)
        
        showToast({
          type: 'success',
          title: 'Provider added',
          message: `${formData.name} has been added and connection test passed`
        })
      }

      handleCloseModal()
      await fetchProviders()
    } catch (error: any) {
      console.error('Failed to save provider:', error)
      showToast({
        type: 'error',
        title: 'Failed to save provider',
        message: error?.response?.data?.error || 'Please check your details and try again'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (provider: Provider) => {
    if (!confirm(`Are you sure you want to delete "${provider.name}"? This will also delete all associated workflows and executions.`)) {
      return
    }

    try {
      await apiClient.delete(`/providers/${provider.id}`)
      
      showToast({
        type: 'success',
        title: 'Provider deleted',
        message: `${provider.name} has been deleted`
      })
      
      await fetchProviders()
    } catch (error) {
      console.error('Failed to delete provider:', error)
      showToast({
        type: 'error',
        title: 'Failed to delete provider',
        message: 'Please try again'
      })
    }
  }

  const handleTest = async (provider: Provider) => {
    try {
      setTestingId(provider.id)
      
      await apiClient.post(`/providers/${provider.id}/test`)
      
      showToast({
        type: 'success',
        title: 'Connection successful',
        message: `Successfully connected to ${provider.name}`
      })
      
      await fetchProviders()
    } catch (error: any) {
      console.error('Failed to test connection:', error)
      showToast({
        type: 'error',
        title: 'Connection failed',
        message: error?.response?.data?.error || 'Failed to connect to the n8n instance'
      })
    } finally {
      setTestingId(null)
    }
  }

  const getStatusBadge = (provider: Provider) => {
    const statusConfig = {
      healthy: { color: 'green' as const, icon: CheckCircleIcon, label: 'Connected' },
      warning: { color: 'yellow' as const, icon: ExclamationTriangleIcon, label: 'Warning' },
      error: { color: 'red' as const, icon: XCircleIcon, label: 'Error' },
      unknown: { color: 'zinc' as const, icon: ExclamationTriangleIcon, label: 'Unknown' }
    }

    const config = statusConfig[provider.status]
    const Icon = config.icon

    return (
      <Badge color={config.color} className="flex items-center space-x-1">
        <Icon className="h-3 w-3" />
        <span>{config.label}</span>
      </Badge>
    )
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} min ago`
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`
    return `${Math.floor(minutes / 1440)} days ago`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">n8n Instances</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            Manage your n8n instances and monitor their connection status
          </p>
        </div>
        <Button onClick={handleAdd} className="flex items-center space-x-2">
          <PlusIcon className="h-4 w-4" />
          <span>Add Instance</span>
        </Button>
      </div>

      {/* Providers List */}
      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto"></div>
          <p className="mt-2 text-gray-600 dark:text-slate-400">Loading providers...</p>
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-12 text-center">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <ExclamationTriangleIcon />
          </div>
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No n8n instances</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Get started by adding your first n8n instance
          </p>
          <div className="mt-6">
            <Button onClick={handleAdd}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add n8n Instance
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {providers.map((provider) => (
            <div key={provider.id} className="bg-white dark:bg-slate-800 rounded-lg shadow border border-gray-200 dark:border-slate-300 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{provider.name}</h3>
                    {getStatusBadge(provider)}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">{provider.baseUrl}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Last checked: {formatDate(provider.lastChecked)}
                  </p>
                  {provider.metadata?.version && typeof provider.metadata.version === 'string' ? (
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      Version: {provider.metadata.version}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    outline
                    onClick={() => handleTest(provider)}
                    disabled={testingId === provider.id}
                    className="flex items-center space-x-1"
                  >
                    <ArrowPathIcon className={`h-4 w-4 ${testingId === provider.id ? 'animate-spin' : ''}`} />
                    <span>Test</span>
                  </Button>
                  <Button
                    outline
                    onClick={() => handleEdit(provider)}
                    className="flex items-center space-x-1"
                  >
                    <PencilIcon className="h-4 w-4" />
                    <span>Edit</span>
                  </Button>
                  <Button
                    outline
                    onClick={() => handleDelete(provider)}
                    className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>Delete</span>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingProvider ? 'Edit Provider' : 'Add n8n Instance'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Instance Name
                </label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Production n8n"
                  required
                />
              </div>
              <div>
                <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  n8n URL
                </label>
                <Input
                  id="baseUrl"
                  type="url"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder="https://n8n.example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  API Key {editingProvider && <span className="text-xs text-gray-500 dark:text-slate-400">(leave blank to keep current)</span>}
                </label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder={editingProvider ? "Enter new API key" : "n8n-api-key-..."}
                  required={!editingProvider}
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button type="button" outline onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : editingProvider ? 'Update' : 'Add Instance'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProvidersPage() {
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
      <ProvidersContent />
    </AppLayout>
  )
}
