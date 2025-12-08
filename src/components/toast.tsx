'use client'

import { Fragment, useEffect, useState } from 'react'
import { Transition } from '@headlessui/react'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export interface ToastProps {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  onClose: (id: string) => void
}

const toastStyles = {
  success: 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-700',
  error: 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-700', 
  info: 'bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-rose-700',
  loading: 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700',
}

const iconStyles = {
  success: 'text-green-400',
  error: 'text-red-400',
  info: 'text-rose-400',
  loading: 'text-rose-600 animate-spin',
}

const textStyles = {
  success: 'text-green-800 dark:text-green-300',
  error: 'text-red-800 dark:text-red-300',
  info: 'text-blue-800 dark:text-blue-300',
  loading: 'text-gray-800 dark:text-gray-300',
}

const icons = {
  success: CheckCircleIcon,
  error: ExclamationTriangleIcon,
  info: InformationCircleIcon,
  loading: ArrowPathIcon,
}

export function Toast({ id, type, title, message, duration = 5000, onClose }: ToastProps) {
  const [show, setShow] = useState(true)
  const Icon = icons[type]

  useEffect(() => {
    if (duration === 0) {
      return // Don't auto-dismiss if duration is 0
    }
    
    const timer = setTimeout(() => {
      setShow(false)
      setTimeout(() => onClose(id), 300) // Wait for transition
    }, duration)

    return () => clearTimeout(timer)
  }, [id, duration, onClose])

  return (
    <Transition
      show={show}
      as={Fragment}
      enter="transform ease-out duration-300 transition"
      enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enterTo="translate-y-0 opacity-100 sm:translate-x-0"
      leave="transition ease-in duration-100"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className={`w-full min-w-[320px] max-w-md sm:max-w-lg md:max-w-xl border rounded-lg shadow-lg ${toastStyles[type]}`}>
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <Icon className={`h-6 w-6 ${iconStyles[type]}`} />
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <p className={`text-sm font-medium ${textStyles[type]} leading-5`}>
                {title}
              </p>
              {message && (
                <p className={`mt-1 text-sm ${textStyles[type]} opacity-75 leading-5 whitespace-normal break-words`}>
                  {message}
                </p>
              )}
            </div>
            <div className="ml-4 flex-shrink-0 flex">
              <button
                className={`rounded-md inline-flex cursor-pointer ${textStyles[type]} hover:opacity-75 focus:outline-none`}
                onClick={() => {
                  setShow(false)
                  setTimeout(() => onClose(id), 300)
                }}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  )
}

export interface ToastOptions {
  type: ToastType
  title: string
  message?: string
  duration?: number
}

// Toast container component
export function ToastContainer() {
  const [toasts, setToasts] = useState<(ToastOptions & { id: string })[]>([])

  const addToast = (options: ToastOptions) => {
    const id = Math.random().toString(36).substr(2, 9)
    const toast = { ...options, id }
    setToasts(prev => [...prev, toast])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  // Expose the addToast function globally
  useEffect(() => {
    ;(window as any).showToast = addToast
    return () => {
      delete (window as any).showToast
    }
  }, [])

  return (
    <div className="fixed inset-0 flex items-end justify-center px-4 py-6 pointer-events-none sm:p-6 sm:items-start sm:justify-end z-50">
      <div className="w-full flex flex-col items-center space-y-3 sm:items-end sm:space-y-4">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast {...toast} onClose={removeToast} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Helper function to show toasts
export function showToast(options: ToastOptions) {
  if (typeof window !== 'undefined' && (window as any).showToast) {
    ;(window as any).showToast(options)
  }
}