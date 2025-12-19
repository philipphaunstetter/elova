import { NextRequest, NextResponse } from 'next/server'
import { getConfigManager } from '@/lib/config/config-manager'
import crypto from 'crypto'
import { sign } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'elova-secret-change-in-production'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const config = getConfigManager()
    await config.initialize()

    // Get stored admin credentials
    const storedEmail = await config.get<string>('setup.admin_email')
    const storedPasswordHash = await config.get<string>('setup.admin_password_hash')
    const userId = await config.get<string>('setup.admin_user_id')

    if (!storedEmail || !storedPasswordHash || !userId) {
      return NextResponse.json(
        { success: false, error: 'Admin account not found' },
        { status: 404 }
      )
    }

    // Verify credentials
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex')

    if (email !== storedEmail || passwordHash !== storedPasswordHash) {
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Create JWT token
    const token = sign(
      {
        userId,
        email,
        role: 'admin'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        id: userId,
        email,
        role: 'admin'
      }
    })

    // Set HTTP-only cookie
    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Setup login failed:', error)
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    )
  }
}
