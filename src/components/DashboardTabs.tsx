'use client'

import { Tab } from '@headlessui/react'
import { Fragment, useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, TicketCheck, OctagonAlert, Bot, ChevronDown } from 'lucide-react'

export function DashboardTabs() {
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })
  const [timePeriod, setTimePeriod] = useState('Last 30 Days')
  const tabsRef = useRef<(HTMLDivElement | null)[]>([])
  
  const timePeriodOptions = [
    'Last Hour',
    'Last 24 Hours',
    'Last 7 Days',
    'Last 30 Days',
    'Last 90 Days',
    'All Time'
  ]

  const updateUnderline = (index: number) => {
    const tab = tabsRef.current[index]
    if (tab) {
      setUnderlineStyle({
        left: tab.offsetLeft,
        width: tab.offsetWidth
      })
    }
  }

  useEffect(() => {
    // Initialize underline position on mount
    updateUnderline(0)
  }, [])

  return (
    <Tab.Group onChange={updateUnderline}>
      {({ selectedIndex }) => (
        <>
          <div className="relative mb-6">
            <div className="flex items-center justify-between">
              <Tab.List className="flex gap-0">
          <Tab as={Fragment}>
            {({ selected }) => (
              <div 
                ref={(el) => { tabsRef.current[0] = el }}
                className="flex flex-col items-start p-2.5"
              >
                <button
                  className={`
                    text-sm outline-none cursor-pointer
                    ${selected ? 'text-slate-900' : 'text-slate-400'}
                  `}
                  style={{ fontFamily: 'var(--font-match-variable)', fontWeight: selected ? 500 : 400 }}
                >
                  For you
                </button>
              </div>
            )}
          </Tab>
          <Tab as={Fragment}>
            {({ selected }) => (
              <div 
                ref={(el) => { tabsRef.current[1] = el }}
                className="flex flex-col items-start p-2.5"
              >
                <button
                  className={`
                    text-sm outline-none cursor-pointer
                    ${selected ? 'text-slate-900' : 'text-slate-400'}
                  `}
                  style={{ fontFamily: 'var(--font-match-variable)', fontWeight: selected ? 500 : 400 }}
                >
                  Insights
                </button>
              </div>
            )}
          </Tab>
              </Tab.List>
              
              {/* Time Period Selector - Only show when Insights tab is active */}
              {selectedIndex === 1 && (
                <div className="relative">
                  <select
                    value={timePeriod}
                    onChange={(e) => setTimePeriod(e.target.value)}
                    className="appearance-none flex items-center gap-1 cursor-pointer bg-transparent border-none outline-none pr-5 text-sm leading-[21px] text-[#0a0a0a]"
                    style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.07px' }}
                  >
                    {timePeriodOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#0a0a0a] absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}
            </div>
            
            {/* Animated underline */}
            <motion.div
              className="absolute bottom-0 h-[1px] bg-slate-900"
              initial={false}
              animate={{
                left: underlineStyle.left,
                width: underlineStyle.width
              }}
              transition={{
                type: 'spring',
                stiffness: 500,
                damping: 30
              }}
            />
          </div>
          <Tab.Panels>
        <Tab.Panel>
          <div className="flex flex-col gap-6 w-full">
            {/* Recent Activities Card */}
            <div className="border border-slate-200 rounded-lg p-4 w-[350px] min-w-[350px]">
              <div className="mb-4">
                <h3 className="text-base leading-6 text-black" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0px' }}>Change Log</h3>
                <p className="text-sm leading-[21px] text-[#64748b]" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.07px' }}>Recent workflow modifications and publish notes.</p>
              </div>
              
              <div className="flex flex-col gap-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col">
                      <p className="text-sm leading-[21px] text-[#020617]" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.07px' }}>Lead Generation 2.0</p>
                      <p className="text-xs leading-4 text-[#64748b]" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.18px' }}>11:23 PM</p>
                    </div>
                    <span className="bg-[#0f172a] text-[#f8fafc] text-sm leading-[21px] min-h-[24px] px-2 py-[3px] rounded-lg" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 700, letterSpacing: '0.07px' }}>
                      Label
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Tab.Panel>
            <Tab.Panel>
              <div className="flex gap-4 items-start w-full">
              {/* Success Rate Card */}
              <div className="bg-white border border-[#cbd5e1] rounded-lg shadow-[0px_1px_0px_0px_rgba(0,0,0,0.05)] px-6 py-8 flex flex-col gap-2.5 min-w-[200px] flex-shrink-0">
                <div className="flex items-center gap-1">
                  <div className="p-1 rounded">
                    <CheckCircle2 className="w-[13.25px] h-[13.25px] text-purple-900" />
                  </div>
                  <p 
                    className="text-sm leading-[21px] text-[#581c87]" 
                    style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.07px' }}
                  >
                    Success Rate
                  </p>
                </div>
                <p 
                  className="text-[30px] leading-[30px] tracking-[-0.5px] text-[#6b21a8]" 
                  style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 500 }}
                >
                  95%
                </p>
              </div>

              {/* Total Events Card */}
              <div className="bg-white border border-[#cbd5e1] rounded-lg shadow-[0px_1px_0px_0px_rgba(0,0,0,0.05)] px-6 py-8 flex flex-col gap-2.5 min-w-[200px] flex-shrink-0">
                <div className="flex items-center gap-1">
                  <div className="p-1 rounded">
                    <TicketCheck className="w-[13.25px] h-[13.25px] text-purple-900" />
                  </div>
                  <p 
                    className="text-sm leading-[21px] text-[#581c87]" 
                    style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.07px' }}
                  >
                    Total Events
                  </p>
                </div>
                <p 
                  className="text-[30px] leading-[30px] tracking-[-0.5px] text-[#6b21a8]" 
                  style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 500 }}
                >
                  85K
                </p>
              </div>

              {/* Failed Events Card */}
              <div className="bg-white border border-[#cbd5e1] rounded-lg shadow-[0px_1px_0px_0px_rgba(0,0,0,0.05)] px-6 py-8 flex flex-col gap-2.5 min-w-[200px] flex-shrink-0">
                <div className="flex items-center gap-1">
                  <div className="p-1 rounded">
                    <OctagonAlert className="w-[13.25px] h-[13.25px] text-purple-900" />
                  </div>
                  <p 
                    className="text-sm leading-[21px] text-[#581c87]" 
                    style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.07px' }}
                  >
                    Failed Events
                  </p>
                </div>
                <p 
                  className="text-[30px] leading-[30px] tracking-[-0.5px] text-[#6b21a8]" 
                  style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 500 }}
                >
                  125
                </p>
              </div>

              {/* AI Costs Card */}
              <div className="bg-white border border-[#cbd5e1] rounded-lg shadow-[0px_1px_0px_0px_rgba(0,0,0,0.05)] px-6 py-8 flex flex-col gap-2.5 min-w-[200px] flex-1">
                <div className="flex items-center gap-1">
                  <div className="p-1 rounded">
                    <Bot className="w-[13.25px] h-[13.25px] text-purple-900" />
                  </div>
                  <p 
                    className="text-sm leading-[21px] text-[#581c87]" 
                    style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400, letterSpacing: '0.07px' }}
                  >
                    AI Costs
                  </p>
                </div>
                <p 
                  className="text-[30px] leading-[30px] tracking-[-0.5px] text-[#6b21a8]" 
                  style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 500 }}
                >
                  0.52 $
                </p>
              </div>
            </Tab.Panel>
          </Tab.Panels>
        </>
      )}
    </Tab.Group>
  )
}
