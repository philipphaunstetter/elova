'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSetup } from '@/contexts/SetupContext'
import { EyeOff, Eye, ChevronRight, Loader2, Check, X } from 'lucide-react'
import Image from 'next/image'
import { motion } from 'framer-motion'

// Step 2: Connect n8n Instance
export default function ConnectPage() {
  const router = useRouter()
  const { setupData, updateSetupData, isStepAccessible, markStepComplete } = useSetup()
  
  // Route guard: redirect if step 1 not completed
  useEffect(() => {
    if (!isStepAccessible(2)) {
      router.push('/setup/account')
    }
  }, [isStepAccessible, router])
  
  const [name, setName] = useState(setupData.n8nConfig?.name || '')
  const [url, setUrl] = useState(setupData.n8nConfig?.url || '')
  const [apiKey, setApiKey] = useState(setupData.n8nConfig?.apiKey || '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')

  const handleTestConnection = async () => {
    // Save to context first
    updateSetupData({
      n8nConfig: {
        name: name || undefined,
        url,
        apiKey
      }
    })
    
    setConnectionStatus('testing')
    const startTime = Date.now()
    
    try {
      const response = await fetch('/api/setup/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          apiKey
        })
      })
      
      const result = await response.json()
      
      // Ensure minimum 5 second delay
      const elapsed = Date.now() - startTime
      const remainingTime = Math.max(0, 5000 - elapsed)
      
      await new Promise(resolve => setTimeout(resolve, remainingTime))
      
      if (result.success) {
        setConnectionStatus('success')
        // Auto-navigate to next step after showing success
        setTimeout(() => {
          handleNext()
        }, 1500)
      } else {
        setConnectionStatus('error')
        console.error('Connection test failed:', result.error)
      }
    } catch (error) {
      // Ensure minimum 5 second delay even on error
      const elapsed = Date.now() - startTime
      const remainingTime = Math.max(0, 5000 - elapsed)
      await new Promise(resolve => setTimeout(resolve, remainingTime))
      
      setConnectionStatus('error')
      console.error('Connection test error:', error)
    }
  }

  const handleNext = () => {
    updateSetupData({
      n8nConfig: {
        name: name || undefined,
        url,
        apiKey
      }
    })
    // Mark step 2 as complete
    markStepComplete(2)
    router.push('/setup/workflows')
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
            Connect your<br />Instance
          </h1>
        </div>

        {/* Form Fields */}
        <div className="flex flex-col gap-16">
          <div className="flex flex-col gap-4 w-full">
            {/* Instance Name Field (Optional) */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-900 dark:text-slate-100 tracking-[0.07px]">
                Instance Name (Optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production n8n"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-full text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#94a3b8] focus:shadow-[0_0_0_3px_#cbd5e1] dark:focus:border-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(148,163,184,0.3)]"
              />
            </div>

            {/* n8n Instance URL Field */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-slate-900 dark:text-slate-100 tracking-[0.07px]">
                n8n Instance URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (connectionStatus === 'error' || connectionStatus === 'success') {
                    setConnectionStatus('idle')
                  }
                }}
                placeholder="https://your-n8n-instance.com"
                className={`w-full px-3 py-2 border rounded-full text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none ${
                  connectionStatus === 'error'
                    ? 'border-red-500'
                    : 'border-slate-200 dark:border-slate-700 focus:border-[#94a3b8] focus:shadow-[0_0_0_3px_#cbd5e1] dark:focus:border-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(148,163,184,0.3)]'
                }`}
              />
            </div>

            {/* API Key Field */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-900 dark:text-slate-100 tracking-[0.07px]">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    if (connectionStatus === 'error' || connectionStatus === 'success') {
                      setConnectionStatus('idle')
                    }
                  }}
                  placeholder="Enter your n8n API key"
                  className={`w-full px-3 py-2 pr-10 border rounded-full text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none ${
                    connectionStatus === 'error'
                      ? 'border-red-500'
                      : 'border-slate-200 dark:border-slate-700 focus:border-[#94a3b8] focus:shadow-[0_0_0_3px_#cbd5e1] dark:focus:border-slate-500 dark:focus:shadow-[0_0_0_3px_rgba(148,163,184,0.3)]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                >
                  {showApiKey ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Test Connection Button */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {connectionStatus === 'error' && (
                <p className="text-xs text-red-500 tracking-[0.18px]">
                  Please check your settings and try again.
                </p>
              )}
            </div>
            <button
              onClick={handleTestConnection}
              disabled={!url || !apiKey || connectionStatus === 'testing'}
              className={`group flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                connectionStatus === 'testing'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 cursor-not-allowed'
                  : connectionStatus === 'success'
                  ? 'bg-green-600 text-white cursor-default'
                  : connectionStatus === 'error'
                  ? 'bg-red-600 text-white cursor-pointer hover:bg-red-700'
                  : 'bg-[#0f172a] dark:bg-slate-100 text-[#f8fafc] dark:text-slate-900 hover:bg-[#1e293b] dark:hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
              }`}
            >
              <span>
                {connectionStatus === 'testing' 
                  ? 'Testing' 
                  : connectionStatus === 'success'
                  ? 'Successful'
                  : connectionStatus === 'error'
                  ? 'Failed'
                  : 'Test Connection'
                }
              </span>
              {connectionStatus === 'testing' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : connectionStatus === 'success' ? (
                <Check className="w-3.5 h-3.5" />
              ) : connectionStatus === 'error' ? (
                <X className="w-3.5 h-3.5" />
              ) : (
                <motion.div
                  className="group-hover:translate-x-1 transition-transform duration-200"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </motion.div>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
