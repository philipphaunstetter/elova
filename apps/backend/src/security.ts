import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const PASSWORD_KEY_BYTES = 64
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60

export interface SessionClaims {
  sessionId: string
  ownerId: string
  email: string
  expiresAt: number
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

function secretBuffer(value: string, name: string): Buffer {
  const secret = Buffer.from(value, 'base64')
  if (secret.length !== 32 || secret.toString('base64') !== value) {
    throw new Error(`${name} must be a base64-encoded 32-byte secret`)
  }
  return secret
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) {
    throw new Error('Password must be between 12 and 256 characters')
  }
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, PASSWORD_KEY_BYTES) as Buffer
  return `scrypt$${encode(salt)}$${encode(derived)}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltValue, expectedValue] = encoded.split('$')
  if (algorithm !== 'scrypt' || !saltValue || !expectedValue) return false
  try {
    const expected = decode(expectedValue)
    const derived = await scrypt(password, decode(saltValue), expected.length) as Buffer
    return expected.length === derived.length && timingSafeEqual(expected, derived)
  } catch {
    return false
  }
}

export function issueSession(
  claims: Omit<SessionClaims, 'expiresAt'>,
  signingSecret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): { token: string; claims: SessionClaims } {
  const payload: SessionClaims = { ...claims, expiresAt: nowSeconds + SESSION_LIFETIME_SECONDS }
  const encodedPayload = encode(JSON.stringify(payload))
  const signature = createHmac('sha256', secretBuffer(signingSecret, 'ELOVA_SESSION_SECRET'))
    .update(encodedPayload)
    .digest('base64url')
  return { token: `${encodedPayload}.${signature}`, claims: payload }
}

export function verifySession(
  token: string,
  signingSecret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): SessionClaims | undefined {
  const [payloadValue, suppliedSignature, extra] = token.split('.')
  if (!payloadValue || !suppliedSignature || extra) return undefined
  try {
    const expected = createHmac('sha256', secretBuffer(signingSecret, 'ELOVA_SESSION_SECRET'))
      .update(payloadValue)
      .digest()
    const supplied = decode(suppliedSignature)
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return undefined
    const value = JSON.parse(decode(payloadValue).toString('utf8')) as Partial<SessionClaims>
    if (
      typeof value.sessionId !== 'string' ||
      typeof value.ownerId !== 'string' ||
      typeof value.email !== 'string' ||
      typeof value.expiresAt !== 'number' ||
      value.expiresAt <= nowSeconds
    ) return undefined
    return value as SessionClaims
  } catch {
    return undefined
  }
}

export function sessionTokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function encryptCredential(value: string, encryptionSecret: string): string {
  const key = secretBuffer(encryptionSecret, 'ELOVA_CREDENTIAL_KEY')
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `v1.${encode(nonce)}.${encode(cipher.getAuthTag())}.${encode(ciphertext)}`
}

export function decryptCredential(value: string, encryptionSecret: string): string {
  const [version, nonceValue, tagValue, ciphertextValue, extra] = value.split('.')
  if (version !== 'v1' || !nonceValue || !tagValue || !ciphertextValue || extra) {
    throw new Error('Unsupported encrypted credential')
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    secretBuffer(encryptionSecret, 'ELOVA_CREDENTIAL_KEY'),
    decode(nonceValue),
  )
  decipher.setAuthTag(decode(tagValue))
  return Buffer.concat([decipher.update(decode(ciphertextValue)), decipher.final()]).toString('utf8')
}

export const SESSION_MAX_AGE_SECONDS = SESSION_LIFETIME_SECONDS
