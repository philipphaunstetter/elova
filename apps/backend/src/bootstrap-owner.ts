import { pathToFileURL } from 'node:url'
import { Pool } from 'pg'
import { parseDatabaseUrl } from './config.js'
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

async function main(): Promise<void> {
  const databaseUrl = parseDatabaseUrl(process.env.DATABASE_URL)
  const email = process.env.ELOVA_BOOTSTRAP_EMAIL
  const displayName = process.env.ELOVA_BOOTSTRAP_NAME
  const password = process.env.ELOVA_BOOTSTRAP_PASSWORD
  if (!email || !displayName || !password) {
    throw new Error('ELOVA_BOOTSTRAP_EMAIL, ELOVA_BOOTSTRAP_NAME, and ELOVA_BOOTSTRAP_PASSWORD are required')
  }
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
