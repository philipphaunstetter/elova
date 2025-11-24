'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  CheckCircleIcon, 
  ArrowRightIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'

export default function CompletePage() {
  const [completing, setCompleting] = useState(false)
  const router = useRouter()

  const handleComplete = () => {
    setCompleting(true)
    // Setup is already completed, just redirect to dashboard
    router.push('/dashboard')
  }

  return (
    <div className="space-y-8">
      {/* Success Header */}
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircleIcon className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Setup Complete!
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          Congratulations! Your Elova workflow observability platform is now ready to use.
        </p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-rose-600" />
            What's Next?
          </CardTitle>
          <CardDescription>
            Here's what you can do now that Elova is set up
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start space-x-3 p-4 bg-indigo-50 rounded-lg">
              <CheckCircleIcon className="h-5 w-5 text-rose-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-indigo-900">Access Dashboard</h4>
                <p className="text-sm text-rose-700">
                  View your workflow analytics and system status
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-4 bg-purple-50 rounded-lg">
              <CheckCircleIcon className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-purple-900">Configure Integrations</h4>
                <p className="text-sm text-purple-700">
                  Connect n8n and other workflow platforms
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-4 bg-green-50 rounded-lg">
              <CheckCircleIcon className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-green-900">Monitor Workflows</h4>
                <p className="text-sm text-green-700">
                  Start tracking your automation performance
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3 p-4 bg-orange-50 rounded-lg">
              <CheckCircleIcon className="h-5 w-5 text-orange-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-orange-900">Customize Settings</h4>
                <p className="text-sm text-orange-700">
                  Adjust preferences in the admin panel
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Start Tips */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start Tips</CardTitle>
          <CardDescription>
            Make the most of your new Elova installation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-l-4 border-rose-500 bg-indigo-50 p-4">
              <h4 className="text-sm font-medium text-indigo-900">Connect Your First Workflow Platform</h4>
              <p className="text-sm text-rose-700 mt-1">
                Head to Settings → Integrations to connect n8n, Zapier, or Make.com and start monitoring your workflows.
              </p>
            </div>
            
            <div className="border-l-4 border-green-500 bg-green-50 p-4">
              <h4 className="text-sm font-medium text-green-900">Explore the Dashboard</h4>
              <p className="text-sm text-green-700 mt-1">
                Check out the analytics dashboard to understand your workflow performance and identify optimization opportunities.
              </p>
            </div>
            
            <div className="border-l-4 border-purple-500 bg-purple-50 p-4">
              <h4 className="text-sm font-medium text-purple-900">Set Up Alerts</h4>
              <p className="text-sm text-purple-700 mt-1">
                Configure notifications to stay informed about workflow failures and performance issues.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Button */}
      <div className="flex justify-center">
        <Button 
          onClick={handleComplete}
          className="flex items-center gap-2 px-8 py-3 text-lg"
          disabled={completing}
        >
          {completing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Completing Setup...
            </>
          ) : (
            <>
              Go to Dashboard
              <ArrowRightIcon className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}