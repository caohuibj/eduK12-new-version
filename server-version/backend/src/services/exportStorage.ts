import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../config/database'
import { exportRoot, validateStorageKey } from './exportArtifactService'

const parsePositiveInt = (name: string, fallback: number): number => {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export const EXPORT_MAX_RECORDS = parsePositiveInt('EXPORT_MAX_RECORDS', 10_000)
export const EXPORT_MAX_TRIALS = parsePositiveInt('EXPORT_MAX_TRIALS', 100_000)
export const EXPORT_MAX_FIELDS = parsePositiveInt('EXPORT_MAX_FIELDS', 2_000)
export const EXPORT_MAX_BYTES = parsePositiveInt('EXPORT_MAX_BYTES', 50 * 1024 * 1024)
export const EXPORT_RETENTION_HOURS = parsePositiveInt('EXPORT_RETENTION_HOURS', 24)

export const exportLimitError = (message: string): Error & { statusCode: number } => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = 413
  return error
}

export const assertExportLimits = (input: {
  records?: number
  trials?: number
  fields?: number
  bytes?: number
}): void => {
  if ((input.records ?? 0) > EXPORT_MAX_RECORDS) {
    throw exportLimitError('导出记录数超过上限（最多 ' + EXPORT_MAX_RECORDS + ' 条），请缩小日期范围')
  }
  if ((input.trials ?? 0) > EXPORT_MAX_TRIALS) {
    throw exportLimitError('导出试次数超过上限（最多 ' + EXPORT_MAX_TRIALS + ' 次），请缩小日期范围')
  }
  if ((input.fields ?? 0) > EXPORT_MAX_FIELDS) {
    throw exportLimitError('导出字段数超过上限（最多 ' + EXPORT_MAX_FIELDS + ' 个），请缩小导出范围')
  }
  if ((input.bytes ?? 0) > EXPORT_MAX_BYTES) {
    throw exportLimitError('导出文件超过大小上限（最多 ' + Math.floor(EXPORT_MAX_BYTES / (1024 * 1024)) + ' MB）')
  }
}

export const cleanupExpiredExportFiles = (
  exportDir: string,
  prefixes: readonly string[] = ['cognitive_', 'composite_']
): void => {
  if (!fs.existsSync(exportDir)) return

  const cutoff = Date.now() - EXPORT_RETENTION_HOURS * 60 * 60 * 1000
  for (const entry of fs.readdirSync(exportDir, { withFileTypes: true })) {
    if (!entry.isFile() || !prefixes.some((prefix) => entry.name.startsWith(prefix))) continue

    const filePath = path.join(exportDir, entry.name)
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs < cutoff) fs.unlinkSync(filePath)
  }
}

/**
 * Remove only files named by expired ExportArtifact metadata. Directory scans
 * are intentionally not used for artifact cleanup: an operator can safely
 * keep unrelated legacy exports without them being guessed or deleted.
 */
export const cleanupExpiredExportArtifacts = async (
  db: typeof prisma = prisma,
  now = new Date(),
): Promise<{ deletedArtifacts: number; deletedFiles: number; invalidPaths: number }> => {
  const rows = await db.exportArtifact.findMany({
    where: {
      expiresAt: { lte: now },
      status: { in: ['READY', 'FAILED'] },
    },
    select: { id: true, storageKey: true },
    orderBy: { expiresAt: 'asc' },
    take: 100,
  })
  let deletedFiles = 0
  let invalidPaths = 0
  const deletedIds: string[] = []
  for (const row of rows) {
    try {
      const filePath = validateStorageKey(row.storageKey)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        deletedFiles += 1
      }
    } catch {
      invalidPaths += 1
      // Invalid metadata is still removed; it cannot authorize a download and
      // must not be allowed to poison future cleanup runs.
    }
    deletedIds.push(row.id)
  }
  if (deletedIds.length > 0) await db.exportArtifact.deleteMany({ where: { id: { in: deletedIds } } })

  // Batch intents are terminal metadata and can be reaped separately. Never
  // delete PROCESSING batches: worker recovery owns those generations.
  const expiredBatches = await db.exportBatch.findMany({
    where: { expiresAt: { lte: now }, status: { in: ['READY', 'FAILED'] } },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: 100,
  })
  if (expiredBatches.length > 0) {
    await db.exportBatch.deleteMany({ where: { id: { in: expiredBatches.map((batch) => batch.id) } } })
  }

  // Touch the root to make the configured storage location explicit for
  // callers/metrics without recursively scanning it.
  void exportRoot()
  return { deletedArtifacts: deletedIds.length, deletedFiles, invalidPaths }
}

export const ensureExportFileWithinLimit = (filePath: string): void => {
  const bytes = fs.statSync(filePath).size
  try {
    assertExportLimits({ bytes })
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    throw error
  }
}
