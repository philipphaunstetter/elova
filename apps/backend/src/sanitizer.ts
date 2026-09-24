import { createHash } from 'node:crypto'

export const SANITIZER_VERSION = '1'
export const PRIVACY_MODE = 'sanitized_only'
const REDACTED = '[redacted]'
const MAX_DEPTH = 20
const MAX_ARRAY_ITEMS = 1_000
const MAX_OBJECT_KEYS = 1_000
const SENSITIVE_KEY = /(authorization|cookie|credential|password|secret|token|api[-_]?key|email|phone|address|first[-_]?name|last[-_]?name|binary|data|body|headers?|query|payload|output|input)/i
const SAFE_SCALAR_KEY = /^(active|disabled|continueOnFail|alwaysOutputData|executeOnce|retryOnFail|maxTries|waitBetweenTries|type|typeVersion|mode|status|position|httpMethod|responseMode)$/i

function sanitizedValue(value: unknown, key: string, depth: number): unknown {
  if (depth > MAX_DEPTH) return '[truncated]'
  if (value === null) return null
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { redacted: true, byteLength: value.byteLength }
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizedValue(item, key, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_OBJECT_KEYS)
        .map(([childKey, child]) => [childKey, sanitizedValue(child, childKey, depth + 1)]),
    )
  }
  if (SENSITIVE_KEY.test(key)) return REDACTED
  if (typeof value === 'string') {
    if (!SAFE_SCALAR_KEY.test(key)) return REDACTED
    return value.length <= 256 ? value : `${value.slice(0, 256)}…`
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return SAFE_SCALAR_KEY.test(key) ? value : REDACTED
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

export function sanitizeForPersistence(value: unknown): SanitizedRecord {
  const sanitized = sanitizedValue(value, '', 0)
  return {
    value: sanitized,
    privacyMode: PRIVACY_MODE,
    sanitizerVersion: SANITIZER_VERSION,
    digest: createHash('sha256').update(canonical(sanitized)).digest('hex'),
  }
}

export function sanitizeWorkflow(raw: unknown): SanitizedRecord {
  return sanitizeForPersistence(raw)
}

export function sanitizeExecution(raw: unknown): SanitizedRecord {
  return sanitizeForPersistence(raw)
}
