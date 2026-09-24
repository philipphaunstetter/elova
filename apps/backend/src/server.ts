import { once } from 'node:events'
import { loadConfig } from './config.js'
import { PostgresGateway } from './database.js'
import { createBackendServer } from './http-server.js'
import { loadMigrations } from './migrations.js'

function listen(
  server: ReturnType<typeof createBackendServer>,
  port: number,
  host: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const listening = () => {
      server.off('error', failed)
      resolve()
    }
    const failed = (error: Error) => {
      server.off('listening', listening)
      reject(error)
    }
    server.once('error', failed)
    server.once('listening', listening)
    server.listen(port, host)
  })
}

async function main(): Promise<void> {
  const config = loadConfig()
  const migrations = await loadMigrations(config.migrationsDirectory)
  const database = new PostgresGateway(config.databaseUrl, migrations)
  const server = createBackendServer(database)
  let shuttingDown = false

  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true

    server.close()
    const forcedExit = setTimeout(() => process.exit(1), 10_000)
    forcedExit.unref()

    await once(server, 'close')
    await database.close()
    clearTimeout(forcedExit)
  }

  try {
    await listen(server, config.port, config.host)
  } catch (error) {
    await database.close()
    throw error
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  server.on('error', () => {
    console.error('Elova backend server error')
    process.exitCode = 1
    void shutdown().catch(() => undefined)
  })

  console.log('Elova backend is listening')
}

main().catch(() => {
  console.error('Elova backend failed to start')
  process.exitCode = 1
})
