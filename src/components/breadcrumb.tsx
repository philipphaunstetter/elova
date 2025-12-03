import { HomeIcon } from '@heroicons/react/20/solid'
import Link from 'next/link'

export interface BreadcrumbItem {
  name: string
  href: string
  current: boolean
}

interface BreadcrumbProps {
  pages: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ pages, className = '' }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={`flex ${className}`}>
      <ol role="list" className="flex items-center space-x-4">
        <li>
          <div>
            <Link 
              href="/dashboard" 
              className="text-gray-400 hover:text-gray-500 dark:text-slate-500 dark:hover:text-slate-400"
            >
              <HomeIcon aria-hidden="true" className="size-5 shrink-0" />
              <span className="sr-only">Home</span>
            </Link>
          </div>
        </li>
        {pages.map((page) => (
          <li key={page.name}>
            <div className="flex items-center">
              <svg
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
                className="size-5 shrink-0 text-gray-300 dark:text-slate-600"
              >
                <path d="M5.555 17.776l8-16 .894.448-8 16-.894-.448z" />
              </svg>
              <Link
                href={page.href}
                aria-current={page.current ? 'page' : undefined}
                className={`ml-4 text-sm font-medium ${
                  page.current
                    ? 'text-gray-500 dark:text-slate-400 pointer-events-none'
                    : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
              >
                {page.name}
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
