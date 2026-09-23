type ActivityRow = {
  connections: bigint | number
  active: bigint | number
  lockWaiters: bigint | number
}

type ReadOnlyDatabase = {
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<ActivityRow[]>
}

const count = (value: bigint | number): number | null => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

/** Database-wide PostgreSQL backend gauges, sampled only on /metrics scrape. */
export const postgresActivityMetricLines = async (db: ReadOnlyDatabase): Promise<string[]> => {
  try {
    const rows = await db.$queryRaw`
      SELECT COUNT(*)::bigint AS connections,
             COUNT(*) FILTER (WHERE state = 'active')::bigint AS active,
             COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::bigint AS "lockWaiters"
      FROM pg_stat_activity
      WHERE datname = current_database() AND backend_type = 'client backend'
    `
    const row = rows[0]
    if (!row) throw new Error('Missing PostgreSQL activity row')
    const connections = count(row.connections)
    const active = count(row.active)
    const lockWaiters = count(row.lockWaiters)
    if (connections === null || active === null || lockWaiters === null) throw new Error('Invalid PostgreSQL activity counts')
    return [
      '# HELP ptool_pg_activity_available Whether the database-wide activity sample succeeded.',
      '# TYPE ptool_pg_activity_available gauge',
      'ptool_pg_activity_available 1',
      '# HELP ptool_pg_database_connections Client backends for the current database; not this API process pool size.',
      '# TYPE ptool_pg_database_connections gauge',
      `ptool_pg_database_connections ${connections}`,
      '# HELP ptool_pg_database_active_connections Active client backends for the current database.',
      '# TYPE ptool_pg_database_active_connections gauge',
      `ptool_pg_database_active_connections ${active}`,
      '# HELP ptool_pg_database_lock_waiters Client backends waiting on PostgreSQL locks.',
      '# TYPE ptool_pg_database_lock_waiters gauge',
      `ptool_pg_database_lock_waiters ${lockWaiters}`,
    ]
  } catch {
    // A failed sample is unavailable, not zero load; metrics must not affect
    // the application response or disclose SQL, parameters, or identities.
    return [
      '# HELP ptool_pg_activity_available Whether the database-wide activity sample succeeded.',
      '# TYPE ptool_pg_activity_available gauge',
      'ptool_pg_activity_available 0',
    ]
  }
}
