'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (result.success) {
        // Redirect to root, which will redirect to login if no session
        router.push('/')
      } else {
        throw new Error(result.error || 'Logout failed')
      }
    } catch (error) {
      console.error('Failed to log out:', error)
      alert('Failed to log out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[546px] border border-slate-200 dark:border-slate-700 rounded-xl px-8 py-12">
        <div className="flex flex-col gap-16">
          <h1 className="text-5xl font-light leading-[48px] tracking-tight text-slate-900 dark:text-slate-100">
            Dashboard
          </h1>

          <div className="flex flex-col gap-4">
            <p className="text-base text-slate-500 dark:text-slate-400">
              Dashboard content will be implemented here.
            </p>

            <div className="flex justify-end w-full mt-8">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="group flex items-center gap-2 px-4 py-2 bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-lg text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <span>{loggingOut ? 'Logging out...' : 'Log Out'}</span>
                {loggingOut ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
