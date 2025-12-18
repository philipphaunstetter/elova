'use client'

import { useRouter } from 'next/navigation'

// Step 2: Connect n8n Instance
export default function ConnectPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* UI will be implemented from Figma */}
        <h1 className="text-2xl font-bold mb-4">Connect n8n Instance</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-8">
          Step 2 of 4 - Connect to your n8n instance
        </p>
        
        {/* Temporary navigation buttons for testing */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => router.push('/setup/account')}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            Back
          </button>
          <button
            onClick={() => router.push('/setup/workflows')}
            className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
