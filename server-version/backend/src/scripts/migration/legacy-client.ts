import { Pool, types, type PoolClient, type QueryResultRow } from 'pg'

/**
 * Read-only client for the restored legacy `ptool` database (ptool_legacy).
 *
 * The connection must point at a database restored from the final stop-write
 * pg_dump (PG14 dump restores cleanly on PG16). Operators provision a
 * read-only role for this connection; the importer never writes to the
 * legacy database.
 */
export class LegacyClient {
  private readonly pool: Pool
  private snapshot?: PoolClient

  constructor(connectionString: string) {
    if (!connectionString) throw new Error('DATABASE_URL_LEGACY is required')
    this.pool = new Pool({ connectionString, max: 1, options: '-c default_transaction_read_only=on', types: { getTypeParser: (oid: number, format?: 'text' | 'binary') => oid === 1114 ? (value: string) => new Date(value.replace(' ', 'T') + 'Z') : types.getTypeParser(oid, format) } })
  }

  async query<T extends QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
    const res = await (this.snapshot ?? this.pool).query<T>(sql, values)
    return res.rows
  }

  async beginSnapshot(): Promise<void> {
    this.snapshot = await this.pool.connect()
    await this.snapshot.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const role = await this.snapshot.query(`SELECT rolsuper, rolcreaterole, rolcreatedb,
      has_table_privilege(current_user,'assessments','INSERT,UPDATE,DELETE,TRUNCATE') AS writable
      FROM pg_roles WHERE rolname=current_user`)
    if (!role.rows[0] || role.rows[0].rolsuper || role.rows[0].rolcreaterole || role.rows[0].rolcreatedb || role.rows[0].writable) throw new Error('Legacy source requires a restricted SELECT-only role')
  }

  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      return await fn(client)
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    if (this.snapshot) { await this.snapshot.query('ROLLBACK'); this.snapshot.release() }
    await this.pool.end()
  }
}

/** Legacy numeric(65,30) columns arrive as strings; coerce safely. */
export const legacyNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}
