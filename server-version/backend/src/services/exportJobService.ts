import { provenanceSchema } from './assessmentExportArtifact'
import { randomUUID } from 'crypto'
import { ExportArtifactStatus, Prisma } from '@prisma/client'
import { exportQueue } from '../config/queue'
import { prisma } from '../config/database'
import { canonicalHash } from '../modules/assessment-runtime/canonical'
import { createExportArtifact } from './exportArtifactService'
import { assertExportLimits, EXPORT_RETENTION_HOURS } from './exportStorage'
import { logger } from '../utils/logger'

export type ExportJobFormat = 'csv' | 'sav' | 'sps' | 'xlsx' | 'zip'

export type ExportJobOptions = {
  creatorRole?: 'ADMIN' | 'TEACHER'
  projectionFingerprint?: string
  detail?: 'summary' | 'full' | 'research'
  anonymize: boolean
  includeProgress?: boolean
  minProgress?: number
  dateRange?: { start?: string; end?: string }
}

export type ExportJobPayload = { batchId: string }

export type ExportBatchArtifact = {
  id: string
  format: string
  fileName: string
  expiresAt: string
  downloadUrl: string
}

export type ExportBatchResponse = {
  batchId: string
  status: ExportArtifactStatus
  recordCount: number
  fieldCount: number | null
  artifacts: ExportBatchArtifact[]
  replayed: boolean
}

export const exportArtifactUrl = (type: string, id: string, artifactId: string): string =>
  type === 'COGNITIVE' ? `/api/cognitive/assignments/${id}/export/artifacts/${artifactId}`
  : type === 'COMPOSITE' ? `/api/composite-assessments/${id}/export/artifacts/${artifactId}`
  : `/api/${type === 'SCALE' ? 'scales' : 'questionnaires'}/exports/${artifactId}`

const ACTIVE_JOB_STATES = new Set(['active', 'waiting', 'delayed', 'paused'])
const REQUEST_KEY = /^[A-Za-z0-9_-]{16,160}$/

export const formatsForRequest = (resourceType: 'SCALE' | 'QUESTIONNAIRE' | 'COGNITIVE' | 'COMPOSITE', format: unknown): ExportJobFormat[] => {
  const normalized = typeof format === 'string' ? format.toLowerCase() : 'csv'
  if (resourceType === 'SCALE' && normalized === 'spss') return ['csv', 'sps']
  if (resourceType === 'COGNITIVE' && (normalized === 'zip' || normalized === 'xlsx')) return [normalized]
  if (resourceType === 'COMPOSITE' && normalized === 'zip') return ['zip']
  if (normalized === 'csv' || normalized === 'sav') return [normalized]
  throw Object.assign(new Error('不支持的导出格式'), { statusCode: 400 })
}

const pendingStorageKey = (resourceType: string, resourceId: string, batchId: string, format: ExportJobFormat): string =>
  `${resourceType.toLowerCase()}_${resourceId.substring(0, 8)}_${batchId}.${format}`

const normalizeOptions = (options: ExportJobOptions): ExportJobOptions => ({
  anonymize: Boolean(options.anonymize),
  ...(options.creatorRole ? { creatorRole: options.creatorRole } : {}),
  ...(options.projectionFingerprint ? { projectionFingerprint: options.projectionFingerprint } : {}),
  ...(options.detail ? { detail: options.detail } : {}),
  ...(options.includeProgress !== undefined ? { includeProgress: Boolean(options.includeProgress) } : {}),
  ...(options.minProgress !== undefined ? { minProgress: Number(options.minProgress) } : {}),
  ...(options.dateRange ? {
    dateRange: {
      ...(options.dateRange.start ? { start: options.dateRange.start } : {}),
      ...(options.dateRange.end ? { end: options.dateRange.end } : {}),
    },
  } : {}),
})

const batchJobId = (batchId: string): string => `export-${batchId}`

const conflict = (message: string): Error & { statusCode: number } =>
  Object.assign(new Error(message), { statusCode: 409 })

const responseForBatch = async (batchId: string, replayed: boolean): Promise<ExportBatchResponse> => {
  const batch = await prisma.exportBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw new Error('导出批次不存在')
  const artifacts = await prisma.exportArtifact.findMany({
    where: { batchId },
    orderBy: { format: 'asc' },
  })
  return {
    batchId,
    status: batch.status,
    recordCount: batch.recordCount,
    fieldCount: batch.fieldCount,
    replayed,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      format: artifact.format,
      fileName: artifact.storageKey,
      expiresAt: artifact.expiresAt.toISOString(),
      downloadUrl: exportArtifactUrl(batch.resourceType, batch.resourceId, artifact.id),
    })),
  }
}

export const ensureExportBatchEnqueued = async (batchId: string): Promise<boolean> => {
  const batch = await prisma.exportBatch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true },
  })
  if (!batch || batch.status !== ExportArtifactStatus.PROCESSING) return false

  const jobId = batchJobId(batchId)
  const current = await exportQueue.getJob(jobId)
  if (current) {
    const state = await current.getState()
    if (ACTIVE_JOB_STATES.has(state)) return true
    try { await current.remove() } catch {
      const refreshed = await current.getState().catch(() => 'unknown')
      if (ACTIVE_JOB_STATES.has(refreshed)) return true
      throw new Error(`无法回收旧导出队列任务 (${refreshed})`)
    }
  }

  await exportQueue.add({ batchId } satisfies ExportJobPayload, { jobId })
  return true
}

