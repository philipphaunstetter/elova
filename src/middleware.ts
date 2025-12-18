import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't require setup completion
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/setup',
  '/setup',
  '/_next',
  '/favicon.ico',
  '/robots.txt'
]

// Setup routes - 4-step onboarding flow
const SETUP_ROUTES = [
  '/setup',
  '/setup/account',    // Step 1: Account Creation
  '/setup/connect',    // Step 2: Connect n8n Instance
  '/setup/workflows',  // Step 3: Workflow Selection
  '/setup/summary'     // Step 4: Final Summary
]

// Admin/app routes that require setup completion
// NOTE: Currently cleaned - will be rebuilt in v2
const ADMIN_ROUTES: string[] = [
  // Routes will be added as they're rebuilt
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for static files and API routes (except setup)
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') && !pathname.startsWith('/api/setup') ||
    pathname.includes('.') ||
    PUBLIC_ROUTES.includes(pathname)
  ) {
    return NextResponse.next()
  }

  try {
    // Check setup status by calling our setup API
    const setupResponse = await fetch(new URL('/api/setup/status', request.url), {
      headers: {
        'x-forwarded-host': request.headers.get('host') || '',
      },
      cache: 'no-store'
    })

    if (!setupResponse.ok) {
      console.error('Failed to check setup status:', setupResponse.statusText)
      // On error, redirect to setup to be safe
      return NextResponse.redirect(new URL('/setup', request.url))
    }

    const setupStatus = await setupResponse.json()

    // Handle root path specifically
    if (pathname === '/') {
      if (!setupStatus.initDone) {
        // Setup not complete, redirect to setup
        return NextResponse.redirect(new URL('/setup', request.url))
      } else {
        // Setup complete - for now redirect back to setup since no dashboard exists yet
        // TODO: Change this to '/dashboard' once dashboard is rebuilt
        return NextResponse.redirect(new URL('/setup', request.url))
      }
    }

    // If setup is required and user is not on a setup page
    if (!setupStatus.initDone && !SETUP_ROUTES.some(route => pathname.startsWith(route))) {
      // Redirect to admin setup
      return NextResponse.redirect(new URL('/setup', request.url))
    }

    // If setup is complete and user is on setup pages
    if (setupStatus.initDone && SETUP_ROUTES.some(route => pathname.startsWith(route))) {
      // For now, allow access to setup page since no other routes exist
      // TODO: Redirect to '/dashboard' once dashboard is rebuilt
      return NextResponse.next()
    }

    // If user tries to access admin routes without setup completion
    if (!setupStatus.initDone && ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL('/setup', request.url))
    }

  } catch (error) {
    console.error('Setup middleware error:', error)
    // On error, redirect to admin setup to be safe
    if (!SETUP_ROUTES.some(route => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL('/setup', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}