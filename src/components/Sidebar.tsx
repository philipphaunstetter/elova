'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Workflow, Share2, Sun, PanelLeftClose } from 'lucide-react'
import { UserDropdown } from './UserDropdown'

export function Sidebar() {
  const pathname = usePathname()

  const navItems = [
    { name: 'Home', href: '/dashboard', icon: Home },
    { name: 'Events', href: '/dashboard/events', icon: Calendar },
    { name: 'Flows', href: '/dashboard/flows', icon: Workflow },
    { name: 'Snaps', href: '/dashboard/snaps', icon: Share2 },
  ]

  return (
    <div className="flex flex-col w-[250px] h-screen bg-white sticky top-0 shrink-0">
      {/* Logo & Toggle Header */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4">
          {/* Logo */}
          <div className="w-[60px] h-[25.3px] relative">
            <img 
              src="/elova-brand.svg" 
              alt="Elova" 
              className="w-full h-full object-contain"
            />
          </div>
          
          {/* Icon Buttons */}
          <div className="flex gap-1 items-center">
            <button className="flex items-center justify-center min-w-[24px] min-h-[24px] p-1 rounded hover:bg-slate-100 text-purple-300 hover:text-purple-500 transition-colors">
              <Sun className="w-[13.25px] h-[13.25px]" />
            </button>
            <button className="flex items-center justify-center min-w-[24px] min-h-[24px] p-1 rounded hover:bg-slate-100 text-purple-300 hover:text-purple-500 transition-colors">
              <PanelLeftClose className="w-[13.25px] h-[13.25px]" />
            </button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-transparent">
        {/* Hidden divider as per request to remove hidden layers/lines */}
      </div>

      {/* Navigation */}
      <div className="flex-1 px-2 pt-4 flex flex-col font-sans">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-2 min-h-[32px] px-2 text-sm transition-colors ${
                isActive
                  ? 'bg-purple-100 text-purple-900 rounded-full'
                  : 'text-purple-900 hover:bg-slate-50 rounded-md'
              }`}
            >
              <item.icon className="w-5 h-5 text-purple-900" />
              {item.name}
            </Link>
          )
        })}
      </div>

      {/* User Area */}
      <div className="border-t border-transparent">
        <UserDropdown 
          user={{
            name: 'Max Mustermann', // Placeholder, ideally fetch from context
            image: '' 
          }}
        />
      </div>
    </div>
  )
}
