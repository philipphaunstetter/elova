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
    <div className="flex flex-col w-[250px] h-screen border-r border-slate-200 bg-white sticky top-0 shrink-0">
      {/* Logo & Toggle Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
            {/* Placeholder for Logo */}
            <div className="h-6 w-6 bg-purple-600 rounded-md flex items-center justify-center">
                <span className="text-white font-bold text-xs">E</span>
            </div>
            <span className="font-bold text-slate-900">Elova</span>
        </div>
        <div className="flex gap-1">
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <Sun className="w-4 h-4" />
          </button>
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-2 py-2 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-purple-100 text-purple-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? 'text-purple-700' : 'text-slate-400'}`} />
              {item.name}
            </Link>
          )
        })}
      </div>

      {/* User Area */}
      <div className="p-4 border-t border-slate-100">
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
