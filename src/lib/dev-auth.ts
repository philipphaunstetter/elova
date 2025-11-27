// Development Authentication
// Simple placeholder auth for development/demo purposes

export interface DevUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}


/**
 * Simple development authentication
 * Only works when NODE_ENV is development
 */
export class DevAuth {
  private static SESSION_KEY = 'dev_auth_session'
  private static EXPIRY_KEY = 'dev_auth_expiry'
  private static SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

  static isDevelopment(): boolean {
    // Enable dev auth in development OR when no Supabase credentials are available
    const hasSupabaseCredentials = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    return process.env.NODE_ENV === 'development' || !hasSupabaseCredentials
  }

  static async authenticate(username: string, password: string): Promise<DevUser | null> {
    if (!this.isDevelopment()) {
      return null
    }

    try {
      // Use API endpoint to authenticate (handles database lookup on server side)
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: username, password }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.user) {
          return data.user
        }
      }
    } catch (error) {
      console.warn('Failed to authenticate via API:', error)
    }

    return null
  }

  static setSession(user: DevUser): void {
    if (typeof window !== 'undefined') {
      const expiryTime = Date.now() + this.SESSION_DURATION
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(user))
      localStorage.setItem(this.EXPIRY_KEY, expiryTime.toString())
      
      // Also store in sessionStorage for same-tab persistence
      sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user))
      sessionStorage.setItem(this.EXPIRY_KEY, expiryTime.toString())
    }
  }

  static getSession(): DevUser | null {
    if (!this.isDevelopment() || typeof window === 'undefined') {
      return null
    }

    // Check expiry first
    const expiryTime = localStorage.getItem(this.EXPIRY_KEY) || sessionStorage.getItem(this.EXPIRY_KEY)
    if (expiryTime && Date.now() > parseInt(expiryTime)) {
      this.clearSession()
      return null
    }

    // Try sessionStorage first (more persistent during dev), then localStorage
    let sessionData = sessionStorage.getItem(this.SESSION_KEY) || localStorage.getItem(this.SESSION_KEY)
    
    if (!sessionData) {
      return null
    }

    try {
      const user = JSON.parse(sessionData)
      
      // Refresh the session in both storages if found
      if (user) {
        this.setSession(user)
      }
      
      return user
    } catch (error) {
      console.warn('Failed to parse dev auth session:', error)
      this.clearSession()
      return null
    }
  }

  static clearSession(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.SESSION_KEY)
      localStorage.removeItem(this.EXPIRY_KEY)
      sessionStorage.removeItem(this.SESSION_KEY)
      sessionStorage.removeItem(this.EXPIRY_KEY)
    }
  }

  static isAuthenticated(): boolean {
    return this.getSession() !== null
  }

  /**
   * Set up cross-tab session synchronization
   * Call this once when the app initializes
   */
  static setupSessionSync(onSessionChange: (user: DevUser | null) => void): (() => void) | null {
    if (typeof window === 'undefined') {
      return null
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === this.SESSION_KEY) {
        // Session was changed in another tab
        const newSession = this.getSession()
        onSessionChange(newSession)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    
    // Return cleanup function
    return () => {
      window.removeEventListener('storage', handleStorageChange)
    }
  }
}
