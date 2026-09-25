import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { resolve } from 'node:path'

export interface BackendConfig {
  host: string
  port: number
  databaseUrl: string
  migrationsDirectory: string
  sessionSecret: string
  credentialKey: string
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

function containerMode(env: NodeJS.ProcessEnv): boolean {
  if (env.ELOVA_RUNTIME === undefined) return false
  if (env.ELOVA_RUNTIME !== 'container') throw new Error('ELOVA_RUNTIME must be container when set')
  return true
}

function parseHost(value: string | undefined, container = false): string {
  const host = value?.trim() || '127.0.0.1'
  const literal = withoutBrackets(host)
  if ((literal === '0.0.0.0' && !container) || canonicalIpv6(literal) === '::') {
    throw new Error('ELOVA_BACKEND_HOST must not use a wildcard address')
  }

  if (container && host !== '0.0.0.0') {
    throw new Error('Container backend must bind internal IPv4 0.0.0.0')
  }
  return host
}

export function parseDatabaseUrl(value: string | undefined, container = false): string {
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

  if (container) {
    // No query parameters: pg connection-string parameters can override the URL host/port.
    // The only permitted endpoint is the in-project Compose DNS service.
    if (url.hostname !== 'postgres' || url.port !== '5432' || url.search ||
        url.pathname !== '/elova_vnext' || decodeURIComponent(url.username) !== 'elova_backend' ||
        !url.password || url.hash) {
      throw new Error('DATABASE_URL must identify the Elova project postgres service on port 5432')
    }
    return databaseUrl
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
  const port = Number(value ?? '43181')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  return port
}

function parseSecret(name: string, value: string | undefined): string {
  const secret = required(name, value)
  if (Buffer.from(secret, 'base64').length !== 32 || Buffer.from(secret, 'base64').toString('base64') !== secret) {
    throw new Error(`${name} must be a base64-encoded 32-byte secret`)
  }
  return secret
}

export function protectedValue(name: string, env: NodeJS.ProcessEnv, container: boolean): string {
  if (!container) return required(name, env[name])
  const path = env[`${name}_FILE`]
  if (path !== undefined && env[name] !== undefined) throw new Error(`${name} and ${name}_FILE are mutually exclusive`)
  if (!path) throw new Error(`${name}_FILE is required in container mode`)
  if (!path.startsWith('/')) throw new Error(`${name}_FILE must be an absolute path`)

  let fd: number | undefined
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    const uid = process.getuid?.()
    const gid = process.getgid?.()
    const ownerReadable = stat.uid === uid && (stat.mode & 0o7777) === 0o400
    const groupReadable = stat.uid === 0 && stat.gid === gid &&
      (stat.mode & 0o7777) === 0o440
    if (!stat.isFile() || stat.size < 1 || stat.size > 4096 || (!ownerReadable && !groupReadable)) {
      throw new Error('unsafe secret file')
    }
    const value = readFileSync(fd, 'utf8').replace(/\n$/, '')
    if (!value || value.includes('\n') || value.includes('\r') || value.includes('\0')) {
      throw new Error('invalid secret file')
    }
    return value
  } catch {
    // Never include the file path, URL, key, or OS error text in diagnostics.
    throw new Error(`${name}_FILE cannot be read securely`)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const container = containerMode(env)
  const sessionSecret = parseSecret('ELOVA_SESSION_SECRET', protectedValue('ELOVA_SESSION_SECRET', env, container))
  const credentialKey = parseSecret('ELOVA_CREDENTIAL_KEY', protectedValue('ELOVA_CREDENTIAL_KEY', env, container))
  if (sessionSecret === credentialKey) throw new Error('Session and credential secrets must be different')
  const port = parsePort(env.PORT)
  if (container && port !== 43181) throw new Error('Container backend port must be 43181')
  return {
    host: parseHost(env.ELOVA_BACKEND_HOST, container),
    port,
    databaseUrl: parseDatabaseUrl(protectedValue('DATABASE_URL', env, container), container),
    migrationsDirectory: resolve(process.cwd(), 'migrations'),
    sessionSecret,
    credentialKey,
  }
}
