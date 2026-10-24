import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { buildZipStore } from '../cognitive/export-zip'
import { exportRoot, validateStorageKey } from '../../services/exportArtifactService'
import { assertExportLimits, EXPORT_MAX_BYTES } from '../../services/exportStorage'
import { trainingAnalysisSelectorSchema, trainingAnalysisManifestSchema, assertTrainingManifest } from './manifest'
import { trainingAnalysisTableToCsv } from './core'

/** Stored only in the existing ExportBatch intent. HTTP callers supply a digest;
 * the authorized analysis service supplies the exact server-owned manifest. */
export const trainingAnalysisExportOptionsSchema = z.object({
  version: z.literal(1),
  selector: trainingAnalysisSelectorSchema,
  manifest: trainingAnalysisManifestSchema,
  table: z.enum(['long', 'wide', 'dictionary']),
}).strict().superRefine((value, context) => {
  try {
    assertTrainingManifest(value.manifest)
    if (canonicalHash(value.selector) !== canonicalHash(value.manifest.selector)) throw new Error('Selector mismatch')
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid frozen Training analysis manifest' })
  }
})
export type TrainingAnalysisExportOptions = z.infer<typeof trainingAnalysisExportOptionsSchema>

export const trainingAnalysisProvenanceSchema = z.object({
  version: z.literal(2),
  resourceType: z.literal('TRAINING_ANALYSIS'),
  generation: z.string().guid(),
  creatorRole: z.enum(['ADMIN', 'TEACHER']),
  audience: z.literal('teacher'),
  trainingAnalysis: trainingAnalysisExportOptionsSchema,
}).strict()

export type TrainingAnalysisExportTable = { columns: string[]; rows: Record<string, unknown>[] }
export type TrainingAnalysisExportTables = Record<'long' | 'wide' | 'dictionary', TrainingAnalysisExportTable>

export function assertTrainingAnalysisExportIdentity(options: TrainingAnalysisExportOptions, input: {
  courseId: string; createdBy: string; creatorRole: string | undefined;
}) {
  if (options.selector.courseId !== input.courseId || options.manifest.courseId !== input.courseId
    || options.manifest.actor.id !== input.createdBy || options.manifest.actor.role !== input.creatorRole) {
    throw new Error('Training export identity changed')
  }
}

/** Materialized tables only: never query the source, rebuild a selector, or
 * consult a live task definition while serializing the approved sample. */
export function trainingAnalysisExportBytes(input: {
  options: TrainingAnalysisExportOptions; tables: TrainingAnalysisExportTables; format: string;
}): Buffer {
  const options = trainingAnalysisExportOptionsSchema.parse(input.options)
  if (input.format !== 'csv' && input.format !== 'zip') throw new Error('Unsupported Training analysis export format')
  const names = input.format === 'zip' ? ['long', 'wide', 'dictionary'] as const : [options.table]
  const entries = names.map(name => {
    const table = input.tables[name]
    assertExportLimits({ records: table.rows.length, fields: table.columns.length })
    const data = '\uFEFF' + trainingAnalysisTableToCsv(table)
    assertExportLimits({ bytes: Buffer.byteLength(data, 'utf8') })
    return { name: `${name}.csv`, data }
  })
  if (input.format === 'csv') return Buffer.from(entries[0].data, 'utf8')

  // Internal participant/source lists and authority hashes must never appear in
  // user-facing package metadata. Provenance remains in ExportArtifact only.
  const summary = {
    schemaVersion: 1,
    kind: 'TRAINING_ANALYSIS_EXPORT',
    courseId: options.selector.courseId,
    manifestHash: options.manifest.manifestHash,
    mode: options.selector.mode,
    sourceCutoff: options.manifest.sourceCutoff,
    waves: options.selector.waves,
    tables: Object.fromEntries(names.map(name => [name, {
      rowCount: input.tables[name].rows.length,
      columnCount: input.tables[name].columns.length,
      schemaHash: canonicalHash(input.tables[name].columns),
    }])),
  }
  const metadata = JSON.stringify(summary, null, 2) + '\n'
  const readme = 'Training 数值分析导出。\nlong.csv、wide.csv 与 dictionary.csv 来自同一次冻结样本和字段定义。\nmanifest.json 仅包含导出摘要；行级来源与授权清单保留在服务端。\n缺失值须结合对应原因列解释，不能当作零。跨波次比较仅按冻结定义的可比性判断，不生成新评分、诊断或常模。\n'
  assertExportLimits({ bytes: entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.data, 'utf8'), 0)
    + Buffer.byteLength(metadata, 'utf8') + Buffer.byteLength(readme, 'utf8') })
  const bytes = buildZipStore([...entries, { name: 'manifest.json', data: metadata }, { name: 'README.txt', data: readme }])
  assertExportLimits({ bytes: bytes.length })
  return bytes
}

/** Uses the original worker's generation-bound file lifecycle and cleanup.
 * The worker alone publishes READY metadata after live revalidation. */
export async function saveTrainingAnalysisExport(input: {
  options: TrainingAnalysisExportOptions; tables: TrainingAnalysisExportTables; format: string;
  batchId: string; generation: number;
}): Promise<string> {
  const bytes = trainingAnalysisExportBytes(input)
  if (bytes.length > EXPORT_MAX_BYTES) throw new Error('Training export exceeds EXPORT_MAX_BYTES')
  const key = `training_analysis_${input.options.selector.courseId.substring(0, 8)}_${input.batchId}__generation_${input.generation}.${input.format}`
  const filePath = `${validateStorageKey(key)}.tmp-${randomUUID()}`
  await fs.mkdir(exportRoot(), { recursive: true })
  try {
    await fs.writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 })
    return filePath
  } catch (error) {
    await fs.rm(filePath, { force: true }).catch(() => undefined)
    throw error
  }
}
