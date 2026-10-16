import { statfs } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { prisma } from '../../config/database'
import { QuestionnaireCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'
export const detachedWholeReceiptsEnabled = () => process.env.ASSESSMENT_WHOLE_DURABLE_BACKLOG_ENABLED === 'true'
type Sample = { freeBytes: number; unfinished: number }
export class WholeReceiptStorageAdmission {
  private sample: Sample | null = null
  private expiresAt = 0
  private localAccepted = 0
  private refreshing: Promise<void> | null = null
  constructor(private readonly read: () => Promise<Sample>, private readonly clock = () => performance.now(),
    private readonly minFreeBytes = 2 * 1024 ** 3, private readonly highWater = 20000) {}
  async admit(): Promise<void> {
    if (!this.sample || this.clock() >= this.expiresAt) {
      this.refreshing ??= this.read().then(value => {
        this.sample = value; this.localAccepted = 0; this.expiresAt = this.clock() + 2000
      }).finally(() => { this.refreshing = null })
      try { await this.refreshing } catch { throw new QuestionnaireCompletionAdmissionBusyError('queue_full', 5) }
    }
    if (!this.sample || this.sample.freeBytes < this.minFreeBytes || this.sample.unfinished + this.localAccepted >= this.highWater) {
      throw new QuestionnaireCompletionAdmissionBusyError('queue_full', 5)
    }
  }
  accepted(): number { this.localAccepted++; return (this.sample?.unfinished ?? 0) + this.localAccepted }
}
const storage = new WholeReceiptStorageAdmission(async () => {
  // Sampled storage high-water guard, with bounded overshoot; never a shared per-receipt UPDATE.
  const [fs, rows] = await Promise.all([
    statfs(process.cwd()),
    prisma.$queryRaw<Array<{ unfinished: bigint }>>`
      SELECT count(*) AS unfinished FROM "composite_report_jobs"
      WHERE "whole_submission_id" IS NOT NULL AND "status" IN ('PENDING','PROCESSING','FAILED')
    `,
  ])
  return { freeBytes: fs.bavail * fs.bsize, unfinished: Number(rows[0]?.unfinished ?? 0) }
})
export const admitWholeReceiptStorage = async (): Promise<void> => {
  if (detachedWholeReceiptsEnabled()) await storage.admit()
}
export const recordWholeReceiptStored = () => storage.accepted()
