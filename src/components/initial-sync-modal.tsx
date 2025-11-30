'use client'

import { useState, useEffect } from 'react'
import { ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

interface InitialSyncModalProps {
  onComplete: () => void
}

export function InitialSyncModal({ onComplete }: InitialSyncModalProps) {
  const [status, setStatus] = useState<'loading' | 'in_progress' | 'completed' | 'failed' | 'unknown'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [mountTime] = useState(Date.now())

  useEffect(() => {
    // Simulate progress animation for better UX
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev
        // Slow down as we get higher
        const increment = prev < 50 ? 5 : prev < 80 ? 2 : 0.5
        return prev + increment
      })
    }, 500)

    return () => clearInterval(progressInterval)
  }, [])

  useEffect(() => {
    let pollInterval: NodeJS.Timeout

    const checkStatus = async () => {
      try {
        const response = await fetch('/api/setup/status')
        if (response.ok) {
          const data = await response.json()
          const syncStatus = data.initialSync?.status

          if (syncStatus === 'completed') {
            setStatus('completed')
            setProgress(100)
            setTimeout(onComplete, 1000) // Small delay to show 100%
          } else if (syncStatus === 'failed') {
            setStatus('failed')
            setErrorMessage(data.initialSync?.error || 'Unknown error occurred during sync')
          } else if (syncStatus === 'in_progress') {
            setStatus('in_progress')
          } else {
            // If unknown or undefined, check if we should show it anyway
            if (data.initDone) {
              // If status is unknown but we just mounted (< 5s ago), assume sync might be starting/propagating
              // and keep showing the loading state (or switch to in_progress)
              const timeSinceMount = Date.now() - mountTime
              
              if (timeSinceMount < 5000) {
                // Give it a chance to report in_progress
                if (status === 'loading') {
                   setStatus('in_progress') // Show modal preventively
                }
              } else {
                // It's been 5 seconds and still unknown? Assume completed.
                setStatus('completed')
                onComplete()
              }
            } else {
              setStatus('unknown')
            }
          }
        }
      } catch (error) {
        console.error('Failed to check sync status:', error)
      }
    }

    // Initial check
    checkStatus()

    // Poll every 2 seconds
    pollInterval = setInterval(checkStatus, 2000)

    return () => clearInterval(pollInterval)
  }, [onComplete])

  if (status === 'unknown') {
    return null
  }

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 text-center">
        {status === 'completed' ? (
          <div className="space-y-4">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Sync Complete!</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Your data is ready.
            </p>
          </div>
        ) : status === 'failed' ? (
          <div className="space-y-4">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Sync Failed</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {errorMessage || 'We encountered an issue while syncing your data.'}
            </p>
            <button
              onClick={onComplete}
              className="inline-flex justify-center rounded-md border border-transparent bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              Continue to Dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="mx-auto w-16 h-16 relative flex items-center justify-center">
              <div className="absolute inset-0 border-4 border-gray-100 dark:border-slate-700 rounded-full"></div>
              <div 
                className="absolute inset-0 border-4 border-rose-600 rounded-full border-t-transparent animate-spin"
              ></div>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Syncing Data...
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                We're fetching your workflow execution history from n8n. This may take a moment.
              </p>
            </div>

            <div className="space-y-1">
              <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-rose-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-right text-gray-400 dark:text-slate-500">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
