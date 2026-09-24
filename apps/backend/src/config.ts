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

function parseHost(value: string | undefined): string {
  const host = value?.trim() || '127.0.0.1'
  const literal = host.startsWith('[') && host.endsWith(']')
    ? host.slice(1, -1)
    : host
  const isUnspecifiedIpv6 = isIP(literal) === 6 && literal.replace(/[:0]/g, '') === ''
  if (literal === '0.0.0.0' || isUnspecifiedIpv6) {
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
