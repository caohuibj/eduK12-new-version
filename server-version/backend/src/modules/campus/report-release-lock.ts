import { Client } from 'pg'
import { reportingFail } from '../reporting/types'

/**
 * A SCHOOL group mean is a disclosure, not merely a heavy query. The
 * previously separate GROUP and longitudinal admission checks could both
 * see an empty history, write overlapping frozen cohorts and then release
 * incompatible averages. A process-local queue / Redis lease with an expiry
 * cannot serialize disclosure across backend workers and slow generations.
 *
 * Use one PostgreSQL SESSION advisory lock per school, held through:
 *   current authorization -> whole-cohort checks -> canonical artifact write
 *   -> authorized read -> historical overlap re-check -> response projection.
 *
 * Unlike a long Prisma interactive transaction, this dedicated connection
 * does not hold an MVCC transaction open while the reporting engine performs
 * its own bounded work on normal Prisma connections. The lock is released
 * on disconnect, including process termination. Contention fails closed
 * (409) rather than queuing indefinitely on a 4C4G installation.
 *
 * This is only for SCHOOL governed group reads/generation, never TRAINING.
 */
export async function withCampusReportReleaseLock<T>(
  organizationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const url = process.env.DATABASE_URL
  if (!url) return reportingFail(
    'CAMPUS_REPORT_RELEASE_LOCK_UNAVAILABLE', 'school reporting lock unavailable', 503,
  )
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 })
  const key = `huischool-report-release:v1:${organizationId}`
  let connected = false
  let locked = false
  let connectionHealthy = true
  // An idle pg.Client emits error events if the DB connection drops during
  // scoring. This must become a failed / withheld response, not a process crash.
  client.on('error', () => { connectionHealthy = false })
  try {
    await client.connect()
    connected = true
    const result = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS acquired',
      [key],
    )
    if (result.rows[0]?.acquired !== true) return reportingFail(
      'CAMPUS_REPORT_RELEASE_BUSY',
      'another report release is in progress for this school', 409,
    )
    locked = true
    const response = await operation()
    // A lost session also lost its lock. The artifact may already exist, but
    // its values MUST NOT leave the SCHOOL response before a valid re-check.
    if (!connectionHealthy) return reportingFail(
      'CAMPUS_REPORT_RELEASE_LOCK_UNAVAILABLE', 'school reporting lock was lost', 503,
    )
    const released = await client.query<{ released: boolean }>(
      'SELECT pg_advisory_unlock(hashtextextended($1::text, 0)) AS released',
      [key],
    )
    if (released.rows[0]?.released !== true) return reportingFail(
      'CAMPUS_REPORT_RELEASE_LOCK_UNAVAILABLE', 'school reporting lock was lost', 503,
    )
    locked = false
    return response
  } finally {
    // Closing the exact session also releases a held lock after an error.
    // Never return a projection while a connection failure is undetected.
    if (connected) {
      try { await client.end() } catch { /* broken socket is already closed */ }
    } else {
      try { await client.end() } catch { /* failed connect */ }
    }
    // Not releasing a lock with a separate pooled client is intentional:
    // advisory locks belong to the specific PostgreSQL session.
    void locked
  }
}
