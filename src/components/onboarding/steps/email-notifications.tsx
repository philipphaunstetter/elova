'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { 
  EnvelopeIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LinkIcon
} from '@heroicons/react/24/outline'

interface EmailNotificationsStepProps {
  initialData?: {
    enabled?: boolean
    resendApiKey?: string
    fromEmail?: string
    fromName?: string
  }
  onNext: (data: { 
    enabled: boolean
    resendApiKey?: string
    fromEmail?: string
    fromName?: string
  }) => void
  onSkip?: () => void
  onBack?: () => void
  loading?: boolean
}

export function EmailNotificationsStep({ 
  initialData, 
  onNext, 
  onSkip, 
  onBack, 
  loading 
}: EmailNotificationsStepProps) {
  const [enabled, setEnabled] = useState(initialData?.enabled || false)
  const [resendApiKey, setResendApiKey] = useState(initialData?.resendApiKey || '')
  const [fromEmail, setFromEmail] = useState(initialData?.fromEmail || '')
  const [fromName, setFromName] = useState(initialData?.fromName || 'Elova Monitoring')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const testEmailConfiguration = async () => {
    if (!enabled || !resendApiKey || !fromEmail) {
      setTestResult({
        success: false,
        message: 'Please fill in all email configuration fields before testing'
      })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/onboarding/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resendApiKey,
          fromEmail,
          fromName,
          testEmail: fromEmail // Send test email to the configured from address
        })
      })

      const result = await response.json()

      if (response.ok) {
        setTestResult({
          success: true,
          message: `Test email sent successfully to ${fromEmail}! Check your inbox.`
        })
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Failed to send test email'
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Network error: Unable to test email configuration'
      })
    } finally {
      setTesting(false)
    }
  }

  const handleNext = () => {
    onNext({
      enabled,
      resendApiKey: enabled ? resendApiKey : undefined,
      fromEmail: enabled ? fromEmail : undefined,
      fromName: enabled ? fromName : undefined
    })
  }

  const canProceed = !enabled || (enabled && resendApiKey && fromEmail)

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <EnvelopeIcon className="h-8 w-8 text-rose-600" />
          </div>
          <CardTitle className="text-2xl">Email Notifications</CardTitle>
          <CardDescription className="text-base">
            Set up email alerts for workflow failures, performance issues, and system notifications.
            This step is optional - you can configure it later.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Enable Email Notifications */}
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div className="flex-1">
              <Label htmlFor="enable-emails" className="text-base font-medium">
                Enable Email Notifications
              </Label>
              <p className="text-sm text-gray-500 mt-1">
                Get notified about workflow failures, performance alerts, and system issues
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>

          {/* Configuration Fields */}
          {enabled && (
            <div className="space-y-6">
              {/* Help Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <InformationCircleIcon className="h-5 w-5 text-rose-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800 mb-2">Using Resend for email delivery:</p>
                    <ol className="text-rose-700 space-y-1 ml-4 list-decimal">
                      <li>
                        Sign up for a free account at{' '}
                        <a 
                          href="https://resend.com" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="underline hover:text-blue-800"
                        >
                          resend.com
                        </a>
                      </li>
                      <li>Create an API key in your Resend dashboard</li>
                      <li>Add your domain (or use their testing domain)</li>
                      <li>Enter your API key and sender details below</li>
                    </ol>
                    <p className="text-rose-600 mt-2 font-medium">
                      Free tier includes 3,000 emails/month - perfect for monitoring alerts!
                    </p>
                  </div>
                </div>
              </div>

              {/* Resend API Key */}
              <div className="space-y-2">
                <Label htmlFor="resend-api-key">
                  Resend API Key <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="resend-api-key"
                  type="password"
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  placeholder="re_xxxxxxxxxxxxxxxx"
                  className="text-base font-mono"
                />
                <p className="text-sm text-gray-500">
                  Your Resend API key (starts with "re_")
                </p>
              </div>

              {/* From Email */}
              <div className="space-y-2">
                <Label htmlFor="from-email">
                  From Email Address <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="alerts@yourdomain.com"
                  className="text-base"
                />
                <p className="text-sm text-gray-500">
                  Email address that notifications will be sent from
                </p>
              </div>

              {/* From Name */}
              <div className="space-y-2">
                <Label htmlFor="from-name">
                  From Name (optional)
                </Label>
                <Input
                  id="from-name"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Elova Monitoring"
                  className="text-base"
                />
                <p className="text-sm text-gray-500">
                  Display name for email notifications
                </p>
              </div>

              {/* Test Configuration */}
              <div className="space-y-4">
                <Button
                  onClick={testEmailConfiguration}
                  disabled={!resendApiKey || !fromEmail || testing}
outline
                  className="w-full"
                >
                  {testing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-600 mr-2"></div>
                      Sending Test Email...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-4 w-4 mr-2" />
                      Send Test Email
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
                      <p className={`font-medium ${
                        testResult.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {testResult.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Privacy Note */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <InformationCircleIcon className="h-5 w-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-gray-700">
                    <p className="font-medium mb-1">Privacy & Security:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Your API key is encrypted and stored securely</li>
                      <li>Only workflow monitoring emails are sent</li>
                      <li>You can disable notifications anytime in settings</li>
                      <li>No personal data is shared with third parties</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t">
            {onBack && (
              <Button plain onClick={onBack}>
                Back
              </Button>
            )}
            
            <div className="flex space-x-3 ml-auto">
              {onSkip && !enabled && (
                <Button plain onClick={onSkip}>
                  Skip for Now
                </Button>
              )}
              
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

          {enabled && !canProceed && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-3">
              Please fill in the required email configuration fields.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}