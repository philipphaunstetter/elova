'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ChartPieIcon,
  EyeIcon,
  EyeSlashIcon,
  CogIcon,
  LinkIcon,
  ChartBarIcon,
  EnvelopeIcon,
  ServerIcon,
  ListBulletIcon
} from '@heroicons/react/24/outline'
import { CheckIcon as CheckIconSolid } from '@heroicons/react/24/solid'
import { showToast } from '@/components/toast'
import { normalizeUrl } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface SetupData {
  // Step 1: Admin Account
  adminEmail: string
  adminPassword: string
  adminPasswordConfirm: string

  // Step 2: n8n Integration
  n8nUrl: string
  n8nApiKey: string

  // Step 3: Workflow Selection
  trackedWorkflowIds: string[]

  // Step 4: Configuration
  syncInterval: string
  analyticsEnabled: boolean

  // Step 5: Email Notifications (placeholder)
  emailEnabled: boolean
  smtpHost: string
  smtpPort: string
  smtpUser: string
  smtpPassword: string
}

interface DiscoveredWorkflow {
  id: string
  name: string
  active: boolean
}

const steps = [
  { id: '01', name: 'Admin Account', icon: CogIcon, description: 'Create your administrator account' },
  { id: '02', name: 'n8n Integration', icon: LinkIcon, description: 'Connect to your n8n instance' },
  { id: '03', name: 'Workflows', icon: ListBulletIcon, description: 'Choose workflows to track' },
  { id: '04', name: 'Configuration', icon: ChartBarIcon, description: 'Set up sync and analytics' },
  { id: '05', name: 'Notifications', icon: EnvelopeIcon, description: 'Configure email settings' },
]

