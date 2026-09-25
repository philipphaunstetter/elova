import { pathToFileURL } from 'node:url'
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { parseDatabaseUrl, protectedValue } from './config.js'
import { PostgresRepository, OwnerAlreadyExistsError } from './repository.js'
import { hashPassword } from './security.js'

export async function bootstrapOwner(
  repository: Pick<PostgresRepository, 'createInitialOwner'>,
  input: { email: string; displayName: string; password: string },
): Promise<{ id: string; email: string; displayName: string }> {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (!email || email.length > 320 || !email.includes('@')) throw new Error('A valid owner email is required')
  if (!displayName || displayName.length > 120) throw new Error('A valid owner display name is required')
  const passwordHash = await hashPassword(input.password)
  const owner = await repository.createInitialOwner({ email, displayName, passwordHash })
  return { id: owner.id, email: owner.email, displayName: owner.displayName }
}

// Password handoff is local/operator-only: never pass the value in arguments, env or logs.
export function readOperatorPassword(path: string): string {
  if (!path.startsWith('/')) throw new Error('A protected absolute password file is required')
  let fd: number | undefined
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.uid !== process.getuid?.() ||
        (stat.mode & 0o7777) !== 0o400 || stat.size < 12 || stat.size > 769) {
      throw new Error('Unsafe password file')
    }
    const password = readFileSync(fd, 'utf8').replace(/\n$/, '')
    if (password.includes('\n') || password.includes('\r') || password.includes('\0') ||
        password.length < 12 || password.length > 256) throw new Error('Invalid password file')
    return password
  } catch {
    throw new Error('Protected password file cannot be read securely')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

async function main(): Promise<void> {
  if (process.env.ELOVA_BOOTSTRAP_PASSWORD !== undefined) throw new Error('Password environment handoff is forbidden')
  if (process.env.ELOVA_RUNTIME !== undefined && process.env.ELOVA_RUNTIME !== 'container') {
    throw new Error('Unsupported bootstrap runtime')
  }
  const container = process.env.ELOVA_RUNTIME === 'container'
  const databaseUrl = parseDatabaseUrl(protectedValue('DATABASE_URL', process.env, container), container)
  const email = process.env.ELOVA_BOOTSTRAP_EMAIL
  const displayName = process.env.ELOVA_BOOTSTRAP_NAME
  const path = process.env.ELOVA_BOOTSTRAP_PASSWORD_FILE
  if (!email || !displayName || !path) {
    throw new Error('ELOVA_BOOTSTRAP_EMAIL, ELOVA_BOOTSTRAP_NAME, and ELOVA_BOOTSTRAP_PASSWORD_FILE are required')
  }
  const password = readOperatorPassword(path)
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 3_000 })
  try {
    const owner = await bootstrapOwner(new PostgresRepository(pool), { email, displayName, password })
    process.stdout.write(`Initial owner created: ${owner.id}\n`)
  } catch (error) {
    if (error instanceof OwnerAlreadyExistsError) {
      process.stderr.write('Initial owner already exists; bootstrap is permanently closed.\n')
      process.exitCode = 2
      return
    }
    throw error
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => {
    process.stderr.write('Initial owner bootstrap failed; commit outcome may be unknown. Check PostgreSQL for an existing owner before retrying.\n')
    process.exitCode = 1
  })
}
