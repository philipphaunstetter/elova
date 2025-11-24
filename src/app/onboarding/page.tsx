'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { OnboardingProgressBar, type OnboardingStep } from '@/components/onboarding/progress-bar'
import { N8NIntegrationStep } from '@/components/onboarding/steps/n8n-integration'
import { BasicSettingsStep } from '@/components/onboarding/steps/basic-settings'
import { EmailNotificationsStep } from '@/components/onboarding/steps/email-notifications'
import { ChartPieIcon } from '@heroicons/react/24/outline'

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'regional-settings',
    name: 'Regional Settings',
    description: 'Configure timezone settings',
    status: 'current',
    required: true
  },
  {
    id: 'email-notifications',
    name: 'Email Notifications',
    description: 'Set up email alerts (optional)',
    status: 'upcoming',
    required: false
  },
  {
    id: 'complete',
    name: 'Complete',
    description: 'Finalize your setup',
    status: 'upcoming',
    required: false
  }
]

interface OnboardingData {
  n8nIntegration?: {
    url: string
    apiKey: string
  }
  regionalSettings?: {
    timezone: string
  }
  emailNotifications?: {
    enabled: boolean
    resendApiKey?: string
    fromEmail?: string
    fromName?: string
  }
}

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState('regional-settings')
  const [steps, setSteps] = useState<OnboardingStep[]>(ONBOARDING_STEPS)
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({})
  const [loading, setLoading] = useState(false)

  // Load any existing configuration
  useEffect(() => {
    loadExistingConfig()
  }, [])

  const loadExistingConfig = async () => {
    try {
      const response = await fetch('/api/onboarding/status')
      if (response.ok) {
        const data = await response.json()
        if (data.existingConfig) {
          setOnboardingData(data.existingConfig)
          // Update steps based on existing config
          updateStepStatuses(data.existingConfig)
        }
      }
    } catch (error) {
      console.error('Failed to load existing config:', error)
    }
  }

  const updateStepStatuses = (data: OnboardingData) => {
    setSteps(prev => prev.map(step => {
      if (step.id === 'regional-settings' && data.regionalSettings) {
        return { ...step, status: 'complete' as const }
      }
      if (step.id === 'email-notifications' && data.emailNotifications) {
        return { ...step, status: 'complete' as const }
      }
      return step
    }))
  }

  const handleStepClick = (stepId: string) => {
    // Only allow navigation to completed steps or current step
    const step = steps.find(s => s.id === stepId)
    if (step && (step.status === 'complete' || step.status === 'current')) {
      setCurrentStep(stepId)
    }
  }

  const saveStepData = async (stepId: string, data: any) => {
    setLoading(true)
    
    try {
      const response = await fetch('/api/onboarding/save-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          step: stepId,
          data
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to save configuration')
      }

      // Update local state
      setOnboardingData(prev => ({
        ...prev,
        [stepId.replace('-', '').replace('settings', 'Settings')]: data
      }))

      // Mark step as complete and move to next
      moveToNextStep()

    } catch (error) {
      console.error('Failed to save step data:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const moveToNextStep = () => {
    const currentStepIndex = steps.findIndex(s => s.id === currentStep)
    
    // Mark current step as complete
    setSteps(prev => prev.map((step, index) => {
      if (index === currentStepIndex) {
        return { ...step, status: 'complete' as const }
      }
      if (index === currentStepIndex + 1) {
        return { ...step, status: 'current' as const }
      }
      return step
    }))

    // Move to next step or complete onboarding
    if (currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1].id)
    } else {
      completeOnboarding()
    }
  }

  const completeOnboarding = async () => {
    setLoading(true)
    
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error('Failed to complete onboarding')
      }

      // Redirect to providers page to add n8n instances
      router.push('/providers')
      
    } catch (error) {
      console.error('Failed to complete onboarding:', error)
      setLoading(false)
    }
  }

  const handleRegionalSettings = async (data: { timezone: string }) => {
    await saveStepData('regional-settings', data)
  }

  const handleEmailNotifications = async (data: {
    enabled: boolean
    resendApiKey?: string
    fromEmail?: string
    fromName?: string
  }) => {
    await saveStepData('email-notifications', data)
  }

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'regional-settings':
        return (
          <BasicSettingsStep
            initialData={onboardingData.regionalSettings}
            onNext={handleRegionalSettings}
            loading={loading}
          />
        )
      
      case 'email-notifications':
        return (
          <EmailNotificationsStep
            initialData={onboardingData.emailNotifications}
            onNext={handleEmailNotifications}
            onSkip={moveToNextStep}
            onBack={() => setCurrentStep('regional-settings')}
            loading={loading}
          />
        )
      
      case 'complete':
        return (
          <div className="max-w-2xl mx-auto p-8 text-center">
            <div className="mb-6">
              <ChartPieIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Setup Complete!</h2>
              <p className="text-xl text-gray-600 mb-4">
                Your basic configuration is complete. Now let's connect your n8n instances.
              </p>
              <p className="text-base text-gray-500">
                You'll be redirected to the n8n Instances page where you can add one or more n8n instances to monitor.
              </p>
            </div>
            
            <div className="space-y-4">
              <button 
                onClick={completeOnboarding}
                disabled={loading}
                className="w-full px-6 py-3 bg-rose-600 text-white text-lg rounded-lg hover:bg-rose-700 disabled:opacity-50"
              >
                {loading ? 'Finalizing...' : 'Continue to Add n8n Instances'}
              </button>
            </div>
          </div>
        )
      
      default:
        return <div>Step not found</div>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center space-x-3">
            <ChartPieIcon className="h-8 w-8 text-rose-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Elova Setup</h1>
          </div>
          <p className="mt-2 text-gray-600">
            Let's get your workflow monitoring platform configured
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <OnboardingProgressBar 
        steps={steps}
        currentStep={currentStep}
        onStepClick={handleStepClick}
      />

      {/* Step Content */}
      <div className="py-12">
        {renderCurrentStep()}
      </div>
    </div>
  )
}