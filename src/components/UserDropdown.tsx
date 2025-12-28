'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { LogOut, User, Settings, MoreHorizontal, Bell } from 'lucide-react'

interface UserDropdownProps {
  user?: {
    name: string
    email?: string
    image?: string
  }
}

export function UserDropdown({ user }: UserDropdownProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        router.push('/')
      }
    } catch (error) {
      console.error('Logout failed', error)
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="flex items-center justify-between p-4 w-full">
      {/* Avatar */}
      <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
        {user?.image ? (
          <img src={user.image} alt={user.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-slate-600">
            {user?.name?.slice(0, 2).toUpperCase() || 'US'}
          </span>
        )}
      </div>

      {/* Username */}
      <div className="flex-1 px-4">
        <span className="text-sm font-bold text-slate-900">
          {user?.name || 'User'}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1">
        <Menu as="div" className="relative inline-block text-left">
          <Menu.Button className="p-1 rounded hover:bg-slate-100 text-purple-300 hover:text-purple-500 transition-colors">
            <MoreHorizontal className="w-[13px] h-[13px]" />
          </Menu.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute bottom-full right-0 mb-2 w-48 origin-bottom-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
              <div className="px-1 py-1">
                <Menu.Item>
                  {({ active }) => (
                    <button
                      className={`${
                        active ? 'bg-slate-100 text-slate-900' : 'text-slate-900'
                      } group flex w-full items-center rounded-md px-2 py-2 text-sm gap-2`}
                    >
                      <User className="w-4 h-4" />
                      Profile
                    </button>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button
                      className={`${
                        active ? 'bg-slate-100 text-slate-900' : 'text-slate-900'
                      } group flex w-full items-center rounded-md px-2 py-2 text-sm gap-2`}
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                  )}
                </Menu.Item>
              </div>
              <div className="px-1 py-1">
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={handleLogout}
                      disabled={loggingOut}
                      className={`${
                        active ? 'bg-red-50 text-red-900' : 'text-red-700'
                      } group flex w-full items-center rounded-md px-2 py-2 text-sm gap-2`}
                    >
                      <LogOut className="w-4 h-4" />
                      {loggingOut ? 'Logging out...' : 'Log Out'}
                    </button>
                  )}
                </Menu.Item>
              </div>
            </Menu.Items>
          </Transition>
        </Menu>

        <button className="p-1 rounded hover:bg-slate-100 text-purple-300 hover:text-purple-500 transition-colors">
          <Bell className="w-[13px] h-[13px]" />
        </button>
      </div>
    </div>
  )
}
