'use client'

import { useTheme } from '@/contexts/ThemeContext'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      className="fixed bottom-6 right-6 z-50 p-3 rounded-full shadow-lg bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-700 hover:border-zinc-300 dark:hover:border-slate-600 transition-colors"
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <Moon className="h-5 w-5 text-slate-400" />
      ) : (
        <Sun className="h-5 w-5 text-zinc-700" />
      )}
    </button>
  )
}
