'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { SidebarLayout } from './sidebar-layout'
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem,
  SidebarSection,
  SidebarFooter,
  SidebarHeading,
  SidebarLabel
} from './sidebar'
import {
  DashboardIcon,
  ExecutionsIcon,
  WorkflowsIcon,
  AnalyticsIcon,
  MonitorsIcon,
  HistoryIcon,
  SettingsIcon,
  ProfileIcon,
  ToolsIcon
} from './icons'
import { ServerIcon, ClockIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from './navbar'
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from './dropdown'
import { Avatar } from './avatar'
import { ToastContainer } from './toast'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: DashboardIcon, current: true },
  { name: 'Executions', href: '/executions', icon: ExecutionsIcon, current: false },
  { name: 'Workflows', href: '/workflows', icon: WorkflowsIcon, current: false },
  { name: 'Cron Jobs', href: '/cron-jobs', icon: ClockIcon, current: false },
  { name: 'n8n Instances', href: '/providers', icon: ServerIcon, current: false },
  { name: 'Analytics', href: '/analytics', icon: AnalyticsIcon, current: false },
  { name: 'Monitors', href: '/monitors', icon: MonitorsIcon, current: false },
]

function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center space-x-2">
          <DashboardIcon className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          <span className="text-lg font-semibold text-zinc-900 dark:text-white">
            Elova
          </span>
        </div>
      </SidebarHeader>

      <SidebarBody>
        <SidebarSection>
          <SidebarHeading>Navigation</SidebarHeading>
          {navigation.map((item) => (
            <SidebarItem
              key={item.name}
              href={item.href}
              current={pathname === item.href}
            >
              <item.icon data-slot="icon" />
              <SidebarLabel>{item.name}</SidebarLabel>
            </SidebarItem>
          ))}
        </SidebarSection>
      </SidebarBody>

      <SidebarFooter>
        <UserProfileSection />
      </SidebarFooter>
    </Sidebar>
  )
}

function UserProfileSection() {
  const { user, signOut } = useAuth()

  if (!user) return null

  const userEmail = (user as any).email || (user as any).name || 'User'
  const userName = (user as any).name || userEmail.split('@')[0] || 'User'

  return (
    <Dropdown>
      <DropdownButton as={SidebarItem}>
        <Avatar src="" />
        <SidebarLabel className="flex flex-col items-start">
          <span className="text-sm font-medium">{userName}</span>
          <span className="text-xs text-gray-500">{userEmail}</span>
        </SidebarLabel>
      </DropdownButton>
      <DropdownMenu className="min-w-64" anchor="top start">
        <DropdownItem href="/profile">
          <ProfileIcon data-slot="icon" />
          My Profile
        </DropdownItem>
        <DropdownItem
          onClick={async () => {
            await signOut()
            window.location.href = '/'
          }}
        >
          <ArrowRightOnRectangleIcon data-slot="icon" />
          Sign out
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  )
}

function AppNavbar() {
  const pathname = usePathname()
  const currentPage = navigation.find((item) => item.href === pathname)

  return (
    <Navbar>
      <NavbarSection>
        <NavbarItem href="/dashboard" aria-label="Home">
          <DashboardIcon />
        </NavbarItem>
        {currentPage && (
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            {currentPage.name}
          </span>
        )}
      </NavbarSection>
      <NavbarSpacer />
    </Navbar>
  )
}

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarLayout
      navbar={<AppNavbar />}
      sidebar={<AppSidebar />}
    >
      {children}
      <ToastContainer />
    </SidebarLayout>
  )
}
