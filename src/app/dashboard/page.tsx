'use client'

import { Home } from 'lucide-react'
import { DashboardTabs } from '@/components/DashboardTabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function DashboardPage() {
  return (
    <TooltipProvider>
      <div className="p-12 w-full">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <button className="p-2 rounded-lg hover:bg-slate-100 cursor-pointer">
              <Home className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          
          {/* Progress Example with Tooltip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-pointer">
                <span className="text-sm leading-[21px] text-[#64748b]" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 500, letterSpacing: '0.07px' }}>$ 232.23</span>
                <div className="w-[200px] h-1 bg-purple-100 rounded-xl overflow-hidden relative">
                  <div className="absolute top-0 left-0 h-full w-1/4 bg-purple-900 rounded-xl" />
                </div>
                <span className="text-sm leading-[21px] text-[#64748b]" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 500, letterSpacing: '0.07px' }}>$ 500</span>
              </div>
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              className="bg-white text-slate-900 shadow-lg border border-slate-200 rounded-lg px-3 py-2 text-xs"
            >
              {/* Placeholder - content to be added later */}
              <p>Tooltip content</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-3xl text-purple-900 tracking-tight mb-2" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 500 }}>
            Up late, Max. ✌
          </h1>
          <p className="text-slate-500" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400 }}>
            Here's what's been happening.
          </p>
        </div>

        {/* Tabs & Content */}
        <DashboardTabs />
      </div>
    </TooltipProvider>
  )
}
