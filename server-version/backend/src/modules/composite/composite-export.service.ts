import * as fs from 'fs'
import { createHash } from 'crypto'
import * as path from 'path'
import { saveToFile, SavVariable, VariableMeasure, VariableType } from 'sav-writer'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../../config/database'
import { safeDecrypt } from '../../utils/encryption'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { readFrozenReport } from '../cognitive/profile-freeze'
import { exportCognitiveToCSV, scalarExportValue } from '../cognitive/export.service'
import { getFrozenPackageSlotLabels } from './report-package-label'
import {
  assertExportLimits,
  cleanupExpiredExportFiles,
  ensureExportFileWithinLimit,
  EXPORT_MAX_FIELDS,
  EXPORT_MAX_RECORDS,
  EXPORT_MAX_TRIALS,
  exportLimitError,
} from '../../services/exportStorage'

export type CompositeExportDetail = 'summary' | 'full'
export type CompositeExportFormat = 'csv' | 'sav'

export interface CompositeExportField {
  name: string
  label: string
  type: 'numeric' | 'string' | 'date'
  width?: number
  decimals?: number
}

export interface CompositeExportData {
  assessmentId: string
  assessmentName: string
  detail: CompositeExportDetail
  fields: CompositeExportField[]
  rows: Record<string, unknown>[]
  trialCount: number
}

const EXPORT_DIR = path.join(__dirname, '../../../exports')

const fieldName = (prefix: string, value: string) => {
  const safe = value.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'value'
  const base = `${prefix}${safe}`
  if (base.length <= 64) return base
  const suffix = createHash('sha256').update(`${prefix}:${value}`).digest('hex').slice(0, 8)
  return `${base.slice(0, 64 - suffix.length - 1)}_${suffix}`
}

const decode = <T extends object>(value: unknown): T | null => {
  if (typeof value === 'string') return safeDecrypt<T>(value) ?? null
  return (value as T) ?? null
}

const flatten = (value: unknown): Array<[string, unknown]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [['value', value]]
  return Object.entries(value as Record<string, unknown>)
}

const slotPrefix = (type: 'S' | 'C', index: number) => `${type}${String(index + 1).padStart(3, '0')}_`

const safeCognitiveValue = <T>(value: string | null | undefined): T | null => {
  if (!value) return null
  try {
    return decryptCognitivePayload<T>(value)
  } catch {
    return null
  }
}

const frozenReportFor = (assignment: any) => {
  if (!assignment?.resolvedReportSnapshotEncrypted) return null
  try {
    return readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
  } catch {
    return null
  }
}

const addField = (fields: CompositeExportField[], name: string, label: string, type: CompositeExportField['type'], decimals = 0) => {
  const existing = fields.find((field) => field.name === name)
  if (!existing) {
    if (fields.length >= EXPORT_MAX_FIELDS) throw exportLimitError('导出字段数超过上限，请缩小导出范围')
    fields.push({ name, label, type, width: type === 'string' ? 80 : 12, decimals })
    return name
  }
  if (existing.label === label) return name

  let suffix = createHash('sha256').update(`${name}:${label}`).digest('hex').slice(0, 8)
  let candidate = `${name.slice(0, Math.max(1, 64 - suffix.length - 1))}_${suffix}`
  let attempt = 0
  while (fields.some((field) => field.name === candidate)) {
    attempt += 1
    suffix = createHash('sha256').update(`${name}:${label}:${attempt}`).digest('hex').slice(0, 8)
    candidate = `${name.slice(0, Math.max(1, 64 - suffix.length - 1))}_${suffix}`
  }
  if (fields.length >= EXPORT_MAX_FIELDS) throw exportLimitError('导出字段数超过上限，请缩小导出范围')
  fields.push({ name: candidate, label, type, width: type === 'string' ? 80 : 12, decimals })
  return candidate
}

const includeFrozenMetric = (definition: any, detail: CompositeExportDetail) => {
  if (!definition || (definition.valueType !== 'number' && definition.valueType !== 'integer')) return false
  return detail === 'full' || definition.export?.summary !== false
}

