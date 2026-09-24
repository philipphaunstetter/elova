import { createHash } from 'node:crypto'
import { decryptCredential, encryptCredential } from './security.js'
import type { ElovaRepository, ProviderSecret, SyncRepository } from './repository.js'
import { sanitizeExecution, sanitizeWorkflow } from './sanitizer.js'

const MAX_PROVIDER_RESPONSE_BYTES = 10 * 1024 * 1024
const PROVIDER_TIMEOUT_MS = 4_000

interface Page {
  data?: unknown[]
  nextCursor?: string | null
}

async function limitedJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error('Provider request failed')
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new Error('Provider response exceeded the allowed size')
  }
  if (!response.body) return {}
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('Provider response exceeded the allowed size')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null
}

function sourceIdentifier(value: unknown): string | null {
  const identifier = text(value)
  return identifier ? createHash('sha256').update(identifier).digest('hex') : null
}

function timestamp(value: unknown): string | null {
  const candidate = text(value)
  if (!candidate) return null
  const parsed = Date.parse(candidate)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function enumValue(value: unknown, allowed: readonly string[], fallback: string | null): string | null {
  const candidate = text(value)?.toLowerCase()
  return candidate && allowed.includes(candidate) ? candidate : fallback
}

function encryptCursor(value: string, encryptionSecret: string): string {
  return encryptCredential(value, encryptionSecret)
}

export class N8nSynchronizer {
  constructor(
    private readonly repository: ElovaRepository,
    private readonly encryptionSecret: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  private async request(provider: ProviderSecret, path: string, cursor: string | null): Promise<Page> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
    try {
      const url = new URL(path, `${provider.baseUrl}/`)
      if (cursor) url.searchParams.set('cursor', cursor)
      const response = await this.fetchImplementation(url, {
        headers: { 'X-N8N-API-KEY': decryptCredential(provider.encryptedApiKey, this.encryptionSecret) },
        redirect: 'error',
        signal: controller.signal,
      })
      return object(await limitedJson(response)) as Page
    } finally {
      clearTimeout(timer)
    }
  }

  private async synchronizeWorkflows(provider: ProviderSecret, repository: SyncRepository): Promise<number> {
    const storedCursor = await repository.getSyncCursor(provider.id, 'workflows')
    const cursor = storedCursor ? decryptCredential(storedCursor, this.encryptionSecret) : null
    const page = await this.request(provider, '/api/v1/workflows?limit=100', cursor)
    let count = 0
    for (const raw of Array.isArray(page.data) ? page.data : []) {
      const workflow = object(raw)
      const providerWorkflowId = sourceIdentifier(workflow.id)
      if (!providerWorkflowId) continue
      const sanitized = sanitizeWorkflow(workflow)
      await repository.storeWorkflow(provider.id, {
        providerWorkflowId,
        name: `Workflow ${providerWorkflowId.slice(0, 12)}`,
        active: workflow.active === true,
        sanitizedDefinition: sanitized.value,
        privacyMode: sanitized.privacyMode,
        sanitizerVersion: sanitized.sanitizerVersion,
        contentDigest: sanitized.digest,
        sourceUpdatedAt: timestamp(workflow.updatedAt),
      })
      count += 1
    }
    const nextCursor = text(page.nextCursor)
    await repository.finishSync(
      provider.id,
      'workflows',
      nextCursor ? encryptCursor(nextCursor, this.encryptionSecret) : null,
      count,
    )
    return count
  }

  private async synchronizeExecutions(provider: ProviderSecret, repository: SyncRepository): Promise<number> {
    const storedCursor = await repository.getSyncCursor(provider.id, 'executions')
    const cursor = storedCursor ? decryptCredential(storedCursor, this.encryptionSecret) : null
    const page = await this.request(provider, '/api/v1/executions?includeData=true&limit=100', cursor)
    let count = 0
    for (const raw of Array.isArray(page.data) ? page.data : []) {
      const execution = object(raw)
      const providerExecutionId = sourceIdentifier(execution.id)
      if (!providerExecutionId) continue
      const sanitized = sanitizeExecution(execution)
      const startedAt = timestamp(execution.startedAt)
      const stoppedAt = timestamp(execution.stoppedAt)
      const durationMs = integer(execution.duration) ?? (
        startedAt && stoppedAt ? Math.max(0, Date.parse(stoppedAt) - Date.parse(startedAt)) : null
      )
      await repository.storeExecution(provider.id, {
        providerExecutionId,
        providerWorkflowId: sourceIdentifier(execution.workflowId),
        status: enumValue(execution.status, ['success', 'error', 'failed', 'crashed', 'running', 'waiting', 'canceled'], 'unknown')!,
        mode: enumValue(execution.mode, ['manual', 'trigger', 'webhook', 'retry', 'integrated', 'cli', 'error'], null),
        startedAt,
        stoppedAt,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        sanitizedContent: sanitized.value,
        privacyMode: sanitized.privacyMode,
        sanitizerVersion: sanitized.sanitizerVersion,
        contentDigest: sanitized.digest,
      })
      count += 1
    }
    const nextCursor = text(page.nextCursor)
    await repository.finishSync(
      provider.id,
      'executions',
      nextCursor ? encryptCursor(nextCursor, this.encryptionSecret) : null,
      count,
    )
    return count
  }

  async synchronize(provider: ProviderSecret): Promise<{ workflows: number; executions: number }> {
    return this.repository.withProviderSyncLock(provider.id, async (repository) => {
      try {
        const workflows = await this.synchronizeWorkflows(provider, repository)
        const executions = await this.synchronizeExecutions(provider, repository)
        return { workflows, executions }
      } catch {
        await repository.failSync(provider.id, 'provider')
        throw new Error('Provider synchronization failed')
      }
    })
  }
}