export default function SetupWizardPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'error'>('unknown')
  const [discoveredWorkflows, setDiscoveredWorkflows] = useState<DiscoveredWorkflow[]>([])

  const [formData, setFormData] = useState<SetupData>({
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    n8nUrl: '',
    n8nApiKey: '',
    trackedWorkflowIds: [],
    syncInterval: '15',
    analyticsEnabled: true,
    emailEnabled: false,
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: ''
  })

  const handleInputChange = (field: keyof SetupData, value: string | boolean) => {
    // Normalize n8n URL when it's entered
    if (field === 'n8nUrl' && typeof value === 'string') {
      value = normalizeUrl(value.trim())
    }

    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setError(null)
  }

  const handleWorkflowToggle = (workflowId: string, checked: boolean) => {
    setFormData(prev => {
      const newTrackedIds = checked
        ? [...prev.trackedWorkflowIds, workflowId]
        : prev.trackedWorkflowIds.filter(id => id !== workflowId)
      
      return { ...prev, trackedWorkflowIds: newTrackedIds }
    })
  }

  const handleSelectAllWorkflows = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      trackedWorkflowIds: checked ? discoveredWorkflows.map(w => w.id) : []
    }))
  }

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1:
        if (!formData.adminEmail || !formData.adminPassword || !formData.adminPasswordConfirm) {
          setError('Please fill in all required fields')
          return false
        }
        if (formData.adminPassword !== formData.adminPasswordConfirm) {
          setError('Passwords do not match')
          return false
        }
        if (formData.adminPassword.length < 6) {
          setError('Password must be at least 6 characters long')
          return false
        }
        return true
      case 2:
        if (!formData.n8nUrl || !formData.n8nApiKey) {
          setError('Please enter both n8n URL and API key')
          return false
        }
        return true
      case 3:
        // Workflow selection is optional (can select none)
        return true
      case 4:
        return true // All fields are optional or have defaults
      case 5:
        return true // All fields are optional (placeholder step)
      default:
        return false
    }
  }

  const handleNext = async () => {
    setError(null)
    if (!validateCurrentStep()) return

    // Special handling for n8n connection step
    if (currentStep === 2) {
      await connectAndFetchWorkflows()
    } else {
      setCurrentStep(prev => Math.min(prev + 1, steps.length))
    }
  }

  const connectAndFetchWorkflows = async () => {
    if (!formData.n8nUrl || !formData.n8nApiKey) {
      setError('Please enter both URL and API key')
      return
    }

    try {
      setLoading(true) // Use main loading state for the button
      setTestingConnection(true)
      setError(null)

      const response = await fetch('/api/n8n/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: normalizeUrl(formData.n8nUrl),
          apiKey: formData.n8nApiKey
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setConnectionStatus('connected')
        
        // Set discovered workflows
        if (result.workflows && Array.isArray(result.workflows)) {
          setDiscoveredWorkflows(result.workflows)
          // Default to tracking all active workflows
          const activeWorkflows = result.workflows
            .filter((w: any) => w.active)
            .map((w: any) => w.id)
          
          setFormData(prev => ({
            ...prev,
            trackedWorkflowIds: activeWorkflows
          }))
        }
        
        // Move to next step
        setCurrentStep(3)
      } else {
        setConnectionStatus('error')
        setError(result.error || 'Failed to connect to n8n instance')
      }
    } catch (error) {
      console.error('Failed to test connection:', error)
      setConnectionStatus('error')
      setError('Failed to test connection')
    } finally {
      setLoading(false)
      setTestingConnection(false)
    }
  }

  const handleBack = () => {
    setError(null)
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleComplete = async () => {
    setLoading(true)
    setError(null)

    try {
      // Complete setup with all configuration
      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminData: {
            name: 'Admin',
            email: formData.adminEmail,
            password: formData.adminPassword,
          },
          n8nConfig: {
            url: normalizeUrl(formData.n8nUrl),
            apiKey: formData.n8nApiKey,
          },
          trackedWorkflowIds: formData.trackedWorkflowIds,
          configuration: {
            syncInterval: formData.syncInterval,
            analyticsEnabled: formData.analyticsEnabled,
          },
          emailConfig: {
            enabled: formData.emailEnabled,
            smtpHost: formData.smtpHost,
            smtpPort: formData.smtpPort,
            smtpUser: formData.smtpUser,
            smtpPassword: formData.smtpPassword,
          }
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Setup failed')
      }

      const result = await response.json()

      // Show completion toast
      showToast({
        type: 'success',
        title: 'Setup completed successfully!',
        message: 'Redirecting to dashboard...',
        duration: 3000
      })

      // Small delay to show the toast, then redirect
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
    } catch (error) {
      console.error('Setup failed:', error)
      setError(error instanceof Error ? error.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  const getStepStatus = (stepIndex: number) => {
    if (stepIndex < currentStep) return 'complete'
    if (stepIndex === currentStep) return 'current'
    return 'upcoming'
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="adminEmail">Email Address</Label>
              <Input
                id="adminEmail"
                type="email"
                value={formData.adminEmail}
                onChange={(e) => handleInputChange('adminEmail', e.target.value)}
                placeholder="admin@example.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="adminPassword">Password</Label>
              <div className="relative">
                <Input
                  id="adminPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.adminPassword}
                  onChange={(e) => handleInputChange('adminPassword', e.target.value)}
                  placeholder="Enter a secure password (min 6 characters)"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="adminPasswordConfirm">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="adminPasswordConfirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.adminPasswordConfirm}
                  onChange={(e) => handleInputChange('adminPasswordConfirm', e.target.value)}
                  placeholder="Confirm your password"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <div
                  className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-600"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </div>
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="n8nUrl">n8n Instance URL</Label>
              <Input
                id="n8nUrl"
                type="url"
                value={formData.n8nUrl}
                onChange={(e) => handleInputChange('n8nUrl', e.target.value)}
                placeholder="https://your-n8n-instance.com"
                required
              />
              <p className="text-xs text-gray-500 mt-1">Enter the full URL of your n8n instance</p>
            </div>
            <div>
              <Label htmlFor="n8nApiKey">API Key</Label>
              <Input
                id="n8nApiKey"
                type="password"
                value={formData.n8nApiKey}
                onChange={(e) => handleInputChange('n8nApiKey', e.target.value)}
                placeholder="Enter your n8n API key"
                required
              />
              <p className="text-xs text-gray-500 mt-1">You can find your API key in n8n under Settings → API Keys</p>
            </div>

            {/* Connection Test - Removed, happens automatically on Next */}
            <div className="pt-4">
              <div className="text-sm text-gray-500 text-center">
                Click Next to connect and discover workflows
              </div>
            </div>

            {/* Connection Status */}
            {connectionStatus === 'error' && (
              <div className="p-4 rounded-md bg-red-50 border border-red-200">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-red-800">
                    Connection Failed
                  </span>
                </div>
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Discovered Workflows</h3>
                <p className="text-sm text-gray-500">
                  Select the workflows you want to track in Elova
                </p>
              </div>
              <div className="text-sm text-gray-500">
                {formData.trackedWorkflowIds.length} selected
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <input
                          type="checkbox"
                          checked={discoveredWorkflows.length > 0 && formData.trackedWorkflowIds.length === discoveredWorkflows.length}
                          onChange={(e) => handleSelectAllWorkflows(e.target.checked)}
                          className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded"
                        />
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Workflow Name
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {discoveredWorkflows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                          No workflows found
                        </td>
                      </tr>
                    ) : (
                      discoveredWorkflows.map((workflow) => (
                        <tr key={workflow.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={formData.trackedWorkflowIds.includes(workflow.id)}
                              onChange={(e) => handleWorkflowToggle(workflow.id, e.target.checked)}
                              className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {workflow.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant={workflow.active ? 'default' : 'secondary'} className={workflow.active ? 'bg-green-100 text-green-800 hover:bg-green-200' : ''}>
                              {workflow.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="syncInterval">Sync Interval (minutes)</Label>
              <select
                id="syncInterval"
                value={formData.syncInterval}
                onChange={(e) => handleInputChange('syncInterval', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-rose-500 focus:border-rose-500"
              >
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="240">4 hours</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">How often to sync data from n8n</p>
            </div>

            <div>
              <div className="flex items-center space-x-3">
                <input
                  id="analyticsEnabled"
                  type="checkbox"
                  checked={formData.analyticsEnabled}
                  onChange={(e) => handleInputChange('analyticsEnabled', e.target.checked)}
                  className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded"
                />
                <div>
                  <Label htmlFor="analyticsEnabled" className="text-sm font-medium text-gray-900">
                    Enable Analytics
                  </Label>
                  <p className="text-xs text-gray-500">Collect usage analytics for insights and reporting</p>
                </div>
              </div>
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Email notifications are not yet implemented. These settings are placeholders for future functionality.
              </p>
            </div>

            <div>
              <div className="flex items-center space-x-3">
                <input
                  id="emailEnabled"
                  type="checkbox"
                  checked={formData.emailEnabled}
                  onChange={(e) => handleInputChange('emailEnabled', e.target.checked)}
                  disabled
                  className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded opacity-50"
                />
                <div>
                  <Label htmlFor="emailEnabled" className="text-sm font-medium text-gray-500">
                    Enable Email Notifications (Coming Soon)
                  </Label>
                  <p className="text-xs text-gray-400">Send alerts for workflow failures and reports</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 opacity-50">
              <div>
                <Label htmlFor="smtpHost" className="text-gray-500">SMTP Host</Label>
                <Input
                  id="smtpHost"
                  value={formData.smtpHost}
                  onChange={(e) => handleInputChange('smtpHost', e.target.value)}
                  placeholder="smtp.gmail.com"
                  disabled
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="smtpPort" className="text-gray-500">Port</Label>
                  <Input
                    id="smtpPort"
                    value={formData.smtpPort}
                    onChange={(e) => handleInputChange('smtpPort', e.target.value)}
                    placeholder="587"
                    disabled
                  />
                </div>
                <div>
                  <Label htmlFor="smtpUser" className="text-gray-500">Username</Label>
                  <Input
                    id="smtpUser"
                    value={formData.smtpUser}
                    onChange={(e) => handleInputChange('smtpUser', e.target.value)}
                    placeholder="your-email@gmail.com"
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <ChartPieIcon className="h-8 w-8 text-rose-600" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">Elova</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Setup Wizard</h1>
          <p className="text-gray-600 mt-2">Configure your workflow observability platform</p>
        </div>

        {/* Progress Steps */}
        <nav aria-label="Progress" className="mb-8">
          <ol role="list" className="divide-y divide-gray-300 rounded-md border border-gray-300 md:flex md:divide-y-0">
            {steps.map((step, stepIdx) => {
              const status = getStepStatus(stepIdx + 1)
              const StepIcon = step.icon

              return (
                <li key={step.name} className="relative md:flex md:flex-1">
                  {status === 'complete' ? (
                    <div className="group flex w-full items-center">
                      <span className="flex items-center px-6 py-4 text-sm font-medium">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-600">
                          <CheckIconSolid aria-hidden="true" className="size-6 text-white" />
                        </span>
                        <span className="ml-4 text-sm font-medium text-gray-900">{step.name}</span>
                      </span>
                    </div>
                  ) : status === 'current' ? (
                    <div aria-current="step" className="flex items-center px-6 py-4 text-sm font-medium">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-rose-600">
                        <StepIcon className="size-5 text-rose-600" />
                      </span>
                      <span className="ml-4 text-sm font-medium text-rose-600">{step.name}</span>
                    </div>
                  ) : (
                    <div className="group flex items-center">
                      <span className="flex items-center px-6 py-4 text-sm font-medium">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-gray-300">
                          <StepIcon className="size-5 text-gray-500" />
                        </span>
                        <span className="ml-4 text-sm font-medium text-gray-500">{step.name}</span>
                      </span>
                    </div>
                  )}

                  {stepIdx !== steps.length - 1 && (
                    <div aria-hidden="true" className="absolute top-0 right-0 hidden h-full w-5 md:block">
                      <svg fill="none" viewBox="0 0 22 80" preserveAspectRatio="none" className="size-full text-gray-300">
                        <path
                          d="M0 -2L20 40L0 82"
                          stroke="currentcolor"
                          vectorEffect="non-scaling-stroke"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Step Content */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {React.createElement(steps[currentStep - 1].icon, { className: "h-6 w-6 text-rose-600" })}
              <span>{steps[currentStep - 1].name}</span>
            </CardTitle>
            <CardDescription>
              {steps[currentStep - 1].description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {renderStepContent()}

            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              <Button
                type="button"
                outline
                onClick={handleBack}
                disabled={currentStep === 1}
              >
                Back
              </Button>

              {currentStep === steps.length ? (
                <Button
                  onClick={handleComplete}
                  disabled={loading}
                  className="flex items-center space-x-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Completing Setup...</span>
                    </>
                  ) : (
                    <>
                      <CheckIconSolid className="h-4 w-4" />
                      <span>Complete Setup</span>
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={loading}>
                  {loading && currentStep === 2 ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Connecting...
                    </>
                  ) : 'Next'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}