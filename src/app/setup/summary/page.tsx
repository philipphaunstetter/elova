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
  const [completing, setCompleting] = useState(false)
  
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
    setCompleting(true)
    
    try {
      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(setupData)
      })

      const result = await response.json()

      if (result.success) {
        // Redirect to dashboard or home
        router.push('/')
      } else {
        throw new Error(result.error || 'Setup completion failed')
      }
    } catch (error) {
      console.error('Failed to complete setup:', error)
      alert('Failed to complete setup. Please try again.')
    } finally {
      setCompleting(false)
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

          {/* Complete Button */}
          <div className="flex justify-end w-full">
            <button
              onClick={handleComplete}
              disabled={completing}
              className="group flex items-center gap-2 px-4 py-2 bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-lg text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {completing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Completing...</span>
                </>
              ) : (
                <>
                  <span>Complete</span>
                  <motion.div
                    className="group-hover:translate-x-1 transition-transform duration-200"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.div>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
