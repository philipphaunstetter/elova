/**
 * API client that handles session-based authentication
 */
export class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Check for session token in localStorage first
    if (typeof window !== 'undefined') {
      const sessionToken = localStorage.getItem('sessionToken')
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`
      }
    }
    
    // Note: If no localStorage token, fetch() will automatically include cookies
    // which is how the server-side session authentication works

    return headers
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers,
      credentials: 'include', // Include cookies for session authentication
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      credentials: 'include', // Include cookies for session authentication
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers,
      credentials: 'include', // Include cookies for session authentication
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers,
      credentials: 'include', // Include cookies for session authentication
      body: data ? JSON.stringify(data) : undefined,
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  async delete<T>(endpoint: string): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers,
      credentials: 'include', // Include cookies for session authentication
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }
}

// Export a default instance
export const apiClient = new ApiClient()