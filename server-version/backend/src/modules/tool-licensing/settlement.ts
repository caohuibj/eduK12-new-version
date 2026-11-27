import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { isToolLicensingEnabled } from './runtime'

type ReadFence = { before: Date; xid: string }

export async function captureToolLicenseSettlementFence(): Promise<ReadFence> {
  const [fence] = await prisma.$queryRaw<ReadFence[]>`
    SELECT statement_timestamp() AS "before", pg_current_xact_id()::text AS xid
  `
  return fence
}

/** Settle one due frozen education allocation. START already acquires a
 * row lock (and a transaction ID) before checking its intake deadline.
 * Wait for pre-cutoff transactions to leave the snapshot horizon so a
 * just-admitted execution cannot be mistaken for unused quota. Only the
 * commercial ledger is locked; the execution and claim reads are MVCC. */
export async function settleOneToolPublication(fence: ReadFence) {
  return prisma.$transaction(async tx => {
    const [result] = await tx.$queryRaw<Array<{ id: string; released: number | null }>>(Prisma.sql`
      WITH next_charge AS MATERIALIZED (
        SELECT c.license_id,c.tool_key,c.publication_id,c.quantity,c.track_ids,l.subject_id
        FROM tool_license_charges c
        JOIN tool_licenses l ON l.id=c.license_id AND l.product IN ('SCHOOL','TEACHER')
        JOIN assessment_runs r ON r.id=c.publication_id AND r.organization_id=l.subject_id
          AND r.intake_deadline=c.settle_after
        WHERE c.settled_at IS NULL AND c.settle_after<=${fence.before}
          AND pg_snapshot_xmin(pg_current_snapshot())>=${fence.xid}::xid8
        ORDER BY c.settle_after,c.publication_id,c.license_id,c.tool_key
        LIMIT 1 FOR UPDATE OF c SKIP LOCKED
      ), refund AS MATERIALIZED (
        SELECT c.*, c.quantity-(
          SELECT count(*)::int FROM assessment_run_executions e
          WHERE e.organization_id=c.subject_id AND e.run_id=c.publication_id
            AND (cardinality(c.track_ids)=0 OR e.track_id=ANY(c.track_ids))
            AND (e.started_at IS NOT NULL OR e.runtime_binding_ref IS NOT NULL OR EXISTS (
              SELECT 1 FROM assessment_run_execution_start_claims claim
              WHERE claim.execution_id=e.id AND claim.state<>'ABORTED'
            ))
        ) AS released FROM next_charge c
      ), credited AS (
        UPDATE tool_license_items i SET used=i.used-f.released FROM refund f
        WHERE i.license_id=f.license_id AND i.tool_key=f.tool_key AND f.released>=0 AND i.used>=f.released
        RETURNING i.license_id,i.tool_key,f.publication_id,f.released
      ), settled AS (
        UPDATE tool_license_charges c SET settled_at=clock_timestamp(),released=i.released
        FROM credited i WHERE c.license_id=i.license_id AND c.tool_key=i.tool_key AND c.publication_id=i.publication_id
        RETURNING c.released
      )
      SELECT (SELECT publication_id FROM next_charge) AS id,(SELECT released FROM settled) AS released
      WHERE EXISTS(SELECT 1 FROM next_charge)
    `)
    if (result?.released === null) throw new Error('Education publication reservation no longer matches its frozen run')
    return result?.released
  }, { maxWait: 1000, timeout: 3000 })
}

export function startToolLicenseSettlement(onError: (cause: unknown) => void) {
  if (!isToolLicensingEnabled('SCHOOL') && !isToolLicensingEnabled('TEACHER')) return () => {}
  let lastFence: ReadFence | undefined
  let running = false
  let stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      const nextFence = await captureToolLicenseSettlementFence()
      if (lastFence) {
        for (let index = 0; index < 10 && !stopped; index += 1) {
          if (await settleOneToolPublication(lastFence) === undefined) break
        }
      }
      lastFence = nextFence
    } catch (cause) {
      onError(cause)
    } finally {
      running = false
    }
  }
  const interval = setInterval(() => { void tick() }, 60_000)
  interval.unref()
  return () => {
    stopped = true
    clearInterval(interval)
  }
}
