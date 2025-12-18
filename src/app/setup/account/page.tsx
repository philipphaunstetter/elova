'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSetup } from '@/contexts/SetupContext'
import { EyeOff, Eye, ChevronRight, BadgeCheck } from 'lucide-react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

// Step 1: Account Creation
export default function AccountPage() {
  const router = useRouter()
  const { setupData, updateSetupData, markStepComplete } = useSetup()
  
  const [email, setEmail] = useState(setupData.account?.email || '')
  const [password, setPassword] = useState(setupData.account?.password || '')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  // Password requirements validation
  const requirements = [
    { label: 'Min 8 Characters', met: password.length >= 8 },
    { label: 'Min 1 upper-case letter', met: /[A-Z]/.test(password) },
    { label: 'Min 1 lower-case letter', met: /[a-z]/.test(password) },
    { label: 'Min 1 number', met: /[0-9]/.test(password) },
    { label: 'Min 1 special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ]

  const metCount = requirements.filter(r => r.met).length
  const showRequirements = passwordFocused || password.length > 0

  const allRequirementsMet = requirements.every(r => r.met)

  const handleNext = () => {
    // Save account data to context
    updateSetupData({
      account: {
        email,
        name: email.split('@')[0] || 'Admin',
        password
      }
    })
    // Mark step 1 as complete
    markStepComplete(1)
    router.push('/setup/connect')
  }

  return (
    <div className="bg-white dark:bg-slate-900 min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[546px] border border-slate-200 dark:border-slate-700 rounded-xl px-8 py-12">
        {/* Logo and Header */}
        <div className="flex flex-col gap-16 mb-16">
          <div className="relative h-[42px] w-[100px]">
            <Image
              src="/elova-brand.svg"
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
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="Enter a secure password (min. 8 characters)"
                  className="w-full px-3 py-2 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#94a3b8] focus:shadow-[0_0_0_3px_#cbd5e1] dark:focus:border-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(148,163,184,0.3)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Requirements */}
              <AnimatePresence>
                {showRequirements && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="flex flex-col gap-2 overflow-hidden"
                  >
                    {/* Strength Bars */}
                    <div className="flex gap-1 w-full">
                      <div className={`flex-1 h-1 rounded-sm transition-colors ${
                        metCount >= 2 ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`} />
                      <div className={`flex-1 h-1 rounded-sm transition-colors ${
                        metCount >= 4 ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`} />
                      <div className={`flex-1 h-1 rounded-sm transition-colors ${
                        metCount === 5 ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`} />
                    </div>

                    {/* Requirements List */}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 max-w-[400px]">
                      {requirements.map((req, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <BadgeCheck
                            className={`w-5 h-5 transition-colors ${
                              req.met
                                ? 'text-green-600 dark:text-green-500'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          />
                          <span
                            className={`text-xs tracking-[0.18px] transition-colors ${
                              req.met
                                ? 'text-green-600 dark:text-green-500'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
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
              disabled={!email || !allRequirementsMet || password !== confirmPassword}
              className="group flex items-center gap-2 px-4 py-2 bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 rounded-lg text-sm font-bold hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <span>Next</span>
              <motion.div
                className="group-hover:translate-x-1 transition-transform duration-200"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </motion.div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
