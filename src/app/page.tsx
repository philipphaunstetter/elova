'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    // Check setup status and redirect accordingly
    const checkSetup = async () => {
      try {
        const response = await fetch('/api/setup/status')
        const status = await response.json()

        if (!status.initDone) {
          // Setup not complete, redirect to admin setup (skip welcome screen)
          router.replace('/setup/wizard')
        } else {
          // Setup complete, redirect to dashboard
          router.replace('/dashboard')
        }
      } catch (error) {
        console.error('Failed to check setup status:', error)
        // On error, assume setup is needed - go directly to admin setup
        router.replace('/setup/wizard')
      }
    }

    checkSetup()
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}