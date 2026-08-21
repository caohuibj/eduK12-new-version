import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../../config/database'
import { decryptCognitivePayload } from './cognitive.security'
import { saveToFile, SavVariable, VariableMeasure, VariableType } from 'sav-writer'
import { v4 as uuidv4 } from 'uuid'

export type CognitiveExportDetail = 'summary' | 'full'
export type CognitiveExportFormat = 'csv' | 'sav'

export interface CognitiveExportOptions {
  detail?: CognitiveExportDetail
  anonymize?: boolean
  dateRange?: {
    start?: string
    end?: string
  }
}

export interface CognitiveExportField {
  name: string
  label: string
  type: 'numeric' | 'string' | 'date'
  width?: number
  decimals?: number
}

export interface CognitiveExportData {
  assignmentId: string
  assignmentTitle: string
  testType: string | null
  detail: CognitiveExportDetail
  fields: CognitiveExportField[]
  rows: Record<string, unknown>[]
  completedCount: number
  trialCount: number
}

interface CognitiveExportSession {
  id: string
  userId: string | null
  anonymousCode: string | null
  attemptNo: number
  testType: string
  configVersion: string
  engineVersion: string
  scoringVersion: string
  startedAt: Date
  finishedAt: Date | null
  scoreEncrypted: string | null
  metricsEncrypted: string | null
  qualityFlagsEncrypted: string | null
  user: {
    id: string
    nickname: string | null
    username: string
  } | null
  trials?: Array<{
    trialIndex: number
    payloadEncrypted: string
  }>
}

interface DecodedCognitiveExportSession extends Omit<CognitiveExportSession, 'scoreEncrypted' | 'metricsEncrypted' | 'qualityFlagsEncrypted' | 'trials'> {
  score: number
  metrics: Record<string, unknown>
  qualityFlags: Record<string, unknown>
  trials: Array<{ trialIndex: number; payload: unknown }>
}

const MAX_FIELD_NAME_LENGTH = 64
const EXPORT_DIR = path.join(__dirname, '../../../exports')

export const makeCognitiveExportFileName = (
  assignmentId: string,
  detail: CognitiveExportDetail,
  format: CognitiveExportFormat
): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
  return `cognitive_${assignmentId.substring(0, 8)}_${detail}_${timestamp}_${uuidv4()}.${format}`
}

const toSnakeCase = (value: string): string => {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()

  return normalized || 'value'
}

const makeFieldName = (prefix: string, key: string): string =>
  `${prefix}${toSnakeCase(key)}`.slice(0, MAX_FIELD_NAME_LENGTH)

export const scalarExportValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' || typeof value === 'string') return value
  return JSON.stringify(value)
}

const inferFieldType = (value: unknown): CognitiveExportField['type'] => {
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return 'numeric'
  }
  return 'string'
}

const mergeFieldType = (
  left: CognitiveExportField['type'],
  right: CognitiveExportField['type']
): CognitiveExportField['type'] => {
  if (left === 'date' || right === 'date') return 'date'
  if (left === 'string' || right === 'string') return 'string'
  return 'numeric'
}

class ExportFieldBuilder {
  private readonly list: CognitiveExportField[] = []
  private readonly byName = new Map<string, CognitiveExportField>()
  private readonly byKey = new Map<string, string>()

  private key(preferredName: string, label: string): string {
    return `${preferredName}\u0000${label}`
  }

  add(
    preferredName: string,
    label: string,
    type: CognitiveExportField['type'],
    width?: number,
    decimals?: number
  ): string {
    const baseName = preferredName.slice(0, MAX_FIELD_NAME_LENGTH) || 'F_value'
    const fieldKey = this.key(baseName, label)
    const knownName = this.byKey.get(fieldKey)
    if (knownName) return knownName

    let name = baseName
    let suffix = 2

    while (this.byName.has(name) && this.byName.get(name)?.label !== label) {
      const suffixText = `_${suffix}`
      name = `${baseName.slice(0, MAX_FIELD_NAME_LENGTH - suffixText.length)}${suffixText}`
      suffix += 1
    }

    const existing = this.byName.get(name)
    if (existing) {
      existing.type = mergeFieldType(existing.type, type)
      existing.width = Math.max(existing.width || 0, width || 0) || existing.width
      existing.decimals = Math.max(existing.decimals || 0, decimals || 0)
      return name
    }

    const field: CognitiveExportField = { name, label, type, width, decimals }
    this.list.push(field)
    this.byName.set(name, field)
    this.byKey.set(fieldKey, name)
    return name
  }

