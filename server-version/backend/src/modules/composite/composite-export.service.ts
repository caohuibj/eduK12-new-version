import * as fs from 'fs'
import { createHash } from 'crypto'
import * as path from 'path'
import { saveToFile, SavVariable, VariableMeasure, VariableType } from 'sav-writer'
import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../../config/database'
import { safeDecrypt } from '../../utils/encryption'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { exportCognitiveToCSV, scalarExportValue } from '../cognitive/export.service'

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

const addField = (fields: CompositeExportField[], name: string, label: string, type: CompositeExportField['type'], decimals = 0) => {
  const existing = fields.find((field) => field.name === name)
  if (!existing) {
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
  fields.push({ name: candidate, label, type, width: type === 'string' ? 80 : 12, decimals })
  return candidate
}

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
  const template = await prisma.compositeAssessment.findUnique({
    where: { id: assessmentId },
    include: {
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: { include: { items: { orderBy: { sortOrder: 'asc' } }, dimensions: true } },
          cognitiveAssignment: { select: { title: true } },
        },
      },
      attempts: {
        where: { status: 'COMPLETED', ...(completedDateWhere(options.dateRange) ? { completedAt: completedDateWhere(options.dateRange) } : {}) },
        orderBy: [{ completedAt: 'asc' }, { startedAt: 'asc' }],
        include: {
          user: { select: { id: true, nickname: true, username: true } },
          formAnswers: true,
          scaleAssessments: { include: { scale: { include: { items: true, dimensions: true } } } },
          cognitiveSessions: { include: { assignment: { select: { title: true } }, trials: { orderBy: { trialIndex: 'asc' }, select: { trialIndex: true, payloadEncrypted: true } } } },
        },
      },
    },
  })
  if (!template) throw new Error('综合测评不存在')

  const fields: CompositeExportField[] = []
  addField(fields, 'U_id', '参与者编号', 'string')
  if (!anonymize) addField(fields, 'U_name', '姓名', 'string')
  addField(fields, 'A_attempt_id', '综合测评记录ID', 'string')
  addField(fields, 'A_assessment', '综合测评名称', 'string')
  addField(fields, 'A_date', '完成日期', 'date')
  addField(fields, 'A_duration_s', '完成用时(秒)', 'numeric')

  const formItems = template.items.filter((item: any) => item.type === 'FORM')
  formItems.forEach((item: any, index: number) => addField(fields, `F${String(index + 1).padStart(3, '0')}_value`, `[表单] ${item.formLabel}`, 'string'))

  template.items.forEach((item: any, index: number) => {
    const prefix = `S${String(index + 1).padStart(3, '0')}_`
    if (item.type === 'SCALE' && item.scale) {
      if (detail === 'full') {
        item.scale.items.forEach((scaleItem: any) => {
          addField(fields, fieldName(`${prefix}Q_`, scaleItem.itemCode || scaleItem.id), `[${item.scale.name}] ${scaleItem.itemCode || ''} ${scaleItem.content}`, 'numeric')
          addField(fields, fieldName(`${prefix}RT_`, scaleItem.itemCode || scaleItem.id), `[${item.scale.name}] ${scaleItem.itemCode || ''} 作答时间(毫秒)`, 'numeric')
        })
      }
      item.scale.dimensions.forEach((dimension: any) => addField(fields, fieldName(`${prefix}D_`, dimension.code || dimension.id), `[${item.scale.name}] ${dimension.name}得分`, 'numeric', 2))
    }
    if (item.type === 'COGNITIVE') {
      addField(fields, `C${String(index + 1).padStart(3, '0')}_score`, `[${item.cognitiveAssignment?.title || '认知任务'}] 测评得分`, 'numeric', 2)
      addField(fields, `C${String(index + 1).padStart(3, '0')}_quality`, `[${item.cognitiveAssignment?.title || '认知任务'}] 数据质量`, 'string')
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
      A_duration_s: attempt.totalTime ? Math.round(attempt.totalTime / 1000) : null,
    }
    if (!anonymize) row.U_name = attempt.user?.nickname || attempt.user?.username || null

    for (let index = 0; index < formItems.length; index += 1) {
      const item = formItems[index]
      row[`F${String(index + 1).padStart(3, '0')}_value`] = attempt.formAnswers.find((answer: any) => answer.itemId === item.id)?.value ?? null
    }

    for (let index = 0; index < template.items.length; index += 1) {
      const item: any = template.items[index]
      const prefix = `S${String(index + 1).padStart(3, '0')}_`
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
        for (const score of scores) {
          const dimension = item.scale.dimensions.find((candidate: any) => candidate.id === score.dimensionId)
          if (dimension) row[fieldName(`${prefix}D_`, dimension.code || dimension.id)] = score.rawScore ?? score.normalizedScore ?? null
        }
      }
      if (item.type === 'COGNITIVE') {
        const session = attempt.cognitiveSessions.find((candidate: any) => candidate.compositeItemId === item.id)
        const childPrefix = `C${String(index + 1).padStart(3, '0')}_`
        if (session) {
          row[`${childPrefix}score`] = session.scoreEncrypted ? decryptCognitivePayload<number>(session.scoreEncrypted) : null
          const quality = session.qualityFlagsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted) : {}
          row[`${childPrefix}quality`] = quality.interpretable === false ? 'insufficient' : 'interpretable'
          const metrics = session.metricsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted) : {}
          for (const [key, value] of Object.entries(metrics)) {
            const metricName = addField(fields, fieldName(`${childPrefix}M_`, key), `[${item.cognitiveAssignment?.title || '认知任务'}] ${key}`, typeof value === 'number' ? 'numeric' : 'string', typeof value === 'number' && !Number.isInteger(value) ? 4 : 0)
            row[metricName] = scalarExportValue(value)
          }
          if (detail === 'full') {
            for (const trial of session.trials || []) {
              const payload = decryptCognitivePayload<unknown>(trial.payloadEncrypted)
              trialCount += 1
              for (const [key, value] of flatten(payload)) {
                const trialName = addField(fields, fieldName(`${childPrefix}T${String(trial.trialIndex + 1).padStart(3, '0')}_`, key), `[${item.cognitiveAssignment?.title || '认知任务'}] 第${trial.trialIndex + 1}次 ${key}`, typeof value === 'number' ? 'numeric' : 'string', typeof value === 'number' && !Number.isInteger(value) ? 4 : 0)
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
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
  const fileName = makeFileName(assessmentId, exportData.detail, format)
  const filePath = path.join(EXPORT_DIR, fileName)
  if (format === 'csv') {
    fs.writeFileSync(filePath, '\uFEFF' + exportToCSV(exportData), 'utf8')
  } else {
    const variables: SavVariable[] = exportData.fields.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type === 'string' || field.type === 'date' ? VariableType.String : VariableType.Numeric,
      width: field.type === 'string' || field.type === 'date' ? (field.width || 80) : 8,
      decimal: field.decimals || 0,
      columns: field.width || 8,
      measure: field.type === 'string' || field.type === 'date' ? VariableMeasure.Nominal : VariableMeasure.Continuous,
    }))
    saveToFile(filePath, exportData.rows, variables)
  }
  return { filePath }
}

export const compositeExportService = { getExportData, exportToCSV, makeFileName, saveExportFiles }
