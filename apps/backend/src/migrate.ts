import { Pool } from 'pg'
import { loadConfig } from './config.js'
import { applyMigrations, loadMigrations } from './migrations.js'

async function main(): Promise<void> {
  const config = loadConfig()
  const migrations = await loadMigrations(config.migrationsDirectory)
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
  })

  try {
    await applyMigrations(pool, migrations)
    console.log(`Applied ${migrations.length} ordered migration(s)`)
  } finally {
    await pool.end()
  }
}

main().catch(() => {
  console.error('Database migration failed')
  process.exitCode = 1
})