  resolve(preferredName: string, label: string): string {
    const baseName = preferredName.slice(0, MAX_FIELD_NAME_LENGTH) || 'F_value'
    return this.byKey.get(this.key(baseName, label)) || baseName
  }

  get fields(): CognitiveExportField[] {
    return this.list
  }
}

const toDateRange = (dateRange?: CognitiveExportOptions['dateRange']) => {
  if (!dateRange?.start && !dateRange?.end) return undefined

  const completedAt: { gte?: Date; lte?: Date } = {}
  if (dateRange.start) completedAt.gte = new Date(dateRange.start)
  if (dateRange.end) {
    const end = dateRange.end.includes('T') ? dateRange.end : `${dateRange.end}T23:59:59.999Z`
    completedAt.lte = new Date(end)
  }
  return completedAt
}

const flattenTrialPayload = (payload: unknown): Array<[string, unknown]> => {
  if (payload === null || payload === undefined || typeof payload !== 'object' || Array.isArray(payload)) {
    return [['value', payload]]
  }

  return Object.entries(payload as Record<string, unknown>).map(([key, value]) => [key, value])
}

const getAssignment = async (assignmentId: string) => {
  const assignment = await prisma.cognitiveAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      title: true,
      courseId: true,
      course: {
        select: { id: true, title: true, courseCode: true },
      },
      config: {
        select: {
          testType: true,
          configVersion: true,
          engineVersion: true,
          scoringVersion: true,
        },
      },
    },
  })

  if (!assignment) throw new Error('认知测评任务不存在')
  return assignment
}

const getSessions = async (
  assignmentId: string,
  detail: CognitiveExportDetail,
  dateRange?: CognitiveExportOptions['dateRange']
): Promise<CognitiveExportSession[]> => {
  const finishedAt = toDateRange(dateRange)
  const where = {
    assignmentId,
    status: 'COMPLETED' as const,
    ...(finishedAt ? { finishedAt } : {}),
  }

  const includeUser = {
    user: {
      select: { id: true, nickname: true, username: true },
    },
  }

  if (detail === 'full') {
    const sessions = await prisma.cognitiveSession.findMany({
      where,
      include: {
        ...includeUser,
        trials: {
          select: { trialIndex: true, payloadEncrypted: true },
          orderBy: { trialIndex: 'asc' },
        },
      },
      orderBy: [{ finishedAt: 'asc' }, { createdAt: 'asc' }],
    })
    return sessions as unknown as CognitiveExportSession[]
  }

  const sessions = await prisma.cognitiveSession.findMany({
    where,
    include: includeUser,
    orderBy: [{ finishedAt: 'asc' }, { createdAt: 'asc' }],
  })
  return sessions as unknown as CognitiveExportSession[]
}

const decodeSession = (session: CognitiveExportSession): DecodedCognitiveExportSession => {
  if (!session.scoreEncrypted || !session.metricsEncrypted || !session.qualityFlagsEncrypted) {
    throw new Error(`认知测评会话 ${session.id} 缺少已完成结果`)
  }

  return {
    id: session.id,
    userId: session.userId,
    anonymousCode: session.anonymousCode,
    attemptNo: session.attemptNo,
    testType: session.testType,
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    user: session.user,
    score: decryptCognitivePayload<number>(session.scoreEncrypted),
    metrics: decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted),
    qualityFlags: decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted),
    trials: (session.trials || []).map((trial) => ({
      trialIndex: trial.trialIndex,
      payload: decryptCognitivePayload<unknown>(trial.payloadEncrypted),
    })),
  }
}

