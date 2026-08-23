import * as fs from 'fs'
import * as path from 'path'
import { prisma } from '../../config/database'
import { decryptCognitivePayload } from './cognitive.security'
import { saveToFile, SavVariable, VariableMeasure, VariableType } from 'sav-writer'
import { v4 as uuidv4 } from 'uuid'
import {
  assertExportLimits,
  cleanupExpiredExportFiles,
  ensureExportFileWithinLimit,
  EXPORT_MAX_FIELDS,
  EXPORT_MAX_RECORDS,
  EXPORT_MAX_TRIALS,
  exportLimitError,
} from '../../services/exportStorage'
import { FORBIDDEN } from './cognitive.errors'
import { isCompositeWrapper } from './assignment.access'
import { getCognitiveRegistryEntry } from './cognitive.registry'
import { readFrozenReport } from './profile-freeze'
import { buildZipStore } from './export-zip'
import * as XLSX from 'xlsx'

export type CognitiveExportDetail = 'summary' | 'full' | 'research'
export type CognitiveExportFormat = 'csv' | 'sav' | 'xlsx' | 'zip'

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

export const isAllowedCognitiveExportFileName = (fileName: string): boolean =>
  /^cognitive_[a-zA-Z0-9-]+_(summary|full)_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_[a-f0-9-]{36}\.(csv|sav)$/.test(fileName)
  || /^cognitive_[a-zA-Z0-9-]+_research_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_[a-f0-9-]{36}\.(zip|xlsx)$/.test(fileName)

export const makeCognitiveExportFileName = (
  assignmentId: string,
  detail: CognitiveExportDetail | 'summary' | 'full' | 'research',
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

    if (this.list.length >= EXPORT_MAX_FIELDS) throw exportLimitError('导出字段数超过上限，请缩小导出范围')
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
      listedStandalone: true,
      course: {
        select: { id: true, title: true, courseCode: true },
      },
      profile: true,
      profileDefinitionVersion: true,
      resolvedReportSnapshotEncrypted: true,
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
  if (isCompositeWrapper(assignment)) throw FORBIDDEN('请从综合测评导出')
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

  if (detail === 'full' || detail === 'research') {
    const sessions = await prisma.cognitiveSession.findMany({
      where,
      include: {
        ...includeUser,
        trials: {
          select: { trialIndex: true, payloadEncrypted: true },
          orderBy: { trialIndex: 'asc' },
          take: EXPORT_MAX_TRIALS + 1,
        },
      },
      orderBy: [{ finishedAt: 'asc' }, { createdAt: 'asc' }],
      take: EXPORT_MAX_RECORDS + 1,
    })
    assertExportLimits({ records: sessions.length })
    return sessions as unknown as CognitiveExportSession[]
  }

  const sessions = await prisma.cognitiveSession.findMany({
    where,
    include: includeUser,
    orderBy: [{ finishedAt: 'asc' }, { createdAt: 'asc' }],
    take: EXPORT_MAX_RECORDS + 1,
  })
  assertExportLimits({ records: sessions.length })
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
  builder.add('A_profile', '测评档位', 'string', 20)
  builder.add('A_metric_definition_version', '指标定义版本', 'string', 20)
  builder.add('A_quality_definition_version', '质量定义版本', 'string', 20)
  builder.add('A_report_definition_version', '报告定义版本', 'string', 20)
  builder.add('A_quality_interpretable', '结果可解释', 'numeric', 4, 0)
  builder.add('A_duration_s', '完成用时(秒)', 'numeric', 8, 0)
  builder.add('A_date', '完成日期', 'date', 24)
}

const reportContextFor = (assignment: Awaited<ReturnType<typeof getAssignment>>, session: DecodedCognitiveExportSession) => {
  const frozen = readFrozenReport(assignment.resolvedReportSnapshotEncrypted)
  const entry = frozen
    ? null
    : getCognitiveRegistryEntry(session.testType, session.engineVersion, session.scoringVersion)
  return {
    profile: assignment.profile ?? frozen?.profile ?? null,
    metricDefinitionVersion: frozen?.metricDefinitionVersion ?? entry?.metricDefinitionVersion ?? null,
    qualityDefinitionVersion: frozen?.qualityDefinitionVersion ?? entry?.qualityDefinitionVersion ?? null,
    reportDefinitionVersion: frozen?.reportDefinitionVersion ?? entry?.reportDefinitionVersion ?? null,
    metricDefinitions: frozen?.metricDefinitions ?? entry?.metricDefinitions ?? {},
    qualityDefinitions: frozen?.qualityDefinitions ?? entry?.qualityDefinitions ?? {},
  }
}

