'use client'

import { Home } from 'lucide-react'
import { DashboardTabs } from '@/components/DashboardTabs'

export default function DashboardPage() {
  return (
    <div className="p-12 w-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <button className="p-2 rounded-lg hover:bg-slate-100">
            <Home className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        
        {/* Progress Example */}
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-slate-500 tracking-wide">$ 232.23</span>
          <div className="w-[200px] h-1 bg-purple-100 rounded-full overflow-hidden relative">
            <div className="absolute top-0 left-0 h-full w-1/4 bg-purple-800 rounded-full" />
          </div>
          <span className="text-xs font-medium text-slate-500 tracking-wide">$ 500</span>
        </div>
      </div>

      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-medium text-purple-900 tracking-tight mb-2">
          Up late, Max. ✌
        </h1>
        <p className="text-slate-500">
          Here's what's been happening.
        </p>
      </div>

      {/* Tabs & Content */}
      <DashboardTabs />
    </div>
  )
}
