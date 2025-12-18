'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSetup } from '@/contexts/SetupContext'
import { EyeOff, Eye, ChevronRight } from 'lucide-react'
import Image from 'next/image'

// Step 1: Account Creation
export default function AccountPage() {
  const router = useRouter()
  const { setupData, updateSetupData } = useSetup()
  
  const [email, setEmail] = useState(setupData.account?.email || '')
  const [password, setPassword] = useState(setupData.account?.password || '')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handleNext = () => {
    // Save account data to context
    updateSetupData({
      account: {
        email,
        name: email.split('@')[0] || 'Admin',
        password
      }
    })
    router.push('/setup/connect')
  }

  return (
    <div className="bg-white dark:bg-slate-900 min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[546px] border border-slate-200 dark:border-slate-700 rounded-xl px-8 py-12">
        {/* Logo and Header */}
        <div className="flex flex-col gap-16 mb-16">
          <div className="relative h-[42px] w-[100px]">
            <Image
              src="/elova-logo.png"
              alt="Elova"
              width={100}
              height={42}
              className="object-contain"
            />
          </div>
          <h1 className="text-5xl font-light leading-[48px] tracking-tight text-slate-900 dark:text-slate-100">
            Create your<br />Elova Account
          </h1>
        </div>

        {/* Form Fields */}
        <div className="flex flex-col gap-16">
          <div className="flex flex-col gap-4 w-full">
            {/* Email Field */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-900 dark:text-slate-100 tracking-[0.07px]">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#94a3b8] focus:shadow-[0_0_0_3px_#cbd5e1] dark:focus:border-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(148,163,184,0.3)]"
              />
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-900 dark:text-slate-100 tracking-[0.07px]">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a secure password (min. 6 characters)"
                  className="w-full px-3 py-2 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#94a3b8] focus:shadow-[0_0_0_3px_#cbd5e1] dark:focus:border-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(148,163,184,0.3)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password Field */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-900 dark:text-slate-100 tracking-[0.07px]">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="w-full px-3 py-2 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#94a3b8] focus:shadow-[0_0_0_3px_#cbd5e1] dark:focus:border-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(148,163,184,0.3)]"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showConfirmPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Next Button */}
          <div className="flex justify-end">
            <button
              onClick={handleNext}
              disabled={!email || !password || password !== confirmPassword || password.length < 6}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-lg text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
