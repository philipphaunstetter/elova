import { Pool } from 'pg'
import type { Migration } from './migrations.js'
import { migrationsAreCompatible } from './migrations.js'

export interface ReadinessChecks {
  database: 'ready' | 'not_ready'
  migrations: 'ready' | 'not_ready'
}

export interface DatabaseGateway {
  readiness(): Promise<ReadinessChecks>
  close(): Promise<void>
}

export class PostgresGateway implements DatabaseGateway {
  readonly pool: Pool

  constructor(databaseUrl: string, private readonly migrations: Migration[]) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 3_000,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: false,
    })
  }

  async readiness(): Promise<ReadinessChecks> {
    try {
      await this.pool.query('SELECT 1')
    } catch {
      return { database: 'not_ready', migrations: 'not_ready' }
    }

    const compatible = await migrationsAreCompatible(this.pool, this.migrations)
    return {
      database: 'ready',
      migrations: compatible ? 'ready' : 'not_ready',
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
