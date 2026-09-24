import { createHash } from 'node:crypto'

export const SANITIZER_VERSION = '2'
export const PRIVACY_MODE = 'sanitized_only'
const REDACTED = '[redacted]'
const MAX_DEPTH = 20
const MAX_ARRAY_ITEMS = 1_000
const MAX_OBJECT_KEYS = 1_000
const STRUCTURAL_KEYS = new Set([
  'active', 'binary', 'body', 'connections', 'credentials', 'data', 'executionData',
  'headers', 'httpMethod', 'json', 'main', 'metadata', 'mode', 'name', 'nodes',
  'parameters', 'pinData', 'position', 'query', 'resultData', 'runData', 'settings',
  'status', 'type', 'typeVersion', 'workflowData',
])
const EXECUTION_STATUSES = new Set(['success', 'error', 'failed', 'crashed', 'running', 'waiting', 'canceled'])
const EXECUTION_MODES = new Set(['manual', 'trigger', 'webhook', 'retry', 'integrated', 'cli', 'error'])

type RecordKind = 'execution' | 'workflow'

function sanitizedValue(value: unknown, path: string[], depth: number, kind: RecordKind): unknown {
  if (depth > MAX_DEPTH) return '[truncated]'
  if (value === null) return null
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { redacted: true, byteLength: value.byteLength }
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizedValue(item, [...path, '[]'], depth + 1, kind))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([childKey, child], index) => [
          STRUCTURAL_KEYS.has(childKey) ? childKey : `[redacted-key-${index}]`,
          sanitizedValue(child, [...path, childKey], depth + 1, kind),
        ]),
    )
  }
  if (kind === 'execution' && path.length === 1 && path[0] === 'status' && typeof value === 'string') {
    return EXECUTION_STATUSES.has(value) ? value : REDACTED
  }
  if (kind === 'execution' && path.length === 1 && path[0] === 'mode' && typeof value === 'string') {
    return EXECUTION_MODES.has(value) ? value : REDACTED
  }
  if (kind === 'workflow' && path.length === 1 && path[0] === 'active' && typeof value === 'boolean') {
    return value
  }
  if (kind === 'workflow' && path.length === 3 && path[0] === 'nodes' && path[1] === '[]') {
    if (path[2] === 'type' && typeof value === 'string' && value.length <= 256 &&
      /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/.test(value)) return value
    if (path[2] === 'typeVersion' && typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  }
  return REDACTED
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export interface SanitizedRecord {
  value: unknown
  privacyMode: typeof PRIVACY_MODE
  sanitizerVersion: typeof SANITIZER_VERSION
  digest: string
}

export function sanitizeForPersistence(value: unknown, kind: RecordKind = 'execution'): SanitizedRecord {
  const sanitized = sanitizedValue(value, [], 0, kind)
  return {
    value: sanitized,
    privacyMode: PRIVACY_MODE,
    sanitizerVersion: SANITIZER_VERSION,
    digest: createHash('sha256').update(canonical(sanitized)).digest('hex'),
  }
}

export function sanitizeWorkflow(raw: unknown): SanitizedRecord {
  return sanitizeForPersistence(raw, 'workflow')
}

export function sanitizeExecution(raw: unknown): SanitizedRecord {
  return sanitizeForPersistence(raw)
}
