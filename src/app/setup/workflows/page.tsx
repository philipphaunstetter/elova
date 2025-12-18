'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSetup } from '@/contexts/SetupContext'

// Step 3: Workflow Selection
export default function WorkflowsPage() {
  const router = useRouter()
  const { isStepAccessible } = useSetup()
  
  // Route guard: redirect if step 2 not completed
  useEffect(() => {
    if (!isStepAccessible(3)) {
      router.push('/setup/connect')
    }
  }, [isStepAccessible, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-2xl">
        {/* UI will be implemented from Figma */}
        <h1 className="text-2xl font-bold mb-4">Workflow Selection</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          Step 3 of 4 - Choose workflows to track
        </p>
        
        {/* Temporary navigation buttons for testing */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => router.push('/setup/connect')}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Back
          </button>
          <button
            onClick={() => router.push('/setup/summary')}
            className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