const frozenMetricType = (definition: any): CompositeExportField['type'] => (
  definition?.valueType === 'number' || definition?.valueType === 'integer' ? 'numeric' : 'string'
)

const frozenMetricDecimals = (definition: any) => (
  definition?.valueType === 'integer' ? 0 : definition?.precision ?? 4
)

const completedDateWhere = (dateRange?: { start?: string; end?: string }) => {
  if (!dateRange?.start && !dateRange?.end) return undefined
  const value: { gte?: Date; lte?: Date } = {}
  if (dateRange.start) value.gte = new Date(dateRange.start)
  if (dateRange.end) value.lte = new Date(dateRange.end.includes('T') ? dateRange.end : `${dateRange.end}T23:59:59.999Z`)
  return value
}

export const getExportData = async (assessmentId: string, options: { detail?: CompositeExportDetail; anonymize?: boolean; dateRange?: { start?: string; end?: string } } = {}): Promise<CompositeExportData> => {
  const detail = options.detail ?? 'summary'
  const anonymize = options.anonymize ?? true
  const completedAttemptWhere = {
    compositeAssessmentId: assessmentId,
    status: 'COMPLETED' as const,
    ...(completedDateWhere(options.dateRange) ? { completedAt: completedDateWhere(options.dateRange) } : {}),
  }

  // Preflight the bounded export scope before materializing nested answers,
  // sessions, trials, or encrypted payloads. The later query and final check
  // remain in place to protect against concurrent changes and generated-field
  // growth.
  const recordCount = await prisma.compositeAssessmentAttempt.count({ where: completedAttemptWhere })
  assertExportLimits({ records: recordCount })
  if (detail === 'full') {
    const trialCount = await prisma.cognitiveTrial.count({
      where: {
        session: {
          is: {
            compositeAttempt: { is: completedAttemptWhere },
          },
        },
      },
    })
    assertExportLimits({ trials: trialCount })
  }

  const template = await prisma.compositeAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: { include: { items: { orderBy: { sortOrder: 'asc' } }, dimensions: true } },
          cognitiveAssignment: { select: { title: true, profile: true, resolvedReportSnapshotEncrypted: true } },
        },
      },
      attempts: {
        where: completedAttemptWhere,
        orderBy: [{ completedAt: 'asc' }, { startedAt: 'asc' }],
        take: EXPORT_MAX_RECORDS + 1,
        include: {
          user: { select: { id: true, nickname: true, username: true } },
          formAnswers: true,
          scaleAssessments: { include: { scale: { include: { items: true, dimensions: true } } } },
          cognitiveSessions: {
            include: {
              assignment: { select: { title: true, profile: true, resolvedReportSnapshotEncrypted: true } },
              trials: {
                orderBy: { trialIndex: 'asc' },
                take: EXPORT_MAX_TRIALS + 1,
                select: { trialIndex: true, payloadEncrypted: true },
              },
            },
          },
        },
      },
    },
  })
  if (!template) throw new Error('综合测评不存在')
  assertExportLimits({ records: template.attempts.length })
  const packageSlotLabels = getFrozenPackageSlotLabels(template)

  const fields: CompositeExportField[] = []
  addField(fields, 'U_id', '参与者编号', 'string')
  if (!anonymize) addField(fields, 'U_name', '姓名', 'string')
  addField(fields, 'A_attempt_id', '综合测评记录ID', 'string')
  addField(fields, 'A_assessment', '综合测评名称', 'string')
  addField(fields, 'A_date', '完成日期', 'date')
  addField(fields, 'A_duration_s', '完成用时(秒)', 'numeric')

  const formItems = template.items.filter((item: any) => item.type === 'FORM')
  formItems.forEach((item: any, index: number) => addField(fields, `F${String(index + 1).padStart(3, '0')}_value`, `[表单] ${packageSlotLabels.get(item.position) ?? item.formLabel}`, 'string'))

  template.items.forEach((item: any, index: number) => {
    const prefix = slotPrefix('S', index)
    if (item.type === 'SCALE' && item.scale) {
      const scaleLabel = packageSlotLabels.get(item.position) ?? item.scale.name
      addField(fields, `${prefix}scale_id`, `[${scaleLabel}] 量表ID`, 'string')
      addField(fields, `${prefix}scale_code`, `[${scaleLabel}] 量表编码`, 'string')
      addField(fields, `${prefix}report_definition_version`, `[${scaleLabel}] 报告定义版本`, 'string')
      if (detail === 'full') {
        item.scale.items.forEach((scaleItem: any) => {
          addField(fields, fieldName(`${prefix}Q_`, scaleItem.itemCode || scaleItem.id), `[${scaleLabel}] ${scaleItem.itemCode || ''} ${scaleItem.content}`, 'numeric')
          addField(fields, fieldName(`${prefix}RT_`, scaleItem.itemCode || scaleItem.id), `[${scaleLabel}] ${scaleItem.itemCode || ''} 作答时间(毫秒)`, 'numeric')
        })
      }
      item.scale.dimensions.forEach((dimension: any) => addField(fields, fieldName(`${prefix}D_`, dimension.code || dimension.id), `[${scaleLabel}] ${dimension.name}得分`, 'numeric', 2))
    }
    if (item.type === 'COGNITIVE') {
      const childPrefix = slotPrefix('C', index)
      const title = packageSlotLabels.get(item.position) ?? (item.cognitiveAssignment?.title || '认知任务')
      const frozenReport = frozenReportFor(item.cognitiveAssignment)
      const showProductIndex = frozenReport?.reportDefinition?.showProductIndex !== false
      if (showProductIndex) addField(fields, `${childPrefix}score`, `[${title}] 测评得分`, 'numeric', 2)
      addField(fields, `${childPrefix}quality`, `[${title}] 数据质量`, 'string')
      addField(fields, `${childPrefix}profile`, `[${title}] Profile`, 'string')
      addField(fields, `${childPrefix}profile_definition_version`, `[${title}] profile-definition version`, 'string')
      addField(fields, `${childPrefix}metric_definition_version`, `[${title}] metric-definition version`, 'string')
      addField(fields, `${childPrefix}quality_definition_version`, `[${title}] quality-definition version`, 'string')
      addField(fields, `${childPrefix}test_type`, `[${title}] testType`, 'string')
      addField(fields, `${childPrefix}engine_version`, `[${title}] engineVersion`, 'string')
      addField(fields, `${childPrefix}scoring_version`, `[${title}] scoringVersion`, 'string')
      addField(fields, `${childPrefix}config_version`, `[${title}] configVersion`, 'string')
      addField(fields, `${childPrefix}randomization_algorithm_version`, `[${title}] randomization algorithm version`, 'string')
      addField(fields, `${childPrefix}report_definition_version`, `[${title}] report-definition version`, 'string')
      if (frozenReport) {
        for (const key of Object.keys(frozenReport.metricDefinitions || {}).sort()) {
          const definition = frozenReport.metricDefinitions[key]
          if (!includeFrozenMetric(definition, detail)) continue
          const metricLabel = definition.export?.label || definition.label || key
          addField(
            fields,
            fieldName(`${childPrefix}M_`, key),
            `[${title}] ${metricLabel}`,
            frozenMetricType(definition),
            frozenMetricDecimals(definition),
          )
        }
      }
    }
  })

  const rows: Record<string, unknown>[] = []
  let trialCount = 0
  const itemMap = new Map(template.items.map((item: any) => [item.id, item]))
  for (const attempt of template.attempts as any[]) {
    const row: Record<string, unknown> = {
      U_id: attempt.anonymousCode || (attempt.userId ? `U${attempt.userId.substring(0, 8)}` : 'ANONYMOUS'),
      A_attempt_id: attempt.id,
      A_assessment: template.name,
      A_date: attempt.completedAt?.toISOString() ?? null,
      A_duration_s: attempt.totalTime == null ? null : Math.round(attempt.totalTime / 1000),
    }
    if (!anonymize) row.U_name = attempt.user?.nickname || attempt.user?.username || null

    for (let index = 0; index < formItems.length; index += 1) {
      const item = formItems[index]
      row[`F${String(index + 1).padStart(3, '0')}_value`] = attempt.formAnswers.find((answer: any) => answer.itemId === item.id)?.value ?? null
    }

    for (let index = 0; index < template.items.length; index += 1) {
      const item: any = template.items[index]
      const prefix = slotPrefix('S', index)
      if (item.type === 'SCALE') {
        const result = attempt.scaleAssessments.find((assessment: any) => assessment.compositeItemId === item.id)
        const answers = decode<any[]>(result?.answers) ?? []
        const answerMap = new Map(answers.map((answer) => [answer.itemId, answer]))
        if (detail === 'full') {
          for (const scaleItem of item.scale.items) {
            row[fieldName(`${prefix}Q_`, scaleItem.itemCode || scaleItem.id)] = answerMap.get(scaleItem.id)?.value ?? null
            row[fieldName(`${prefix}RT_`, scaleItem.itemCode || scaleItem.id)] = answerMap.get(scaleItem.id)?.responseTime ?? null
          }
        }
        const scores = decode<any[]>(result?.scores) ?? []
        row[`${prefix}scale_id`] = item.scale?.id ?? item.scaleId ?? null
        row[`${prefix}scale_code`] = item.scale?.code ?? null
        row[`${prefix}report_definition_version`] = 'scale-unit-report-v1'
        for (const score of scores) {
          const dimension = item.scale.dimensions.find((candidate: any) => candidate.id === score.dimensionId)
          if (dimension) row[fieldName(`${prefix}D_`, dimension.code || dimension.id)] = score.rawScore ?? score.normalizedScore ?? null
        }
      }
      if (item.type === 'COGNITIVE') {
        const session = attempt.cognitiveSessions.find((candidate: any) => candidate.compositeItemId === item.id)
        const childPrefix = slotPrefix('C', index)
        const assignment = session?.assignment || item.cognitiveAssignment
        if (session) {
          const score = safeCognitiveValue<number>(session.scoreEncrypted)
          const quality = safeCognitiveValue<Record<string, unknown>>(session.qualityFlagsEncrypted) || {}
          const metrics = safeCognitiveValue<Record<string, unknown>>(session.metricsEncrypted) || {}
          const frozenReport = frozenReportFor(assignment)
          if (frozenReport?.reportDefinition?.showProductIndex !== false) row[`${childPrefix}score`] = score
          row[`${childPrefix}quality`] = quality.interpretable === false ? 'insufficient' : quality.interpretable === true ? 'interpretable' : null
          row[`${childPrefix}profile`] = frozenReport?.profile ?? assignment?.profile ?? null
          row[`${childPrefix}profile_definition_version`] = frozenReport?.profileDefinitionVersion ?? null
          row[`${childPrefix}metric_definition_version`] = frozenReport?.metricDefinitionVersion ?? null
          row[`${childPrefix}quality_definition_version`] = frozenReport?.qualityDefinitionVersion ?? null
          row[`${childPrefix}test_type`] = session.testType ?? null
          row[`${childPrefix}engine_version`] = session.engineVersion ?? null
          row[`${childPrefix}scoring_version`] = session.scoringVersion ?? null
          row[`${childPrefix}config_version`] = session.configVersion ?? null
          row[`${childPrefix}randomization_algorithm_version`] = frozenReport?.randomizationAlgorithmVersion ?? null
          row[`${childPrefix}report_definition_version`] = frozenReport?.reportDefinitionVersion ?? null
          if (frozenReport) {
            for (const key of Object.keys(frozenReport.metricDefinitions || {}).sort()) {
              const definition = frozenReport.metricDefinitions[key]
              if (!includeFrozenMetric(definition, detail)) continue
              const metricName = fieldName(`${childPrefix}M_`, key)
              row[metricName] = scalarExportValue(metrics[key] ?? null)
            }
          } else {
            // Historical assignments without a frozen report remain readable,
            // but once a snapshot exists no row can add a data-dependent field.
            for (const [key, value] of Object.entries(metrics)) {
              const metricName = addField(
                fields,
                fieldName(`${childPrefix}M_`, key),
                `[${packageSlotLabels.get(item.position) ?? (item.cognitiveAssignment?.title || '认知任务')}] ${key}`,
                typeof value === 'number' ? 'numeric' : 'string',
                typeof value === 'number' && !Number.isInteger(value) ? 4 : 0,
              )
              row[metricName] = scalarExportValue(value)
            }
          }
          if (detail === 'full') {
            for (const trial of session.trials || []) {
              const payload = decryptCognitivePayload<unknown>(trial.payloadEncrypted)
              trialCount += 1
              for (const [key, value] of flatten(payload)) {
                const trialName = addField(fields, fieldName(`${childPrefix}T${String(trial.trialIndex + 1).padStart(3, '0')}_`, key), `[${packageSlotLabels.get(item.position) ?? (item.cognitiveAssignment?.title || '认知任务')}] 第${trial.trialIndex + 1}次 ${key}`, typeof value === 'number' ? 'numeric' : 'string', typeof value === 'number' && !Number.isInteger(value) ? 4 : 0)
                row[trialName] = scalarExportValue(value)
              }
            }
          }
        }
      }
    }
    rows.push(row)
  }

  // 动态字段在遍历数据时才会出现，确保每一行具有稳定列集合。
  for (const row of rows) for (const field of fields) if (!(field.name in row)) row[field.name] = null
  assertExportLimits({ records: rows.length, fields: fields.length, trials: trialCount })
  return { assessmentId: template.id, assessmentName: template.name, detail, fields, rows, trialCount }
}

