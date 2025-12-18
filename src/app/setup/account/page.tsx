'use client'

import { useRouter } from 'next/navigation'

// Step 1: Account Creation
export default function AccountPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* UI will be implemented from Figma */}
        <h1 className="text-2xl font-bold mb-4">Account Creation</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          Step 1 of 4 - Create your admin account
        </p>
        
        {/* Temporary navigation buttons for testing */}
        <div className="flex justify-between mt-8">
          <button
            disabled
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-400 cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={() => router.push('/setup/connect')}
            className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
