'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to new setup wizard
    router.replace('/setup/wizard')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to setup wizard...</p>
      </div>
    </div>
  )
}