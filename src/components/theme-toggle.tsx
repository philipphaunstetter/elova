'use client'

import { useTheme } from '@/contexts/ThemeContext'
import { SunIcon, MoonIcon } from '@heroicons/react/16/solid'
import { Switch } from './switch'
import clsx from 'clsx'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div 
        className={clsx(
          'flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg ring-1 cursor-pointer',
          'bg-white ring-zinc-950/10 dark:bg-slate-800 dark:ring-white/10',
          'transition-all duration-200'
        )}
      >
        <SunIcon className="h-4 w-4 text-zinc-700 dark:text-slate-400" />
        <Switch
          checked={isDark}
          onChange={toggleTheme}
          color="blue"
          aria-label="Toggle dark mode"
        />
        <MoonIcon className="h-4 w-4 text-zinc-700 dark:text-slate-400" />
      </div>
    </div>
  )
}
