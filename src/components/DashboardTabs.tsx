'use client'

import { Tab } from '@headlessui/react'
import { Fragment, useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export function DashboardTabs() {
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 })
  const tabsRef = useRef<(HTMLDivElement | null)[]>([])

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
      <div className="relative mb-6">
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
          <div className="p-4 border border-slate-200 rounded-lg border-dashed text-center text-slate-500 text-sm" style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400 }}>
            Insights content coming soon.
          </div>
        </Tab.Panel>
      </Tab.Panels>
    </Tab.Group>
  )
}
