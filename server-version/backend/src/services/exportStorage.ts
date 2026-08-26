import * as fs from 'fs'
import * as path from 'path'

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

export const ensureExportFileWithinLimit = (filePath: string): void => {
  const bytes = fs.statSync(filePath).size
  try {
    assertExportLimits({ bytes })
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    throw error
  }
}
