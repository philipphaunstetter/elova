'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  LinkIcon,
  KeyIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

interface N8NIntegrationStepProps {
  initialData?: {
    url?: string
    apiKey?: string
  }
  onNext: (data: { url: string; apiKey: string }) => void
  onSkip?: () => void
  loading?: boolean
}

export function N8NIntegrationStep({ initialData, onNext, onSkip, loading }: N8NIntegrationStepProps) {
  const [url, setUrl] = useState(initialData?.url || '')
  const [apiKey, setApiKey] = useState(initialData?.apiKey || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    details?: any
  } | null>(null)

  const testConnection = async () => {
    if (!url || !apiKey) {
      setTestResult({
        success: false,
        message: 'Please enter both URL and API key before testing'
      })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/onboarding/test-n8n', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, apiKey })
      })

      const result = await response.json()

      if (response.ok) {
        setTestResult({
          success: true,
          message: `Successfully connected to n8n! Found ${result.workflowCount || 0} workflows.`,
          details: result
        })
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Failed to connect to n8n instance'
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Network error: Unable to test connection'
      })
    } finally {
      setTesting(false)
    }
  }

  const handleNext = () => {
    if (!url || !apiKey) return
    onNext({ url, apiKey })
  }

  const canProceed = url && apiKey && testResult?.success

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <LinkIcon className="h-8 w-8 text-rose-600" />
          </div>
          <CardTitle className="text-2xl">Connect to n8n</CardTitle>
          <CardDescription className="text-base">
            Connect Elova to your n8n instance to start monitoring your workflows.
            You'll need your n8n URL and an API key.
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
            />
            <p className="text-sm text-gray-500">
              Your n8n API key (will be stored securely)
            </p>
          </div>

          {/* Test Connection */}
          <div className="space-y-4">
            <Button
              onClick={testConnection}
              disabled={!url || !apiKey || testing}
outline
              className="w-full"
            >
              {testing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-600 mr-2"></div>
                  Testing Connection...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

            {/* Test Result */}
            {testResult && (
              <div className={`p-4 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start space-x-3">
                  {testResult.success ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      testResult.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {testResult.message}
                    </p>
                    {testResult.success && testResult.details && (
                      <div className="mt-2 text-sm text-green-700">
                        <p>n8n Version: {testResult.details.version || 'Unknown'}</p>
                        <p>Instance ID: {testResult.details.instanceId || 'Unknown'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t">
            {onSkip && (
              <Button plain onClick={onSkip}>
                Skip for Now
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

          {!canProceed && url && apiKey && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-3">
              Please test your connection successfully before continuing.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}