const addBaseFields = (builder: ExportFieldBuilder, anonymize: boolean) => {
  builder.add('U_id', '用户ID', 'string', 32)
  if (!anonymize) builder.add('U_name', '姓名', 'string', 40)
  builder.add('A_assignment_id', '认知测评任务ID', 'string', 40)
  builder.add('A_assignment', '认知测评任务', 'string', 80)
  builder.add('A_course_id', '课程ID', 'string', 40)
  builder.add('A_course', '课程名称', 'string', 80)
  builder.add('A_test_type', '认知测验类型', 'string', 30)
  builder.add('A_attempt', '尝试次数', 'numeric', 4, 0)
  builder.add('A_score', '测评得分', 'numeric', 8, 2)
  builder.add('A_config_version', '配置版本', 'string', 20)
  builder.add('A_engine_version', '引擎版本', 'string', 20)
  builder.add('A_scoring_version', '评分版本', 'string', 20)
  builder.add('A_duration_s', '完成用时(秒)', 'numeric', 8, 0)
  builder.add('A_date', '完成日期', 'date', 24)
}

const addSessionFields = (
  builder: ExportFieldBuilder,
  session: DecodedCognitiveExportSession,
  detail: CognitiveExportDetail
) => {
  for (const [key, value] of Object.entries(session.metrics).sort(([a], [b]) => a.localeCompare(b))) {
    builder.add(
      makeFieldName('M_', key),
      `[${session.testType}] ${key}`,
      inferFieldType(value),
      12,
      typeof value === 'number' && !Number.isInteger(value) ? 4 : 0
    )
  }

  for (const [key, value] of Object.entries(session.qualityFlags).sort(([a], [b]) => a.localeCompare(b))) {
    builder.add(
      makeFieldName('Q_', key),
      `[${session.testType}] 质量标记：${key}`,
      inferFieldType(value),
      12,
      0
    )
  }

  if (detail === 'full') {
    for (const trial of session.trials) {
      const trialPrefix = `T${String(trial.trialIndex + 1).padStart(3, '0')}_`
      for (const [key, value] of flattenTrialPayload(trial.payload)) {
        builder.add(
          makeFieldName(trialPrefix, key),
          `[${session.testType}] 第${trial.trialIndex + 1}次 ${key}`,
          inferFieldType(value),
          Array.isArray(value) || (value !== null && typeof value === 'object') ? 255 : 12,
          typeof value === 'number' && !Number.isInteger(value) ? 4 : 0
        )
      }
    }
  }
}

const fillBaseRow = (
  row: Record<string, unknown>,
  assignment: Awaited<ReturnType<typeof getAssignment>>,
  session: DecodedCognitiveExportSession,
  anonymize: boolean
) => {
  row.U_id = session.anonymousCode || (session.userId
    ? anonymize
      ? `U${session.userId.substring(0, 8)}`
      : session.userId
    : 'ANONYMOUS')
  if (!anonymize) row.U_name = session.user?.nickname || session.user?.username || null
  row.A_assignment_id = assignment.id
  row.A_assignment = assignment.title
  row.A_course_id = assignment.courseId
  row.A_course = assignment.course?.title || null
  row.A_test_type = session.testType
  row.A_attempt = session.attemptNo
  row.A_score = session.score
  row.A_config_version = session.configVersion
  row.A_engine_version = session.engineVersion
  row.A_scoring_version = session.scoringVersion
  row.A_duration_s = session.finishedAt
    ? Math.round((session.finishedAt.getTime() - session.startedAt.getTime()) / 1000)
    : null
  row.A_date = session.finishedAt?.toISOString() || null
}

