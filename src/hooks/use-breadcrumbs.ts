import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { getRouteLabel } from '@/lib/breadcrumb-config'
import { BreadcrumbItem } from '@/components/breadcrumb'

export function useBreadcrumbs() {
  const pathname = usePathname()

  const breadcrumbs = useMemo(() => {
    if (!pathname) return []

    const segments = pathname.split('/').filter(Boolean)
    
    // Don't show breadcrumbs on dashboard root if the Home icon represents dashboard
    if (pathname === '/dashboard') {
      return []
    }

    const items: BreadcrumbItem[] = segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join('/')}`
      
      // Handle dynamic segments or mapped labels
      // If the segment looks like a UUID or ID, we might want to keep it as is
      // or rely on a more sophisticated lookup in the future.
      // For now, just use getRouteLabel which defaults to returning the segment
      let label = getRouteLabel(segment)
      
      // Basic formatting for IDs if they are not mapped (e.g. capitalization)
      // If it was mapped (e.g. 'workflows' -> 'Workflows'), it's already nice.
      // If it wasn't mapped (e.g. '123'), it returns '123'.
      
      return {
        name: label,
        href,
        current: index === segments.length - 1
      }
    })

    return items
  }, [pathname])

  return breadcrumbs
}
