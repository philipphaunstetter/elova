'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSetup } from '@/contexts/SetupContext'
import { ChevronRight, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { motion } from 'framer-motion'

interface Workflow {
  id: string
  name: string
  isActive: boolean
  tags?: string[]
}

// Step 3: Workflow Selection
export default function WorkflowsPage() {
  const router = useRouter()
  const { setupData, updateSetupData, isStepAccessible, markStepComplete } = useSetup()
  
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(setupData.trackedWorkflowIds || []))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectAll, setSelectAll] = useState(false)
  
  // Route guard: redirect if step 2 not completed
  useEffect(() => {
    if (!isStepAccessible(3)) {
      router.push('/setup/connect')
      return
    }
    
    // Fetch workflows using the saved n8n config
    const fetchWorkflows = async () => {
      if (!setupData.n8nConfig?.url || !setupData.n8nConfig?.apiKey) {
        setError('Missing n8n configuration')
        setLoading(false)
        return
      }
      
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
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to fetch workflows')
        }
        
        const fetchedWorkflows = result.data || []
        setWorkflows(fetchedWorkflows)
        
        console.log('🔍 Workflow page: trackedWorkflowIds from context:', setupData.trackedWorkflowIds)
        console.log('🔍 Workflow page: current selectedIds:', Array.from(selectedIds))
        
        // Auto-select all active workflows ONLY if no previous selection exists
        if (!setupData.trackedWorkflowIds || setupData.trackedWorkflowIds.length === 0) {
          const activeWorkflowIds = fetchedWorkflows
            .filter((wf: Workflow) => wf.isActive)
            .map((wf: Workflow) => wf.id)
          console.log('✅ Auto-selecting active workflows:', activeWorkflowIds)
          setSelectedIds(new Set(activeWorkflowIds))
        } else {
          console.log('ℹ️ Using existing selection from context, not auto-selecting')
        }
      } catch (err) {
        console.error('Failed to fetch workflows:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch workflows')
      } finally {
        setLoading(false)
      }
    }
    
    fetchWorkflows()
  }, [isStepAccessible, router, setupData.n8nConfig])
  
  const handleToggleWorkflow = (workflowId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(workflowId)) {
        newSet.delete(workflowId)
      } else {
        newSet.add(workflowId)
      }
      return newSet
    })
  }
  
  const handleToggleAll = () => {
    if (selectAll) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(workflows.map(w => w.id)))
    }
    setSelectAll(!selectAll)
  }
  
  const handleNext = () => {
    const selectedArray = Array.from(selectedIds)
    console.log('🚀 Workflow page: saving selection:', selectedArray)
    updateSetupData({
      trackedWorkflowIds: selectedArray
    })
    markStepComplete(3)
    router.push('/setup/summary')
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
            Time for Tracking<br />your Data
          </h1>
        </div>

        {/* Form Fields Container */}
        <div className="flex flex-col gap-16">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Loading workflows...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={() => router.push('/setup/connect')}
                className="text-sm text-slate-600 dark:text-slate-400 underline"
              >
                Go back and check connection
              </button>
            </div>
          ) : (
            <>
              {/* Workflow Selection Container */}
              <div className="flex flex-col w-full">
                <div className="flex flex-col px-[2px] w-full">
                  {/* Sticky Header */}
                  <div className="flex gap-[26px] items-center w-full sticky top-0 bg-white dark:bg-slate-900 z-10">
                    <button
                      onClick={handleToggleAll}
                      className="relative shrink-0 w-4 h-4 cursor-pointer"
                    >
                      <div className={`absolute border border-solid rounded-sm transition-colors ${
                        selectAll
                          ? 'bg-[#0f172a] dark:bg-slate-100 border-[#0f172a] dark:border-slate-100'
                          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                      } left-0 w-4 h-4 top-0 shadow-sm`} />
                      {selectAll && (
                        <svg className="absolute left-[2px] top-[2px] w-3 h-3" viewBox="0 0 12 12" fill="none">
                          <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <div className="flex flex-1 gap-2 items-center px-0 py-[7.5px]">
                      <p className="text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100">Workflow</p>
                    </div>
                    <div className="flex gap-2 items-center px-0 py-[7.5px] w-[100px]">
                      <p className="text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100">Status</p>
                    </div>
                  </div>
                  
                  {/* Divider */}
                  <div className="h-px w-full bg-slate-200 dark:bg-slate-700" />
                  
                  {/* Workflow List - Scrollable */}
                  <div className="flex flex-col gap-2 py-4 w-full max-h-[300px] overflow-y-auto">
                    {workflows.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-8">No workflows found</p>
                    ) : (
                      workflows.map((workflow) => {
                        const isChecked = selectedIds.has(workflow.id)
                        return (
                          <div key={workflow.id} className="flex gap-[26px] items-center w-full py-1">
                            <motion.button
                              onClick={() => handleToggleWorkflow(workflow.id)}
                              whileTap={{ scale: 0.85 }}
                              className="relative shrink-0 w-4 h-4 cursor-pointer"
                            >
                              <motion.div
                                animate={isChecked ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className={`absolute border border-solid rounded-sm transition-colors ${
                                  isChecked
                                    ? 'bg-[#0f172a] dark:bg-slate-100 border-[#0f172a] dark:border-slate-100'
                                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                } left-0 w-4 h-4 top-0 shadow-sm`}
                              />
                              {isChecked && (
                                <svg className="absolute left-[2px] top-[2px] w-3 h-3" viewBox="0 0 12 12" fill="none">
                                  <path d="M10 3L4.5 8.5L2 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </motion.button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100 truncate">
                                {workflow.name}
                              </p>
                            </div>
                            <div className="flex items-center w-[100px]">
                              <div className={`flex items-center justify-center min-h-[24px] px-2 py-[3px] rounded-lg ${
                                workflow.isActive
                                  ? 'bg-green-200 dark:bg-green-900'
                                  : 'bg-slate-200 dark:bg-slate-700'
                              }`}>
                                <p className={`text-[12px] leading-4 tracking-[0.18px] whitespace-nowrap font-medium ${
                                  workflow.isActive
                                    ? 'text-green-700 dark:text-green-300'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}>
                                  {workflow.isActive ? 'Active' : 'Inactive'}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button Container */}
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col justify-center text-[12px] leading-4 tracking-[0.18px] text-slate-500 dark:text-slate-400 text-center whitespace-nowrap">
                  <p>{selectedIds.size} Selected</p>
                </div>
                <button
                  onClick={handleNext}
                  disabled={selectedIds.size === 0}
                  className="group flex items-center gap-2 px-4 py-2 bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-lg text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <span>Next</span>
                  <motion.div
                    className="group-hover:translate-x-1 transition-transform duration-200"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