const buildRows = (
  builder: ExportFieldBuilder,
  assignment: Awaited<ReturnType<typeof getAssignment>>,
  sessions: DecodedCognitiveExportSession[],
  detail: CognitiveExportDetail,
  anonymize: boolean
): Record<string, unknown>[] => {
  return sessions.map((session) => {
    const row: Record<string, unknown> = {}
    for (const field of builder.fields) row[field.name] = null

    fillBaseRow(row, assignment, session, anonymize)

    for (const [key, value] of Object.entries(session.metrics)) {
      const label = `[${session.testType}] ${key}`
      row[builder.resolve(makeFieldName('M_', key), label)] = scalarExportValue(value)
    }
    for (const [key, value] of Object.entries(session.qualityFlags)) {
      const label = `[${session.testType}] 质量标记：${key}`
      row[builder.resolve(makeFieldName('Q_', key), label)] = scalarExportValue(value)
    }

    if (detail === 'full') {
      for (const trial of session.trials) {
        const trialPrefix = `T${String(trial.trialIndex + 1).padStart(3, '0')}_`
        for (const [key, value] of flattenTrialPayload(trial.payload)) {
          const label = `[${session.testType}] 第${trial.trialIndex + 1}次 ${key}`
          row[builder.resolve(makeFieldName(trialPrefix, key), label)] = scalarExportValue(value)
        }
      }
    }

    return row
  })
}

export async function getCognitiveExportData(
  assignmentId: string,
  options: CognitiveExportOptions = {}
): Promise<CognitiveExportData> {
  const detail = options.detail || 'summary'
  const anonymize = options.anonymize ?? true
  const assignment = await getAssignment(assignmentId)
  const sessions = await getSessions(assignmentId, detail, options.dateRange)
  const decodedSessions = sessions.map(decodeSession)
  const builder = new ExportFieldBuilder()

  addBaseFields(builder, anonymize)
  for (const session of decodedSessions) addSessionFields(builder, session, detail)

  return {
    assignmentId: assignment.id,
    assignmentTitle: assignment.title,
    testType: assignment.config?.testType || decodedSessions[0]?.testType || null,
    detail,
    fields: builder.fields,
    rows: buildRows(builder, assignment, decodedSessions, detail, anonymize),
    completedCount: decodedSessions.length,
    trialCount: decodedSessions.reduce((sum, session) => sum + session.trials.length, 0),
  }
}

const csvValue = (value: unknown, type?: CognitiveExportField['type']): string => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  const safeText = type === 'string' && /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text
  if (/[",\r\n]/.test(safeText)) return `"${safeText.replace(/"/g, '""')}"`
  return safeText
}

export function exportCognitiveToCSV(data: Pick<CognitiveExportData, 'fields' | 'rows'>): string {
  const lines = [data.fields.map((field) => field.name).join(',')]
  for (const row of data.rows) {
    lines.push(data.fields.map((field) => csvValue(row[field.name], field.type)).join(','))
  }
  return lines.join('\n')
}

export async function exportCognitiveToSav(data: CognitiveExportData): Promise<string> {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true })

  const variables: SavVariable[] = data.fields.map((field) => ({
    name: field.name,
    label: field.label,
    type: field.type === 'string' || field.type === 'date' ? VariableType.String : VariableType.Numeric,
    width: field.type === 'string' || field.type === 'date' ? Math.min(field.width || 255, 255) : 8,
    decimal: field.decimals || 0,
    columns: field.width || 8,
    measure: field.type === 'string' || field.type === 'date' ? VariableMeasure.Nominal : VariableMeasure.Continuous,
  }))

  const filePath = path.join(EXPORT_DIR, makeCognitiveExportFileName(data.assignmentId, data.detail, 'sav'))
  saveToFile(filePath, data.rows, variables)
  return filePath
}

export async function saveCognitiveExportFiles(
  assignmentId: string,
  options: CognitiveExportOptions = {},
  format: CognitiveExportFormat = 'csv',
  data?: CognitiveExportData
): Promise<{ data: CognitiveExportData; csvPath?: string; savPath?: string }> {
  const exportData = data || await getCognitiveExportData(assignmentId, options)
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true })

  if (format === 'csv') {
    const csvPath = path.join(EXPORT_DIR, makeCognitiveExportFileName(assignmentId, exportData.detail, 'csv'))
    fs.writeFileSync(csvPath, `\uFEFF${exportCognitiveToCSV(exportData)}`, 'utf-8')
    return { data: exportData, csvPath }
  }

  const savPath = await exportCognitiveToSav(exportData)
  return { data: exportData, savPath }
}

export const cognitiveExportService = {
  getCognitiveExportData,
  exportCognitiveToCSV,
  exportCognitiveToSav,
  saveCognitiveExportFiles,
}
