'use client'

import { SetupProvider } from '@/contexts/SetupContext'

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SetupProvider>
      <div className="min-h-screen bg-white dark:bg-slate-900">
        {/* Layout will be styled according to Figma */}
        {children}
      </div>
    </SetupProvider>
  )
}
