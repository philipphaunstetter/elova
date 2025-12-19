'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        const response = await fetch('/api/setup/status')
        const status = await response.json()

        if (status.initDone) {
          // Setup is complete, redirect to dashboard
          router.replace('/dashboard')
        } else {
          // Setup required, redirect to setup wizard
          router.replace('/setup')
        }
      } catch (error) {
        console.error('Failed to check setup status:', error)
        // On error, assume setup is required
        router.replace('/setup')
      } finally {
        setChecking(false)
      }
    }

    checkSetupStatus()
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-slate-400">
          {checking ? 'Checking setup status...' : 'Redirecting...'}
        </p>
      </div>
    </div>
  )
}
