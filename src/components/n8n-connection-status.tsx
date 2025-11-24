'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  ExclamationTriangleIcon,
  LinkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import Link from 'next/link'

interface ConnectionStatus {
  isConfigured: boolean
  isConnected: boolean
  lastChecked?: string
  error?: string
  workflowCount?: number
  n8nVersion?: string
}

interface N8NConnectionStatusProps {
  onConnectionRestored?: () => void
  showRetry?: boolean
}

export function N8NConnectionStatus({ onConnectionRestored, showRetry = true }: N8NConnectionStatusProps) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    checkConnectionStatus()
  }, [])

  const checkConnectionStatus = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/n8n/connection-status')
      
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
        
        // If connection is restored and callback provided, call it
        if (data.isConnected && onConnectionRestored) {
          onConnectionRestored()
        }
      } else {
        setStatus({
          isConfigured: false,
          isConnected: false,
          error: 'Unable to check connection status'
        })
      }
    } catch (error) {
      setStatus({
        isConfigured: false,
        isConnected: false,
        error: 'Network error while checking connection'
      })
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    
    try {
      const response = await fetch('/api/n8n/test-connection', {
        method: 'POST'
      })
      
      if (response.ok) {
        const data = await response.json()
        setStatus({
          isConfigured: true,
          isConnected: true,
          workflowCount: data.workflowCount,
          n8nVersion: data.version,
          lastChecked: new Date().toISOString()
        })
        
        if (onConnectionRestored) {
          onConnectionRestored()
        }
      } else {
        const error = await response.json()
        setStatus(prev => ({
          isConfigured: prev?.isConfigured || true,
          isConnected: false,
          error: error.message || 'Connection test failed'
        }))
      }
    } catch (error) {
      setStatus(prev => ({
        isConfigured: prev?.isConfigured || true,
        isConnected: false,
        error: 'Network error during connection test'
      }))
    } finally {
      setTesting(false)
    }
  }

  const testConfiguredConnection = async (testUrl: string, testApiKey: string) => {
    setTesting(true)
    
    try {
      const response = await fetch('/api/onboarding/test-n8n', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: testUrl, apiKey: testApiKey })
      })
      
      const result = await response.json()
      
      if (response.ok) {
        return { success: true, data: result }
      } else {
        return { success: false, error: result.error || 'Connection failed' }
      }
    } catch (error) {
      return { success: false, error: 'Network error during test' }
    } finally {
      setTesting(false)
    }
  }

  const saveConfiguration = async () => {
    if (!url || !apiKey) return
    
    setSaving(true)
    
    try {
      // Test connection first
      const testResult = await testConfiguredConnection(url, apiKey)
      
      if (!testResult.success) {
        setStatus(prev => ({ ...prev!, error: testResult.error }))
        return
      }
      
      // Save configuration
      const response = await fetch('/api/onboarding/save-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          step: 'n8n-integration',
          data: { url, apiKey }
        })
      })
      
      if (response.ok) {
        setStatus({
          isConfigured: true,
          isConnected: true,
          workflowCount: testResult.data?.workflowCount,
          n8nVersion: testResult.data?.version,
          lastChecked: new Date().toISOString()
        })
        
        if (onConnectionRestored) {
          onConnectionRestored()
        }
      } else {
        const error = await response.json()
        setStatus(prev => ({ ...prev!, error: error.message || 'Failed to save configuration' }))
      }
    } catch (error) {
      setStatus(prev => ({ ...prev!, error: 'Network error while saving' }))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600"></div>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Unable to Check Connection
            </h3>
            <p className="text-sm text-gray-600">
              There was an error checking your n8n connection status.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Connection is working - don't show anything
  if (status.isConfigured && status.isConnected) {
    return null
  }

  // Not configured - show setup form
  if (!status.isConfigured) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center pb-4">
            <LinkIcon className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <CardTitle className="text-xl text-amber-900">
              n8n Not Connected
            </CardTitle>
            <CardDescription className="text-base">
              Connect your n8n instance to start monitoring workflows.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Help Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <InformationCircleIcon className="h-5 w-5 text-rose-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800 mb-2">How to get your n8n API key:</p>
                  <ol className="text-rose-700 space-y-1 ml-4 list-decimal">
                    <li>Open your n8n instance</li>
                    <li>Go to <strong>Settings</strong> → <strong>n8n API</strong></li>
                    <li>Create a new API key</li>
                    <li>Copy the generated key and paste it below</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Configuration Form */}
            <div className="space-y-4">
              {/* N8N URL */}
              <div className="space-y-2">
                <Label htmlFor="n8n-url">
                  n8n Instance URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="n8n-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-n8n-instance.com"
                  className="text-base"
                  disabled={saving}
                />
                <p className="text-sm text-gray-500">
                  The URL where your n8n instance is running (including http:// or https://)
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label htmlFor="n8n-api-key">
                  n8n API Key <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="n8n-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="n8n_api_..."
                  className="text-base font-mono"
                  disabled={saving}
                />
                <p className="text-sm text-gray-500">
                  Your n8n API key (will be stored securely)
                </p>
              </div>
            </div>

            {/* Error display */}
            {status.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                <strong>Error:</strong> {status.error}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Button
                onClick={saveConfiguration}
                disabled={!url || !apiKey || testing || saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Connecting...
                  </>
                ) : (
                  'Connect n8n'
                )}
              </Button>
            </div>

            {/* Help text */}
            <div className="text-center">
              <p className="text-xs text-gray-500">
                Need help? Check the{' '}
                <Link href="/docs/n8n-integration" className="text-rose-600 hover:text-indigo-800 underline">
                  n8n integration guide
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Connection failed - show retry options
  return (
    <div className="flex items-center justify-center min-h-96">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-4">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <CardTitle className="text-xl text-red-900">
            n8n Connection Failed
          </CardTitle>
          <CardDescription className="text-base">
            Cannot connect to your n8n instance.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Suggestion */}
          <div className="p-4 rounded-lg border bg-red-50 border-red-200">
            <p className="text-sm font-medium text-red-800">
              💡 Check your n8n URL and API key in settings.
            </p>
          </div>

          {/* Error details if available */}
          {status.error && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700">
              <strong>Error:</strong> {status.error}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1">
              <Link href="/admin/settings">
                Check Settings
              </Link>
            </Button>
            
            {showRetry && (
              <Button
                onClick={testConnection}
                disabled={testing}
                outline
                className="flex-1"
              >
                {testing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-600 mr-2"></div>
                    Testing...
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="h-4 w-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Help text */}
          <div className="text-center">
            <p className="text-xs text-gray-500">
              Need help? Check the{' '}
              <Link href="/docs/n8n-integration" className="text-rose-600 hover:text-indigo-800 underline">
                n8n integration guide
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}