const metricLabel = (
  session: DecodedCognitiveExportSession,
  key: string,
  defs: Record<string, { label?: string; export?: { label: string }; availableProfiles?: string[] }>,
) => defs[key]?.export?.label || defs[key]?.label || key

const includeMetricInWideExport = (
  key: string,
  defs: Record<string, { export?: { summary: boolean }; availableProfiles?: string[] }>,
  profile: string | null,
  detail: CognitiveExportDetail,
) => {
  if (detail === 'research') return true
  const definition = defs[key]
  if (!definition) return false
  if (definition.export && definition.export.summary === false) return false
  if (profile && definition.availableProfiles && !definition.availableProfiles.includes(profile)) return false
  return true
}

const addSessionFields = (
  builder: ExportFieldBuilder,
  session: DecodedCognitiveExportSession,
  detail: CognitiveExportDetail,
  assignment: Awaited<ReturnType<typeof getAssignment>>,
) => {
  const context = reportContextFor(assignment, session)
  for (const [key, value] of Object.entries(session.metrics).sort(([a], [b]) => a.localeCompare(b))) {
    if (!includeMetricInWideExport(key, context.metricDefinitions, context.profile, detail)) continue
    builder.add(
      makeFieldName('M_', key),
      `[${session.testType}] ${metricLabel(session, key, context.metricDefinitions)}`,
      inferFieldType(value),
      12,
      typeof value === 'number' && !Number.isInteger(value) ? 4 : 0
    )
  }

  for (const [key, value] of Object.entries(session.qualityFlags).sort(([a], [b]) => a.localeCompare(b))) {
    builder.add(
      makeFieldName('Q_', key),
      `[${session.testType}] ${context.qualityDefinitions[key]?.label || `质量标记：${key}`}`,
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
  const context = reportContextFor(assignment, session)
  row.A_profile = context.profile
  row.A_metric_definition_version = context.metricDefinitionVersion
  row.A_quality_definition_version = context.qualityDefinitionVersion
  row.A_report_definition_version = context.reportDefinitionVersion
  row.A_quality_interpretable = session.qualityFlags.interpretable === false ? 0 : 1
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

    const context = reportContextFor(assignment, session)
    for (const [key, value] of Object.entries(session.metrics)) {
      if (!includeMetricInWideExport(key, context.metricDefinitions, context.profile, detail)) continue
      const label = `[${session.testType}] ${metricLabel(session, key, context.metricDefinitions)}`
      row[builder.resolve(makeFieldName('M_', key), label)] = scalarExportValue(value)
    }
    for (const [key, value] of Object.entries(session.qualityFlags)) {
      const label = `[${session.testType}] ${context.qualityDefinitions[key]?.label || `质量标记：${key}`}`
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
  for (const session of decodedSessions) addSessionFields(builder, session, detail, assignment)

  const rows = buildRows(builder, assignment, decodedSessions, detail, anonymize)
  const trialCount = decodedSessions.reduce((sum, session) => sum + session.trials.length, 0)
  assertExportLimits({
    records: decodedSessions.length,
    fields: builder.fields.length,
    trials: trialCount,
  })

  return {
    assignmentId: assignment.id,
    assignmentTitle: assignment.title,
    testType: assignment.config?.testType || decodedSessions[0]?.testType || null,
    detail,
    fields: builder.fields,
    rows,
    completedCount: decodedSessions.length,
    trialCount,
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
  assertExportLimits({
    records: data.rows.length,
    fields: data.fields.length,
    trials: data.trialCount,
  })
  cleanupExpiredExportFiles(EXPORT_DIR)
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
  ensureExportFileWithinLimit(filePath)
  return filePath
}

const tableToCsv = (headers: string[], rows: Array<Record<string, unknown>>): string => {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((header) => csvValue(row[header])).join(','))
  }
  return `${lines.join('\n')}\n`
}

export const buildCognitiveResearchPackage = (
  assignment: Awaited<ReturnType<typeof getAssignment>>,
  sessions: DecodedCognitiveExportSession[],
  anonymize: boolean,
) => {
  const sessionRows = sessions.map((session) => {
    const context = reportContextFor(assignment, session)
    return {
      session_id: session.id,
      U_id: session.anonymousCode || (session.userId
        ? anonymize ? `U${session.userId.substring(0, 8)}` : session.userId
        : 'ANONYMOUS'),
      A_assignment_id: assignment.id,
      A_test_type: session.testType,
      A_attempt: session.attemptNo,
      A_score: session.score,
      A_profile: context.profile,
      A_config_version: session.configVersion,
      A_engine_version: session.engineVersion,
      A_scoring_version: session.scoringVersion,
      A_metric_definition_version: context.metricDefinitionVersion,
      A_quality_definition_version: context.qualityDefinitionVersion,
      A_report_definition_version: context.reportDefinitionVersion,
      A_quality_interpretable: session.qualityFlags.interpretable === false ? 0 : 1,
      A_finished_at: session.finishedAt?.toISOString() ?? null,
    }
  })
  const metricRows: Array<Record<string, unknown>> = []
  const dictionaryRows: Array<Record<string, unknown>> = []
  const seenKeys = new Set<string>()
  for (const session of sessions) {
    const context = reportContextFor(assignment, session)
    for (const [key, value] of Object.entries(session.metrics)) {
      const def = context.metricDefinitions[key]
      metricRows.push({
        session_id: session.id,
        metric_key: key,
        metric_label: metricLabel(session, key, context.metricDefinitions),
        unit: def?.unit ?? '',
        role: def?.role ?? '',
        value: scalarExportValue(value),
      })
      if (!seenKeys.has(`M:${key}`)) {
        seenKeys.add(`M:${key}`)
        dictionaryRows.push({
          key,
          source: 'metric',
          label: metricLabel(session, key, context.metricDefinitions),
          unit: def?.unit ?? '',
          role: def?.role ?? '',
          test_type: session.testType,
        })
      }
    }
    for (const [key, value] of Object.entries(session.qualityFlags)) {
      metricRows.push({
        session_id: session.id,
        metric_key: `Q_${key}`,
        metric_label: context.qualityDefinitions[key]?.label || key,
        unit: '',
        role: 'quality',
        value: scalarExportValue(value),
      })
      if (!seenKeys.has(`Q:${key}`)) {
        seenKeys.add(`Q:${key}`)
        dictionaryRows.push({
          key,
          source: 'quality',
          label: context.qualityDefinitions[key]?.label || key,
          unit: '',
          role: 'quality',
          test_type: session.testType,
        })
      }
    }
  }
  const trialRows = sessions.flatMap((session) =>
    session.trials.map((trial) => ({
      session_id: session.id,
      trial_index: trial.trialIndex,
      test_type: session.testType,
      task_payload_json: JSON.stringify(trial.payload),
    })),
  )
  const manifest = {
    assignmentId: assignment.id,
    assignmentTitle: assignment.title,
    testType: assignment.config?.testType ?? null,
    detail: 'research',
    generatedAt: new Date().toISOString(),
    sessionCount: sessions.length,
    metricRowCount: metricRows.length,
    trialRowCount: trialRows.length,
    files: ['sessions.csv', 'metrics.csv', 'trials.csv', 'manifest.json', 'data_dictionary.xlsx', 'README.txt'],
    randomizationAlgorithmVersion: 'seq-v1.0.0',
  }
  const readme = [
    'Cognitive research-long export',
    '',
    'sessions.csv: one completed session per row',
    'metrics.csv: one metric or quality flag per row',
    'trials.csv: one trial per row; task-specific fields are in task_payload_json',
    'data_dictionary.xlsx: key/label/unit/role from the frozen metric/quality registry',
    '',
    'Scores are server-computed. This package is not a population norm and is not a diagnosis.',
    'Dictionary keys must be a subset of the frozen Registry for this assignment version.',
  ].join('\n')
  return { sessionRows, metricRows, trialRows, dictionaryRows, manifest, readme }
}

const writeXlsxWorkbook = (sheets: Record<string, Array<Record<string, unknown>>>, filePath: string) => {
  const workbook = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31))
  }
  XLSX.writeFile(workbook, filePath)
  ensureExportFileWithinLimit(filePath)
}

