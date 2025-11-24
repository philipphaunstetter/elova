'use client'

import { useEffect, useState } from 'react'
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

interface SyncStatus {
    status: 'not_started' | 'in_progress' | 'completed' | 'failed'
    startedAt?: string
    completedAt?: string
    error?: string
    isComplete: boolean
    inProgress: boolean
}

export function InitialSyncModal() {
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        checkSyncStatus()

        // Poll every 2 seconds while sync is in progress
        const interval = setInterval(() => {
            if (syncStatus?.inProgress) {
                checkSyncStatus()
            }
        }, 2000)

        return () => clearInterval(interval)
    }, [syncStatus?.inProgress])

    const checkSyncStatus = async () => {
        try {
            const response = await fetch('/api/sync/status', { cache: 'no-store' })
            const data: SyncStatus = await response.json()

            setSyncStatus(data)

            // Show modal if sync is in progress
            setShowModal(data.inProgress)
        } catch (error) {
            console.error('Failed to check sync status:', error)
        }
    }

    if (!showModal || !syncStatus) {
        return null
    }

    return (
        <div className="fixed inset-0 bg-gray-100/80 dark:bg-slate-900/80 flex items-center justify-center z-50 backdrop-blur-md transition-all duration-300">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
                <div className="text-center">
                    {/* Animated Icon */}
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900 mb-4">
                        {syncStatus.status === 'in_progress' && (
                            <ArrowPathIcon className="h-8 w-8 text-rose-600 dark:text-rose-400 animate-spin" />
                        )}
                        {syncStatus.status === 'completed' && (
                            <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                        )}
                        {syncStatus.status === 'failed' && (
                            <XCircleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
                        )}
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {syncStatus.status === 'in_progress' && 'Syncing Your Data'}
                        {syncStatus.status === 'completed' && 'Sync Complete!'}
                        {syncStatus.status === 'failed' && 'Sync Failed'}
                    </h3>

                    {/* Message */}
                    <p className="text-sm text-gray-600 dark:text-slate-400 mb-6">
                        {syncStatus.status === 'in_progress' && (
                            <>
                                We're importing your workflows and executions from n8n.
                                <br />
                                This may take a few moments...
                            </>
                        )}
                        {syncStatus.status === 'completed' && 'Your data has been successfully imported!'}
                        {syncStatus.status === 'failed' && (
                            <>
                                {syncStatus.error || 'An error occurred during sync.'}
                                <br />
                                <span className="text-xs">You can retry from the settings page.</span>
                            </>
                        )}
                    </p>

                    {/* Progress Indicator */}
                    {syncStatus.status === 'in_progress' && (
                        <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2 mb-4 overflow-hidden">
                            <div className="bg-rose-600 dark:bg-rose-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
                        </div>
                    )}

                    {/* Action Button (only for failed state) */}
                    {syncStatus.status === 'failed' && (
                        <button
                            onClick={() => setShowModal(false)}
                            className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors"
                        >
                            Continue Anyway
                        </button>
                    )}

                    {/* Info Text */}
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-4">
                        {syncStatus.status === 'in_progress' && 'Please do not close this window'}
                    </p>
                </div>
            </div>
        </div>
    )
}
