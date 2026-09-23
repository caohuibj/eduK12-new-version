import { describe, expect, it } from 'vitest'
import { postgresActivityMetricLines } from '../../services/postgresActivityMetrics'

describe('PostgreSQL activity metrics', () => {
  it('reports database-wide counts with explicit availability', async () => {
    const lines = await postgresActivityMetricLines({
      $queryRaw: async () => [{ connections: 8n, active: 3n, lockWaiters: 2n }],
    })
    expect(lines).toContain('ptool_pg_activity_available 1')
    expect(lines).toContain('ptool_pg_database_connections 8')
    expect(lines).toContain('ptool_pg_database_active_connections 3')
    expect(lines).toContain('ptool_pg_database_lock_waiters 2')
    expect(lines.join('\n')).not.toContain('SELECT')
  })

  it('omits counts when the database sample is unavailable', async () => {
    const lines = await postgresActivityMetricLines({
      $queryRaw: async () => { throw new Error('private connection details') },
    })
    expect(lines).toContain('ptool_pg_activity_available 0')
    expect(lines.join('\n')).not.toContain('ptool_pg_database_connections ')
    expect(lines.join('\n')).not.toContain('private connection details')
  })
})
