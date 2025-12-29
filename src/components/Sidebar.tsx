'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Workflow, Share2, Sun } from 'lucide-react'
import { UserDropdown } from './UserDropdown'

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const navItems = [
    { name: 'Home', href: '/dashboard', icon: Home, badge: null },
    { name: 'Events', href: '/events', icon: Calendar, badge: null },
    { name: 'Flows', href: '/flows', icon: Workflow, badge: null },
    { name: 'Snaps', href: '/snaps', icon: Share2, badge: 'Beta' },
  ]

  return (
    <div className={`flex flex-col h-screen bg-white sticky top-0 shrink-0 transition-all duration-300 ${
      isCollapsed ? 'w-[75px]' : 'w-[250px]'
    }`}>
      {/* Logo & Toggle Header */}
      <div className="flex flex-col">
        <div className={`flex items-center gap-2 py-4 transition-all duration-300 ${
          isCollapsed ? 'px-2' : 'px-5 justify-between'
        }`}>
          {/* Logo */}
          <div className="relative h-[31.614px]" style={{ width: isCollapsed ? '25.173px' : '75px', transition: 'width 300ms' }}>
            {isCollapsed ? (
              <img 
                src="/elova-icon.svg" 
                alt="Elova" 
                className="w-full h-full object-contain"
              />
            ) : (
              <img 
                src="/elova-brand.svg" 
                alt="Elova" 
                className="w-full h-full object-contain"
              />
            )}
          </div>
          
          {/* Icon Buttons */}
          <div className="flex items-center">
            {!isCollapsed && (
              <button className="flex items-center justify-center min-w-[36px] min-h-[36px] p-2 rounded-lg text-purple-300 hover:text-purple-900 transition-colors cursor-pointer">
                <Sun className="w-[16.25px] h-[16.25px]" />
              </button>
            )}
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center justify-center min-w-[36px] min-h-[36px] p-2 rounded-lg group transition-colors cursor-pointer"
            >
              <img 
                src={isCollapsed ? '/icons/decollapse_sidebar.svg' : '/icons/collapse_sidebar.svg'}
                alt={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="w-[16.25px] h-[16.25px] opacity-50 group-hover:opacity-100 transition-opacity"
              />
            </button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-transparent">
        {/* Hidden divider as per request to remove hidden layers/lines */}
      </div>

      {/* Navigation */}
      <div className={`flex-1 pt-4 flex flex-col gap-2 font-sans transition-all duration-300 ${
        isCollapsed ? 'px-2' : 'px-3'
      }`}>
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center min-h-[32px] text-base leading-6 transition-colors ${
                isActive
                  ? isCollapsed 
                    ? 'bg-purple-100 text-purple-900 rounded-md px-2 justify-center'
                    : 'bg-purple-100 text-purple-900 rounded-full gap-2 px-2'
                  : isCollapsed
                    ? 'text-purple-900 hover:bg-slate-50 rounded-md px-2 justify-center'
                    : 'text-purple-900 hover:bg-slate-50 rounded-full gap-2 px-2'
              }`}
              style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 400 }}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className="w-5 h-5 text-purple-900" />
              {!isCollapsed && (
                <>
                  <span>{item.name}</span>
                  {item.badge && (
                    <span 
                      className="bg-purple-100 text-purple-900 text-xs leading-4 px-2 py-[3px] rounded-lg ml-auto"
                      style={{ fontFamily: 'var(--font-match-variable)', fontWeight: 700, letterSpacing: '0.18px' }}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </div>

      {/* User Area */}
      {isCollapsed ? (
        <div className="flex items-center justify-center p-4">
          <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
            <span className="text-sm font-bold text-slate-600">MM</span>
          </div>
        </div>
      ) : (
        <div>
          <UserDropdown
            user={{
              name: 'Max Mustermann', // Placeholder, ideally fetch from context
              image: '' 
            }}
          />
        </div>
      )}
    </div>
  )
}
