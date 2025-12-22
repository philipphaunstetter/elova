'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if form is valid (both fields have values)
  const isFormValid = email.trim() !== '' && password.trim() !== ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Start the login request
      const loginPromise = fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      })

      // Minimum delay to show the animation (2 seconds)
      const delayPromise = new Promise(resolve => setTimeout(resolve, 2000))

      // Wait for both the login and the minimum delay
      const [response] = await Promise.all([loginPromise, delayPromise])
      const result = await response.json()

      if (result.success) {
        router.push('/dashboard')
      } else {
        setError(result.error || 'Login failed')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 min-h-screen relative">
      {/* Header with Logo */}
      <div className="absolute top-0 left-0 w-full px-16 py-12">
        <div className="relative h-[42px] w-[100px]">
          <Image
            src="/elova-brand.svg"
            alt="Elova"
            width={100}
            height={42}
            className="object-contain"
          />
        </div>
      </div>

      {/* Login Form Container - Centered wrapper */}
      <div className="flex items-center justify-center min-h-screen p-[10px]">
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl px-8 py-12 flex flex-col gap-10 min-w-[546px]">
          {/* Title */}
          <div className="flex flex-col gap-0">
            <h1 className="text-2xl font-medium leading-[28.8px] tracking-[-0.5px] text-slate-900 dark:text-slate-100">
              Login
            </h1>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-16">
            {/* Form Fields */}
            <div className="flex flex-col gap-4 w-full">
              {/* Email Field */}
              <div className="flex flex-col gap-[9px]">
                <label className="text-sm leading-[21px] tracking-[0.07px] font-medium text-slate-900 dark:text-slate-100">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) setError(null) // Clear error on input change
                  }}
                  placeholder="admin@example.com"
                  disabled={loading}
                  className={error
                    ? 'bg-white dark:bg-slate-800 border border-red-500 rounded-full px-3 py-[7.5px] min-h-[36px] text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-full px-3 py-[7.5px] min-h-[36px] text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
                  }
                  required
                />
              </div>

              {/* Password Field */}
              <div className="flex flex-col gap-[9px]">
                <label className="text-sm leading-[21px] tracking-[0.07px] font-medium text-slate-900 dark:text-slate-100">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (error) setError(null) // Clear error on input change
                    }}
                    placeholder="Enter your password"
                    disabled={loading}
                    className={error
                      ? 'bg-white dark:bg-slate-800 border border-red-500 rounded-full px-3 py-[7.5px] pr-10 min-h-[36px] text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-red-500 w-full disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-full px-3 py-[7.5px] pr-10 min-h-[36px] text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 w-full disabled:opacity-50 disabled:cursor-not-allowed'
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                
                {/* Error Message - Below Password Field */}
                {error ? (
                  <p className="text-xs leading-4 tracking-[0.18px] text-red-500 text-center break-words">
                    We couldn't log you in. Please check your email and password and try again. You can reset your password{' '}
                    <a href="#" className="underline hover:text-red-600">
                      here
                    </a>
                    .
                  </p>
                ) : (
                  <a
                    href="#"
                    className="text-xs leading-4 tracking-[0.18px] text-slate-500 dark:text-slate-400 underline decoration-solid text-left"
                  >
                    Forgot password?
                  </a>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end w-full">
              <button
                type="submit"
                disabled={loading || !isFormValid}
                className="group flex items-center gap-2 px-4 py-[7.5px] bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-full text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[36px]"
              >
                <span>{loading ? 'Logging In' : 'Log In'}</span>
                {loading ? (
                  <Loader2 className="w-[13.25px] h-[13.25px] animate-spin" />
                ) : (
                  <svg className="w-[13.25px] h-[13.25px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