export const enqueueExportJob = async (params: {
  resourceType: 'SCALE' | 'QUESTIONNAIRE' | 'COGNITIVE' | 'COMPOSITE'
  resourceId: string
  createdBy: string
  anonymized: boolean
  format: unknown
  options: ExportJobOptions
  recordCount: number
  requestKey?: string
}): Promise<ExportBatchResponse> => {
  assertExportLimits({ records: params.recordCount })
  const formats = formatsForRequest(params.resourceType, params.format)
  const options = normalizeOptions(params.options)
  const requestKey = params.requestKey || randomUUID()
  if (!REQUEST_KEY.test(requestKey)) throw Object.assign(new Error('导出请求标识格式无效'), { statusCode: 400 })

  const requestHash = canonicalHash({
    schema: 'ExportBatchRequestV1',
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    createdBy: params.createdBy,
    anonymized: params.anonymized,
    formats,
    options,
  })
  const existing = await prisma.exportBatch.findUnique({
    where: { createdBy_requestKey: { createdBy: params.createdBy, requestKey } },
  })
  if (existing) {
    if (existing.requestHash !== requestHash) throw conflict('导出请求标识已用于不同参数')
    try { await ensureExportBatchEnqueued(existing.id) } catch (error) {
      logger.warn('导出批次重放时队列暂不可用，将由 worker reconciliation 恢复', {
        batchId: existing.id,
        errorType: error instanceof Error ? error.name : 'unknown',
      })
    }
    return responseForBatch(existing.id, true)
  }

  const batchId = randomUUID()
  const expiresAt = new Date(Date.now() + EXPORT_RETENTION_HOURS * 60 * 60 * 1000)
  let created = false
  try {
    await prisma.$transaction(async (tx) => {
      await tx.exportBatch.create({
        data: {
          id: batchId,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          createdBy: params.createdBy,
          anonymized: params.anonymized,
          formats,
          options: options as Prisma.InputJsonValue,
          requestKey,
          requestHash,
          recordCount: params.recordCount,
          expiresAt,
        },
      })
      for (const format of formats) {
        if (params.resourceType === 'COGNITIVE' || params.resourceType === 'COMPOSITE') {
          const provenance = provenanceSchema.parse({ version: 1, generation: batchId,
            creatorRole: options.creatorRole, audience: 'teacher', detail: options.detail ?? 'summary',
            dateRange: options.dateRange ?? {}, projectionFingerprint: options.projectionFingerprint, attemptIds: [] })
          await tx.exportArtifact.create({ data: { resourceType: params.resourceType, resourceId: params.resourceId,
            createdBy: params.createdBy, format, anonymized: params.anonymized,
            storageKey: pendingStorageKey(params.resourceType, params.resourceId, batchId, format),
            status: ExportArtifactStatus.PROCESSING, batchId, expiresAt, provenance } })
        } else {
        await createExportArtifact({
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          createdBy: params.createdBy,
          format,
          anonymized: params.anonymized,
          storageKey: pendingStorageKey(params.resourceType, params.resourceId, batchId, format),
          status: ExportArtifactStatus.PROCESSING,
          batchId,
          expiresAt,
        }, tx)
        }
      }
    })
    created = true
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error
  }

  if (!created) {
    const raced = await prisma.exportBatch.findUnique({
      where: { createdBy_requestKey: { createdBy: params.createdBy, requestKey } },
    })
    if (!raced || raced.requestHash !== requestHash) throw conflict('导出请求标识发生冲突')
    try { await ensureExportBatchEnqueued(raced.id) } catch (error) {
      logger.warn('并发导出请求已持久化但队列暂不可用', { batchId: raced.id })
    }
    return responseForBatch(raced.id, true)
  }

  try {
    await ensureExportBatchEnqueued(batchId)
  } catch (error) {
    // PostgreSQL intent is authoritative. Do not turn a durable request into a
    // terminal failure merely because Redis was unavailable after commit.
    logger.warn('导出批次已持久化但队列暂不可用，将由 worker reconciliation 恢复', {
      batchId,
      errorType: error instanceof Error ? error.name : 'unknown',
    })
  }
  return responseForBatch(batchId, false)
}

export type ClaimedExportBatch = {
  batchId: string
  generation: number
  resourceType: 'SCALE' | 'QUESTIONNAIRE' | 'COGNITIVE' | 'COMPOSITE'
  resourceId: string
  options: ExportJobOptions
  createdBy: string
  createdAt: Date
  artifactIds: string[]
}

