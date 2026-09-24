import { isIP } from 'node:net'
import { resolve } from 'node:path'

export interface BackendConfig {
  host: string
  port: number
  databaseUrl: string
  migrationsDirectory: string
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`${name} is required`)
  }

  return value
}

function withoutBrackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value
}

function canonicalIpv6(value: string): string | undefined {
  if (isIP(value) !== 6) return undefined
  return withoutBrackets(new URL(`http://[${value}]/`).hostname)
}

function isLoopbackHost(value: string): boolean {
  const host = withoutBrackets(value).toLowerCase()
  if (host === 'localhost') return true
  if (isIP(host) === 4) return host.split('.')[0] === '127'
  return canonicalIpv6(host) === '::1'
}

function parseHost(value: string | undefined): string {
  const host = value?.trim() || '127.0.0.1'
  const literal = withoutBrackets(host)
  if (literal === '0.0.0.0' || canonicalIpv6(literal) === '::') {
    throw new Error('ELOVA_BACKEND_HOST must not use a wildcard address')
  }

  return host
}

function parseDatabaseUrl(value: string | undefined): string {
  const databaseUrl = required('DATABASE_URL', value)
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql scheme')
  }

  const socketHosts = url.searchParams.getAll('host')
  const socketHost = socketHosts.length === 1 ? socketHosts[0] : undefined
  const usesUnixSocket =
    url.hostname === '' &&
    socketHost !== undefined &&
    socketHost.startsWith('/') &&
    !socketHost.includes('\0')
  const usesLoopback = socketHosts.length === 0 && isLoopbackHost(url.hostname)
  if (url.searchParams.has('hostaddr') || (!usesUnixSocket && !usesLoopback)) {
    throw new Error('DATABASE_URL must use a same-host Unix socket or loopback address')
  }

  return databaseUrl
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '4100')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  return port
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  return {
    host: parseHost(env.ELOVA_BACKEND_HOST),
    port: parsePort(env.PORT),
    databaseUrl: parseDatabaseUrl(env.DATABASE_URL),
    migrationsDirectory: resolve(process.cwd(), 'migrations'),
  }
}