export async function saveCognitiveExportFiles(
  assignmentId: string,
  options: CognitiveExportOptions = {},
  format: CognitiveExportFormat = 'csv',
  data?: CognitiveExportData
): Promise<{ data: CognitiveExportData; csvPath?: string; savPath?: string; xlsxPath?: string; zipPath?: string }> {
  const exportData = data || await getCognitiveExportData(assignmentId, options)
  assertExportLimits({
    records: exportData.rows.length,
    fields: exportData.fields.length,
    trials: exportData.trialCount,
  })
  cleanupExpiredExportFiles(EXPORT_DIR)
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true })

  if (format === 'csv') {
    const csvPath = path.join(EXPORT_DIR, makeCognitiveExportFileName(assignmentId, exportData.detail, 'csv'))
    const content = `\uFEFF${exportCognitiveToCSV(exportData)}`
    assertExportLimits({ bytes: Buffer.byteLength(content, 'utf8') })
    fs.writeFileSync(csvPath, content, 'utf-8')
    return { data: exportData, csvPath }
  }
  if (format === 'sav') {
    const savPath = await exportCognitiveToSav(exportData)
    return { data: exportData, savPath }
  }

  const assignment = await getAssignment(assignmentId)
  const sessions = (await getSessions(assignmentId, 'research', options.dateRange)).map(decodeSession)
  const pack = buildCognitiveResearchPackage(assignment, sessions, options.anonymize ?? true)
  const dictionaryKeys = pack.dictionaryRows.map((row) => String(row.key))
  const registryKeys = sessions.flatMap((session) => {
    const context = reportContextFor(assignment, session)
    return [...Object.keys(context.metricDefinitions), ...Object.keys(context.qualityDefinitions)]
  })
  if (dictionaryKeys.some((key) => registryKeys.length > 0 && !registryKeys.includes(key))) {
    throw new Error('data dictionary keys must be a subset of the frozen registry')
  }

  if (format === 'xlsx') {
    const xlsxPath = path.join(EXPORT_DIR, makeCognitiveExportFileName(assignmentId, 'research', 'xlsx'))
    writeXlsxWorkbook({
      Summary: exportData.rows,
      Sessions: pack.sessionRows,
      Metrics: pack.metricRows,
      Trials: pack.trialRows,
      Dictionary: pack.dictionaryRows,
      Methods: [{ readme: pack.readme, manifest: JSON.stringify(pack.manifest) }],
    }, xlsxPath)
    return { data: exportData, xlsxPath }
  }

  const zipPath = path.join(EXPORT_DIR, makeCognitiveExportFileName(assignmentId, 'research', 'zip'))
  const dictionaryPath = path.join(EXPORT_DIR, `dict-${path.basename(zipPath, '.zip')}.xlsx`)
  writeXlsxWorkbook({ Dictionary: pack.dictionaryRows }, dictionaryPath)
  const dictionaryBytes = fs.readFileSync(dictionaryPath)
  fs.unlinkSync(dictionaryPath)
  const zip = buildZipStore([
    { name: 'sessions.csv', data: tableToCsv(Object.keys(pack.sessionRows[0] || { session_id: '' }), pack.sessionRows) },
    { name: 'metrics.csv', data: tableToCsv(['session_id', 'metric_key', 'metric_label', 'unit', 'role', 'value'], pack.metricRows) },
    { name: 'trials.csv', data: tableToCsv(['session_id', 'trial_index', 'test_type', 'task_payload_json'], pack.trialRows) },
    { name: 'manifest.json', data: `${JSON.stringify(pack.manifest, null, 2)}\n` },
    { name: 'data_dictionary.xlsx', data: dictionaryBytes },
    { name: 'README.txt', data: `${pack.readme}\n` },
  ])
  assertExportLimits({ bytes: zip.length })
  fs.writeFileSync(zipPath, zip)
  ensureExportFileWithinLimit(zipPath)
  return { data: exportData, zipPath }
}

export const cognitiveExportService = {
  getCognitiveExportData,
  exportCognitiveToCSV,
  exportCognitiveToSav,
  saveCognitiveExportFiles,
}
