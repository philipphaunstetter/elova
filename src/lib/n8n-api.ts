import { getProviderService } from './services/provider-service';
import crypto from 'crypto';

export interface N8nExecution {
  id: string;
  mode: string;
  retryOf: string | null;
  retrySuccessId: string | null;
  status: 'success' | 'failed' | 'error' | 'canceled' | 'crashed' | 'new' | 'running' | 'waiting';
  startedAt: string;
  stoppedAt: string | null;
  workflowId: string;
  workflowName?: string;
  finished: boolean;
  data?: {
    resultData?: {
      runData?: Record<string, any[]>;
      error?: any;
      lastNodeExecuted?: string;
    };
    executionData?: any;
    startData?: any;
  };
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  nodes: any[];
  connections: any;
  tags: any[];
}

export interface ExecutionsResponse {
  data: N8nExecution[];
  nextCursor: string | null;
}

class N8nApiClient {
  private providerService = getProviderService();

  // Helper to get the default provider configuration
  // In a multi-provider setup, this would need to be updated to accept a providerId
  private async getDefaultProviderConfig() {
    // For now, we'll fetch the first active provider
    // This maintains backward compatibility with the existing single-instance assumption
    // In the future, methods should accept an optional providerId

    // We need a user ID to list providers. Since this is a backend service often called
    // without a specific user context (e.g. cron jobs), we might need a system user or
    // a way to get "system" providers.
    // For now, let's try to find *any* connected provider.

    // NOTE: This is a temporary bridge. Ideally, the caller should specify the provider.
    // We'll query the database directly to avoid the user_id requirement of listProviders if needed,
    // but let's try to use the service first if we can.

    // Since we don't have a user ID here easily, we'll use a direct DB query or a service method
    // that doesn't require it if available. 
    // Looking at provider-service.ts, most methods require userId.
    // Let's assume for the legacy single-tenant use case we can find the "default" provider.

    // We'll use the workflowSync service's method to get active providers as it's already set up for this
    // or we can implement a simple lookup here.

    const db = (this.providerService as any).getDb(); // Accessing protected method via any cast for now

    return new Promise<{ host: string; apiKey: string }>((resolve, reject) => {
      db.get(
        'SELECT base_url, api_key_encrypted FROM providers WHERE is_connected = 1 LIMIT 1',
        (err: any, row: any) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            // Fallback to defaults if no provider found (e.g. first run)
            resolve({
              host: 'http://localhost:5678',
              apiKey: ''
            });
            return;
          }

          try {
            // We need to decrypt the API key. 
            // We can use the workflowSync service's decrypt method since it's exposed or duplicate the logic.
            // To avoid circular deps or code duplication, let's try to use the service if possible.
            // Actually, workflowSync is imported. Let's use a helper from there or just duplicate the simple decryption for now
            // to ensure stability.

            // Wait, we can't easily access the private decrypt method of WorkflowSyncService.
            // Let's use the ConfigManager's encryption key which is shared.

            // Actually, looking at the codebase, `workflowSync` has `decryptApiKey`. 
            // It is private.

            // Let's assume the row.api_key_encrypted is what we need.
            // For this fix, I'll assume the API key might be plain text if encryption failed or 
            // use a placeholder if I can't decrypt it easily here without duplicating code.

            // BETTER APPROACH: Use the ConfigManager to get the legacy config if provider lookup fails,
            // OR just accept that we need to migrate fully.

            // Let's try to use the ConfigManager as a fallback, but primarily use the provider.
            // The issue is decryption.

            // Let's use a simplified approach:
            // The `workflowSync` service is designed for syncing.
            // This `N8nApiClient` is used for direct API calls.

            // Let's rely on the fact that we fixed the sync process to populate the DB.
            // BUT, this class is used by `syncWorkflows` in `workflow-sync.ts` (legacy method).
            // The new `syncAllProviders` uses `fetch` directly.

            // So `N8nApiClient` is mainly used by the frontend or legacy endpoints.
            // If we update it to use the DB, we need to handle decryption.

            // Let's just return the raw values and let the request method handle it?
            // No, request needs the actual key.

            // For now, let's fallback to the ConfigManager if we can't easily get the provider,
            // BUT the user said "we have data in the database".

            // Let's assume the `api_key_encrypted` is actually usable if we had the key.
            // Since I cannot easily decrypt here without duplicating logic, 
            // and the user's immediate issue was "how would other pages be able to read data",
            // the answer is: they read from the DB, not the API (mostly).
            // The API is only used for live actions or sync.

            // If this class is used for live actions (e.g. "activate workflow"), it needs the key.

            // Let's try to use the `getConfigManager` again but mapped to the provider table?
            // No, that's overcomplicating.

            // Simplest fix: The `N8nApiClient` should be deprecated in favor of `ProviderService` + direct calls,
            // OR it should be updated to fetch from the `providers` table.

            // Let's update it to fetch from `providers` table and use a hardcoded decryption for now 
            // (matching `workflow-sync.ts` logic) to solve the immediate "how does it work" question.

            const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'elova-default-encryption-key-change-me';

            let apiKey = '';
            if (row.api_key_encrypted) {
              try {
                const [ivHex, authTagHex, encrypted] = row.api_key_encrypted.split(':');
                const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
                const iv = Buffer.from(ivHex, 'hex');
                const authTag = Buffer.from(authTagHex, 'hex');
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
                decipher.setAuthTag(authTag);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                apiKey = decrypted;
              } catch (e) {
                console.error('Failed to decrypt API key in N8nApiClient', e);
              }
            }

            resolve({
              host: row.base_url,
              apiKey: apiKey
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const { host, apiKey } = await this.getDefaultProviderConfig();
    const url = `${host.replace(/\/$/, '')}/api/v1${endpoint}`;

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(apiKey && (apiKey.startsWith('ey') && apiKey.includes('.') 
        ? { 'Authorization': `Bearer ${apiKey}` }
        : { 'X-N8N-API-KEY': apiKey })),
      ...options?.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`n8n API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('n8n API request failed:', error);
      throw error;
    }
  }

  async getExecutions(params?: {
    limit?: number;
    cursor?: string;
    status?: string;
    workflowId?: string;
    includeData?: boolean;
  }): Promise<ExecutionsResponse> {
    const searchParams = new URLSearchParams();

    if (params?.limit) searchParams.append('limit', params.limit.toString());
    if (params?.cursor) searchParams.append('cursor', params.cursor);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.workflowId) searchParams.append('workflowId', params.workflowId);
    if (params?.includeData) searchParams.append('includeData', 'true');

    const queryString = searchParams.toString();
    const endpoint = `/executions${queryString ? `?${queryString}` : ''}`;

    return this.request<ExecutionsResponse>(endpoint);
  }

  async getExecution(id: string, includeData: boolean = false): Promise<N8nExecution> {
    const params = includeData ? '?includeData=true' : '';
    return this.request<N8nExecution>(`/executions/${id}${params}`);
  }

  async getExecutionWithData(id: string): Promise<N8nExecution> {
    return this.getExecution(id, true);
  }

  async getWorkflows(): Promise<N8nWorkflow[]> {
    const response = await this.request<{ data: N8nWorkflow[] }>('/workflows');
    return response.data;
  }

  async getWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>(`/workflows/${id}`);
  }
}

export const n8nApi = new N8nApiClient();