import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'
import { readOperatorPassword } from './bootstrap-owner.js'
import { parseDatabaseUrl, protectedValue } from './config.js'
import { PostgresRepository, OwnerEmailAlreadyExistsError } from './repository.js'
import { hashPassword } from './security.js'

// Operator-only, ordinary identity creation. No automatic workspace membership or global role.
export async function provisionOrdinaryUser(
  repository: Pick<PostgresRepository, 'createOrdinaryUser'>,
  input: { email: string; displayName: string; password: string },
): Promise<{ id: string; email: string; displayName: string }> {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (!email || email.length > 320 || !email.includes('@')) throw new Error('A valid user email is required')
  if (!displayName || displayName.length > 120) throw new Error('A valid user display name is required')
  const passwordHash = await hashPassword(input.password)
  const user = await repository.createOrdinaryUser({ email, displayName, passwordHash })
  return { id: user.id, email: user.email, displayName: user.displayName }
}

async function main(): Promise<void> {
  if (process.env.ELOVA_USER_PASSWORD !== undefined) throw new Error('Password environment handoff is forbidden')
  if (process.env.ELOVA_RUNTIME !== undefined && process.env.ELOVA_RUNTIME !== 'container') {
    throw new Error('Unsupported provisioning runtime')
  }
  const container = process.env.ELOVA_RUNTIME === 'container'
  const databaseUrl = parseDatabaseUrl(protectedValue('DATABASE_URL', process.env, container), container)
  const email = process.env.ELOVA_USER_EMAIL
  const displayName = process.env.ELOVA_USER_NAME
  const path = process.env.ELOVA_USER_PASSWORD_FILE
  if (!email || !displayName || !path) {
    throw new Error('ELOVA_USER_EMAIL, ELOVA_USER_NAME and ELOVA_USER_PASSWORD_FILE are required')
  }
  // The person chooses a password; only a protected local 0400 regular non-symlink file is accepted.
  const password = readOperatorPassword(path)
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 3_000 })
  try {
    const user = await provisionOrdinaryUser(new PostgresRepository(pool), { email, displayName, password })
    process.stdout.write(`Ordinary user created: ${user.id}\n`)
  } catch (error) {
    if (error instanceof OwnerEmailAlreadyExistsError) {
      process.stderr.write('User identifier already exists; no new user was created.\n')
      process.exitCode = 2
      return
    }
    throw error
  } finally { await pool.end() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => {
    process.stderr.write('Ordinary user provisioning failed; outcome may be unknown. Check for the exact identifier before retrying.\n')
    process.exitCode = 1
  })
}
