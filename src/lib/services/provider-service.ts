import { Database } from 'sqlite3'
import { getDb } from '@/lib/db'
import { Provider } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

// Simple encryption for API keys (in production, use a proper key management service)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'elova-default-encryption-key-change-me'
const ALGORITHM = 'aes-256-gcm'

/**
 * Provider Service
 * Manages n8n provider instances with encrypted API keys
 */
export class ProviderService {
  private db: Database

  constructor() {
    this.db = getDb()
  }

  /**
   * Encrypt API key for storage
   */
  private encryptApiKey(apiKey: string): string {
    try {
      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
      
      let encrypted = cipher.update(apiKey, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      
      const authTag = cipher.getAuthTag()
      
      // Store IV + AuthTag + Encrypted data
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
    } catch (error) {
      console.error('Encryption error:', error)
      throw new Error('Failed to encrypt API key')
    }
  }

  /**
   * Decrypt API key from storage
   */
  private decryptApiKey(encryptedData: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedData.split(':')
      
      const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32)
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      return decrypted
    } catch (error) {
      console.error('Decryption error:', error)
      throw new Error('Failed to decrypt API key')
    }
  }

  /**
   * List all providers for a user
   */
  async listProviders(userId: string): Promise<Provider[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM providers WHERE user_id = ? ORDER BY name ASC`,
        [userId],
        (err, rows: any[]) => {
          if (err) {
            reject(err)
            return
          }

          const providers: Provider[] = rows.map(row => {
            let metadata = {}
            try {
              metadata = row.metadata ? JSON.parse(row.metadata) : {}
            } catch {}

            return {
              id: row.id,
              name: row.name,
              type: 'n8n' as const,
              baseUrl: row.base_url,
              isConnected: Boolean(row.is_connected),
              lastChecked: row.last_checked_at || new Date().toISOString(),
              status: row.status || 'unknown',
              metadata,
              userId: row.user_id
            } as any
          })

          resolve(providers)
        }
      )
    })
  }

  /**
   * Get a single provider by ID
   */
  async getProvider(providerId: string, userId: string): Promise<Provider | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM providers WHERE id = ? AND user_id = ?`,
        [providerId, userId],
        (err, row: any) => {
          if (err) {
            reject(err)
            return
          }

          if (!row) {
            resolve(null)
            return
          }

          let metadata = {}
          try {
            metadata = row.metadata ? JSON.parse(row.metadata) : {}
          } catch {}

          const provider: Provider = {
            id: row.id,
            name: row.name,
            type: 'n8n',
            baseUrl: row.base_url,
            isConnected: Boolean(row.is_connected),
            lastChecked: row.last_checked_at || new Date().toISOString(),
            status: row.status || 'unknown',
            metadata,
            userId: row.user_id
          } as any

          resolve(provider)
        }
      )
    })
  }

  /**
   * Get provider with decrypted API key (for internal use only)
   */
  async getProviderWithApiKey(providerId: string, userId: string): Promise<(Provider & { apiKey: string }) | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM providers WHERE id = ? AND user_id = ?`,
        [providerId, userId],
        (err, row: any) => {
          if (err) {
            reject(err)
            return
          }

          if (!row) {
            resolve(null)
            return
          }

          let metadata = {}
          try {
            metadata = row.metadata ? JSON.parse(row.metadata) : {}
          } catch {}

          let apiKey = ''
          try {
            apiKey = this.decryptApiKey(row.api_key_encrypted)
          } catch (error) {
            console.error('Failed to decrypt API key for provider:', providerId)
          }

          const provider = {
            id: row.id,
            name: row.name,
            type: 'n8n' as const,
            baseUrl: row.base_url,
            apiKey,
            isConnected: Boolean(row.is_connected),
            lastChecked: row.last_checked_at || new Date().toISOString(),
            status: row.status || 'unknown',
            metadata,
            userId: row.user_id
          } as any

          resolve(provider)
        }
      )
    })
  }

  /**
   * Create a new provider
   */
  async createProvider(
    userId: string,
    data: {
      name: string
      baseUrl: string
      apiKey: string
      metadata?: Record<string, unknown>
    }
  ): Promise<Provider> {
    const id = uuidv4()
    const encryptedApiKey = this.encryptApiKey(data.apiKey)
    const metadata = JSON.stringify(data.metadata || {})

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO providers (id, user_id, name, base_url, api_key_encrypted, is_connected, status, last_checked_at, metadata)
         VALUES (?, ?, ?, ?, ?, 0, 'unknown', NULL, ?)`,
        [id, userId, data.name, data.baseUrl, encryptedApiKey, metadata],
        (err) => {
          if (err) {
            reject(err)
            return
          }

          const provider: Provider = {
            id,
            name: data.name,
            type: 'n8n',
            baseUrl: data.baseUrl,
            isConnected: false,
            lastChecked: new Date(),
            status: 'unknown',
            metadata: data.metadata || {},
            userId
          }

          resolve(provider)
        }
      )
    })
  }

  /**
   * Update an existing provider
   */
  async updateProvider(
    providerId: string,
    userId: string,
    data: Partial<{
      name: string
      baseUrl: string
      apiKey: string
      metadata: Record<string, unknown>
    }>
  ): Promise<Provider> {
    const updates: string[] = []
    const values: any[] = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.baseUrl !== undefined) {
      updates.push('base_url = ?')
      values.push(data.baseUrl)
    }
    if (data.apiKey !== undefined) {
      updates.push('api_key_encrypted = ?')
      values.push(this.encryptApiKey(data.apiKey))
    }
    if (data.metadata !== undefined) {
      updates.push('metadata = ?')
      values.push(JSON.stringify(data.metadata))
    }

    if (updates.length === 0) {
      throw new Error('No fields to update')
    }

    values.push(providerId, userId)

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE providers SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
        values,
        async (err) => {
          if (err) {
            reject(err)
            return
          }

          // Fetch and return updated provider
          try {
            const provider = await this.getProvider(providerId, userId)
            if (!provider) {
              reject(new Error('Provider not found after update'))
              return
            }
            resolve(provider)
          } catch (error) {
            reject(error)
          }
        }
      )
    })
  }

  /**
   * Delete a provider and all associated data
   */
  async deleteProvider(providerId: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Note: Foreign keys will cascade delete workflows and executions
      this.db.run(
        `DELETE FROM providers WHERE id = ? AND user_id = ?`,
        [providerId, userId],
        (err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        }
      )
    })
  }

  /**
   * Test connection to a provider
   */
  async testConnection(baseUrl: string, apiKey: string): Promise<{
    success: boolean
    version?: string
    error?: string
  }> {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/api/v1/workflows`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      let effectiveApiKey = apiKey.trim()
      if (effectiveApiKey.startsWith('xeyJ')) {
        effectiveApiKey = effectiveApiKey.substring(1)
      }

      const tryFetch = (headers: Record<string, string>) => fetch(url, {
        headers: { 'Accept': 'application/json', ...headers },
        signal: controller.signal
      })

      // Strategy 1: Try X-N8N-API-KEY
      let response = await tryFetch({ 'X-N8N-API-KEY': effectiveApiKey })

      // Strategy 2: Try Bearer if 401 and looks like JWT
      if (response.status === 401 && effectiveApiKey.startsWith('ey') && effectiveApiKey.includes('.')) {
        response = await tryFetch({ 'Authorization': `Bearer ${effectiveApiKey}` })
      }

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`
        }
      }

      // Try to get version info from another endpoint
      let version = 'unknown'
      try {
        const versionUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/executions`
        const versionHeaders: Record<string, string> = {
            'Accept': 'application/json'
          }
  
          if (apiKey.startsWith('ey') && apiKey.includes('.')) {
            versionHeaders['Authorization'] = `Bearer ${apiKey}`
          } else {
            versionHeaders['X-N8N-API-KEY'] = apiKey
          }

        const versionResponse = await fetch(versionUrl, {
          headers: versionHeaders
        })
        if (versionResponse.ok) {
          version = 'connected'
        }
      } catch {}

      return {
        success: true,
        version
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Connection timeout - please check the URL and network'
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      }
    }
  }

  /**
   * Update provider connection status
   */
  async updateConnectionStatus(
    providerId: string,
    userId: string,
    isConnected: boolean,
    status: 'healthy' | 'warning' | 'error' | 'unknown',
    version?: string
  ): Promise<void> {
    const metadata: Record<string, unknown> = {}
    if (version) {
      metadata.version = version
    }

    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE providers 
         SET is_connected = ?, status = ?, last_checked_at = ?, metadata = ?
         WHERE id = ? AND user_id = ?`,
        [
          isConnected ? 1 : 0,
          status,
          new Date().toISOString(),
          JSON.stringify(metadata),
          providerId,
          userId
        ],
        (err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        }
      )
    })
  }
}

// Export singleton instance
let providerService: ProviderService | null = null

export function getProviderService(): ProviderService {
  if (!providerService) {
    providerService = new ProviderService()
  }
  return providerService
}
