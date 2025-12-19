'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronRight, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
      })

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

      {/* Login Form Container */}
      <div className="flex items-center justify-center min-h-screen pt-[293px]">
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl px-8 pt-12 pb-12 flex flex-col gap-10 max-w-[546px] w-full">
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
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-[7.5px] min-h-[36px] text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
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
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-[7.5px] pr-10 min-h-[36px] text-sm leading-[21px] tracking-[0.07px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100 w-full"
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
                <a
                  href="#"
                  className="text-xs leading-4 tracking-[0.18px] text-slate-500 dark:text-slate-400 underline decoration-solid text-left"
                >
                  Forgot password?
                </a>
              </div>

              {/* Error Message */}
              {error && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end w-full">
              <button
                type="submit"
                disabled={loading}
                className="group flex items-center gap-2 px-4 py-[7.5px] bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-lg text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[36px]"
              >
                <span>Log In</span>
                <ChevronRight className="w-[13.25px] h-[13.25px]" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
