'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSetup } from '@/contexts/SetupContext'

// Step 4: Final Setup Overview/Summary
export default function SummaryPage() {
  const router = useRouter()
  const { isStepAccessible } = useSetup()
  
  // Route guard: redirect if step 3 not completed
  useEffect(() => {
    if (!isStepAccessible(4)) {
      router.push('/setup/workflows')
    }
  }, [isStepAccessible, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* UI will be implemented from Figma */}
        <h1 className="text-2xl font-bold mb-4">Setup Summary</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          Step 4 of 4 - Review and complete setup
        </p>
        
        {/* Temporary navigation buttons for testing */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => router.push('/setup/workflows')}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Back
          </button>
          <button
            onClick={() => alert('Setup complete! Will call /api/setup/complete')}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Finish Setup
          </button>
        </div>
      </div>
    </div>
  )
}