export const exportToCSV = (data: CompositeExportData) => {
  return exportCognitiveToCSV(data)
}

export const makeFileName = (assessmentId: string, detail: CompositeExportDetail, format: CompositeExportFormat) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  return `composite_${assessmentId.substring(0, 8)}_${detail}_${timestamp}_${uuidv4()}.${format}`
}

export const saveExportFiles = async (
  assessmentId: string,
  options: { detail?: CompositeExportDetail; anonymize?: boolean; dateRange?: { start?: string; end?: string } },
  format: CompositeExportFormat,
  data?: CompositeExportData
) => {
  const exportData = data ?? await getExportData(assessmentId, options)
  assertExportLimits({
    records: exportData.rows.length,
    fields: exportData.fields.length,
    trials: exportData.trialCount,
  })
  cleanupExpiredExportFiles(EXPORT_DIR)
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
  const fileName = makeFileName(assessmentId, exportData.detail, format)
  const filePath = path.join(EXPORT_DIR, fileName)
  if (format === 'csv') {
    const content = '\uFEFF' + exportToCSV(exportData)
    assertExportLimits({ bytes: Buffer.byteLength(content, 'utf8') })
    fs.writeFileSync(filePath, content, 'utf8')
  } else {
    const variables = toSavVariables(exportData.fields)
    saveToFile(filePath, exportData.rows, variables)
    ensureExportFileWithinLimit(filePath)
  }
  return { filePath }
}

/** Keep SAV's numeric/null columns aligned with the frozen export schema. */
export const toSavVariables = (fields: CompositeExportField[]): SavVariable[] => fields.map((field) => ({
  name: field.name,
  label: field.label,
  type: field.type === 'string' || field.type === 'date' ? VariableType.String : VariableType.Numeric,
  width: field.type === 'string' || field.type === 'date' ? (field.width || 80) : 8,
  decimal: field.decimals || 0,
  columns: field.width || 8,
  measure: field.type === 'string' || field.type === 'date' ? VariableMeasure.Nominal : VariableMeasure.Continuous,
}))

export const compositeExportService = { getExportData, exportToCSV, makeFileName, saveExportFiles, toSavVariables }

// PR11 analysis exports are implemented as a separate frozen-Snapshot path;
// re-export the builder here so existing composite export imports remain the
// single public module entry point without changing the legacy wide export.
export {
  buildCompositeAnalysisExport,
  compositeAnalysisExportService,
} from './composite-analysis-export.service'
export type {
  CompositeAnalysisExportContext,
  CompositeAnalysisExportFormat,
  CompositeAnalysisExportResult,
} from './composite-analysis-export.service'