export const claimExportBatch = async (batchId: string, jobId: string): Promise<ClaimedExportBatch | null> =>
  prisma.$transaction(async (tx) => {
    const current = await tx.exportBatch.findUnique({ where: { id: batchId } })
    if (!current || current.status !== ExportArtifactStatus.PROCESSING) return null
    if (current.expiresAt <= new Date()) {
      await tx.exportBatch.update({ where: { id: batchId }, data: { status: ExportArtifactStatus.FAILED, errorCode: 'EXPORT_EXPIRED' } })
      await tx.exportArtifact.updateMany({ where: { batchId }, data: { status: ExportArtifactStatus.FAILED, errorCode: 'EXPORT_EXPIRED' } })
      return null
    }
    const generation = current.generation + 1
    const claimed = await tx.exportBatch.updateMany({
      where: { id: batchId, status: ExportArtifactStatus.PROCESSING, generation: current.generation },
      data: {
        generation,
        processingJobId: jobId,
        processingStartedAt: new Date(),
        errorCode: null,
      },
    })
    if (claimed.count !== 1) return null
    const artifacts = await tx.exportArtifact.findMany({
      where: { batchId, status: ExportArtifactStatus.PROCESSING },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
    if (artifacts.length === 0) throw new Error('导出批次缺少 PROCESSING artifact')
    return {
      batchId,
      generation,
      resourceType: current.resourceType as 'SCALE' | 'QUESTIONNAIRE' | 'COGNITIVE' | 'COMPOSITE',
      resourceId: current.resourceId,
      createdBy: current.createdBy, createdAt: current.createdAt,
      options: current.options as unknown as ExportJobOptions,
      artifactIds: artifacts.map((artifact) => artifact.id),
    }
  })

export const releaseExportBatchAttempt = async (batchId: string, generation: number): Promise<void> => {
  await prisma.exportBatch.updateMany({
    where: { id: batchId, status: ExportArtifactStatus.PROCESSING, generation },
    data: { processingJobId: null, processingStartedAt: null },
  })
}

export const publishExportBatch = async (params: {
  batchId: string
  generation: number
  fieldCount: number
  recordCount?: number
  storageKeys: Array<{ artifactId: string; storageKey: string; provenance?: Prisma.InputJsonValue }>
}): Promise<boolean> => prisma.$transaction(async (tx) => {
  // Fence the generation first. The row lock is retained until the artifact
  // metadata updates commit, so a stale worker cannot publish any READY row.
  const fenced = await tx.exportBatch.updateMany({
    where: { id: params.batchId, status: ExportArtifactStatus.PROCESSING, generation: params.generation },
    data: {
      status: ExportArtifactStatus.READY,
      fieldCount: params.fieldCount,
      ...(params.recordCount !== undefined ? { recordCount: params.recordCount } : {}),
      processingJobId: null,
      processingStartedAt: null,
      errorCode: null,
    },
  })
  if (fenced.count !== 1) return false

  const artifacts = await tx.exportArtifact.findMany({
    where: { batchId: params.batchId, status: ExportArtifactStatus.PROCESSING },
    select: { id: true },
  })
  if (artifacts.length !== params.storageKeys.length) throw new Error('导出批次 artifact 数量不一致')
  const expected = new Set(artifacts.map((artifact) => artifact.id))
  if (params.storageKeys.some((entry) => !expected.has(entry.artifactId))) throw new Error('导出批次 artifact 身份不一致')
  for (const entry of params.storageKeys) {
    await tx.exportArtifact.update({
      where: { id: entry.artifactId },
      data: { storageKey: entry.storageKey, ...(entry.provenance ? { provenance: entry.provenance } : {}), status: ExportArtifactStatus.READY, errorCode: null },
    })
  }
  return true
})

export const failExportBatchFinal = async (batchId: string, generation: number, errorCode = 'EXPORT_FAILED'): Promise<boolean> =>
  prisma.$transaction(async (tx) => {
    const updated = await tx.exportBatch.updateMany({
      where: { id: batchId, status: ExportArtifactStatus.PROCESSING, generation },
      data: {
        status: ExportArtifactStatus.FAILED,
        processingJobId: null,
        processingStartedAt: null,
        errorCode,
      },
    })
    if (updated.count !== 1) return false
    await tx.exportArtifact.updateMany({
      where: { batchId, status: ExportArtifactStatus.PROCESSING },
      data: { status: ExportArtifactStatus.FAILED, errorCode },
    })
    return true
  })

export const isFinalExportAttempt = (job: any): boolean => {
  const attempts = Math.max(1, Number(job?.opts?.attempts || 1))
  const attemptsMade = Math.max(0, Number(job?.attemptsMade || 0))
  return attemptsMade + 1 >= attempts
}

export const reconcilePendingExportBatches = async (): Promise<number> => {
  const batches = await prisma.exportBatch.findMany({
    where: { status: ExportArtifactStatus.PROCESSING },
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
    take: 100,
  })
  let ensured = 0
  for (const batch of batches) {
    try {
      if (await ensureExportBatchEnqueued(batch.id)) ensured += 1
    } catch (error) {
      logger.warn('导出 reconciliation 暂无法提交队列', {
        batchId: batch.id,
        errorType: error instanceof Error ? error.name : 'unknown',
      })
    }
  }
  return ensured
}
