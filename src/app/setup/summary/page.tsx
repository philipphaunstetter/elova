'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSetup } from '@/contexts/SetupContext'
import { ChevronRight, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface Workflow {
  id: string
  name: string
}

// Step 4: Final Setup Overview/Summary
export default function SummaryPage() {
  const router = useRouter()
  const { setupData, isStepAccessible } = useSetup()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'completed' | 'error'>('idle')
  const [loggingIn, setLoggingIn] = useState(false)
  
  // Route guard: redirect if step 3 not completed
  useEffect(() => {
    if (!isStepAccessible(4)) {
      router.push('/setup/workflows')
      return
    }

    // Fetch workflow names for the selected IDs
    const fetchWorkflowNames = async () => {
      if (!setupData.n8nConfig?.url || !setupData.n8nConfig?.apiKey || !setupData.trackedWorkflowIds?.length) {
        return
      }

      setLoading(true)
      try {
        const response = await fetch('/api/onboarding/workflows', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: setupData.n8nConfig.url,
            apiKey: setupData.n8nConfig.apiKey
          })
        })

        const result = await response.json()
        if (result.success && result.data) {
          // Filter to only selected workflows
          const selectedWorkflows = result.data.filter((wf: any) => 
            setupData.trackedWorkflowIds?.includes(wf.id)
          )
          setWorkflows(selectedWorkflows)
        }
      } catch (error) {
        console.error('Failed to fetch workflow names:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchWorkflowNames()
  }, [isStepAccessible, router, setupData.n8nConfig, setupData.trackedWorkflowIds])

  const handleComplete = async () => {
    setSyncStatus('syncing')
    
    try {
      // Call setup complete which triggers initial sync in background
      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          adminData: setupData.account,
          n8nConfig: setupData.n8nConfig,
          trackedWorkflowIds: setupData.trackedWorkflowIds,
          configuration: setupData.configuration
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Setup completion failed')
      }

      // Start polling sync status
      pollSyncStatus()
    } catch (error) {
      console.error('Failed to complete setup:', error)
      setSyncStatus('error')
    }
  }

  const pollSyncStatus = async () => {
    const maxAttempts = 120 // Poll for up to 2 minutes (2s intervals)
    let attempts = 0
    let shouldContinue = true

    const poll = async () => {
      if (!shouldContinue) return

      try {
        const response = await fetch('/api/setup/status')
        const status = await response.json()

        console.log('Sync status poll:', status.initialSync?.status)

        if (status.initialSync?.status === 'completed') {
          setSyncStatus('completed')
          shouldContinue = false
          return
        } else if (status.initialSync?.status === 'failed') {
          setSyncStatus('error')
          shouldContinue = false
          return
        }

        // Continue polling if still in progress
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000) // Poll every 2 seconds
        } else {
          // Timeout - assume completed anyway
          console.warn('Sync polling timeout after', attempts, 'attempts')
          setSyncStatus('completed')
          shouldContinue = false
        }
      } catch (error) {
        console.error('Failed to poll sync status:', error)
        // On error, retry
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000)
        } else {
          setSyncStatus('error')
          shouldContinue = false
        }
      }
    }

    poll()
  }

  const handleLogin = async () => {
    setLoggingIn(true)

    try {
      // Create session with the admin credentials
      const response = await fetch('/api/auth/setup-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: setupData.account?.email,
          password: setupData.account?.password
        })
      })

      const result = await response.json()

      if (result.success) {
        // Redirect to dashboard
        router.push('/dashboard')
      } else {
        throw new Error(result.error || 'Login failed')
      }
    } catch (error) {
      console.error('Failed to log in:', error)
      alert('Failed to log in. Please try again.')
    } finally {
      setLoggingIn(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[546px] border border-slate-200 dark:border-slate-700 rounded-xl px-8 py-12">
        {/* Logo and Header */}
        <div className="flex flex-col gap-16 mb-16">
          <div className="relative h-[42px] w-[100px]">
            <Image
              src="/elova-brand.svg"
              alt="Elova"
              width={100}
              height={42}
              className="object-contain"
            />
          </div>
          <h1 className="text-5xl font-light leading-[48px] tracking-tight text-slate-900 dark:text-slate-100">
            Your Elova<br />Setup Summary
          </h1>
        </div>

        {/* Summary Content */}
        <div className="flex flex-col gap-16">
          <div className="flex flex-col gap-[10px]">
            {/* Account and Workflows Row */}
            <div className="flex gap-16">
              {/* Account Section */}
              <div className="flex flex-col gap-[9px] min-w-[250px]">
                <p className="text-sm font-medium leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100">
                  Account
                </p>
                <p className="text-base leading-6 text-slate-500 dark:text-slate-400">
                  {setupData.account?.email || 'N/A'}
                </p>
              </div>

              {/* Workflows Section */}
              <div className="flex flex-col gap-[9px] flex-1">
                <p className="text-sm font-medium leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100">
                  Workflows
                </p>
                <p className="text-base leading-6 text-slate-500 dark:text-slate-400">
                  Tracking{' '}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="underline decoration-solid cursor-help">
                          {setupData.trackedWorkflowIds?.length || 0}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        {loading ? (
                          <p className="text-xs">Loading workflow names...</p>
                        ) : workflows.length > 0 ? (
                          <ul className="text-xs space-y-1">
                            {workflows.map((wf) => (
                              <li key={wf.id}>• {wf.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs">No workflows selected</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {' '}Workflows
                </p>
              </div>
            </div>

            {/* Instance Section */}
            <div className="flex flex-col gap-[9px] w-full">
              <p className="text-sm font-medium leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100">
                Instance{setupData.n8nConfig?.name ? ` (${setupData.n8nConfig.name})` : ''}
              </p>
              <p className="text-base leading-6 text-slate-500 dark:text-slate-400">
                {setupData.n8nConfig?.url || 'N/A'}
              </p>
            </div>
          </div>

          {/* Complete / Log In Button */}
          <div className="flex justify-end w-full">
            {syncStatus === 'completed' ? (
              <button
                onClick={handleLogin}
                disabled={loggingIn}
                className="group flex items-center gap-2 px-4 py-2 bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-lg text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <span>{loggingIn ? 'Logging in...' : 'Log In'}</span>
                {loggingIn ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                )}
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={syncStatus === 'syncing'}
                className={`group flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                  syncStatus === 'syncing'
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 cursor-not-allowed'
                    : syncStatus === 'error'
                    ? 'bg-red-600 text-white cursor-pointer hover:bg-red-700'
                    : 'bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 hover:bg-[#1e293b] dark:hover:bg-slate-200 cursor-pointer'
                }`}
              >
                <span>
                  {syncStatus === 'syncing'
                    ? 'Syncing'
                    : syncStatus === 'error'
                    ? 'Failed'
                    : 'Complete'
                  }
                </span>
                {syncStatus === 'syncing' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : syncStatus === 'error' ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <motion.div
                    className="group-hover:translate-x-1 transition-transform duration-200"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.div>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
