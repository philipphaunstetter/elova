'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { ChartPieIcon } from '@heroicons/react/24/outline'

export default function SignUp() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.push('/dashboard')
    }
  }, [user, router])

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex justify-center">
          <div className="flex items-center space-x-2">
            <ChartPieIcon className="h-8 w-8 text-rose-600" />
            <span className="text-xl font-bold text-gray-900">Elova</span>
          </div>
        </Link>
        <h2 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-slate-400">
          Start monitoring your workflow automation across all platforms
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-[480px]">
        <div className="bg-white px-6 py-12 shadow sm:rounded-lg sm:px-12">
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Sign up functionality is not available in development mode.</p>
            <p className="text-sm text-gray-500 dark:text-slate-400">Please use the sign in page with any credentials.</p>
          </div>
          
          <p className="mt-6 text-center text-sm text-gray-500 dark:text-slate-400">
            Already have an account?{' '}
            <Link href="/auth/signin" className="font-semibold leading-6 text-rose-600 hover:text-rose-500">
              Sign in
            </Link>
          </p>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            By creating an account, you agree to our{' '}
            <a href="#" className="underline">Terms of Service</a> and{' '}
            <a href="#" className="underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}