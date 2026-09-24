import { isIP } from 'node:net'

function isTailnetIpv4(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false
  const octets = hostname.split('.').map(Number)
  return octets[0] === 100 && octets[1] !== undefined && octets[1] >= 64 && octets[1] <= 127
}

function isLoopback(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1') return true
  return isIP(hostname) === 4 && hostname.startsWith('127.')
}

function isTailnetIpv6(hostname: string): boolean {
  return isIP(hostname) === 6 && hostname.toLowerCase().startsWith('fd7a:115c:a1e0:')
}

export function normalizeProviderOrigin(value: string, allowLoopback = process.env.NODE_ENV !== 'production'): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Provider URL is invalid')
  }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Provider URL must be an HTTP origin without credentials, path, query, or fragment')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const isMagicDns = hostname.endsWith('.ts.net') && hostname.split('.').length >= 4
  if (!isTailnetIpv4(hostname) && !isTailnetIpv6(hostname) && !isMagicDns && !(allowLoopback && isLoopback(hostname))) {
    throw new Error('Provider URL must use a Tailnet address')
  }
  return url.origin
}
