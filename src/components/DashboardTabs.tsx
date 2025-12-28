'use client'

import { Tab } from '@headlessui/react'
import { Fragment } from 'react'

export function DashboardTabs() {
  return (
    <Tab.Group>
      <Tab.List className="flex space-x-1 border-b border-gray-200 mb-6">
        <Tab as={Fragment}>
          {({ selected }) => (
            <button
              className={`
                px-4 py-2 text-sm font-medium outline-none
                ${selected ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:text-slate-700'}
              `}
            >
              For you
            </button>
          )}
        </Tab>
        <Tab as={Fragment}>
          {({ selected }) => (
            <button
              className={`
                px-4 py-2 text-sm font-medium outline-none
                ${selected ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:text-slate-700'}
              `}
            >
              Insights
            </button>
          )}
        </Tab>
      </Tab.List>
      <Tab.Panels>
        <Tab.Panel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Activities Card */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-900">Change Log</h3>
                <p className="text-xs text-slate-500">Recent workflow modifications and publish notes.</p>
              </div>
              
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md transition-colors">
                    <div>
                      <p className="text-xs font-medium text-slate-900">Lead Generation 2.0</p>
                      <p className="text-[10px] text-slate-500">11:23 PM</p>
                    </div>
                    <span className="bg-slate-900 text-slate-50 text-[10px] font-bold px-2 py-0.5 rounded">
                      Label
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Tab.Panel>
        <Tab.Panel>
          <div className="p-4 border border-slate-200 rounded-lg border-dashed text-center text-slate-500 text-sm">
            Insights content coming soon.
          </div>
        </Tab.Panel>
      </Tab.Panels>
    </Tab.Group>
  )
}
