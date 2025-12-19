import { NextRequest, NextResponse } from 'next/server'
import { verify } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'elova-secret-change-in-production'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('session')?.value

    if (!sessionToken) {
      return NextResponse.json({
        authenticated: false,
        user: null
      })
    }

    // Verify JWT token
    const decoded = verify(sessionToken, JWT_SECRET) as {
      userId: string
      email: string
      role: string
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        role: decoded.role
      }
    })
  } catch (error) {
    console.error('Session verification failed:', error)
    return NextResponse.json({
      authenticated: false,
      user: null
    })
  }
}
