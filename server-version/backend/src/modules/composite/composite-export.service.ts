import { exportRoot } from '../../services/exportArtifactService'
import * as fs from 'fs'
import { createHash } from 'crypto'
import * as path from 'path'
import { saveToFile, SavVariable, VariableMeasure, VariableType } from 'sav-writer'
import { v4 as uuidv4 } from 'uuid'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { safeDecrypt } from '../../utils/encryption'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { readFrozenReport } from '../cognitive/profile-freeze'
import { ExportFieldBuilder, exportCognitiveToCSV, scalarExportValue } from '../cognitive/export.service'
import { parseCognitiveResultSnapshot } from '../cognitive/v2/result-snapshot'
import type { CognitiveResultSnapshot } from '../cognitive/v2/types'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'
import { getFrozenPackageSlotLabels } from './report-package-label'
import { readContextFormAnswers } from '../assessment-context'
import { readScaleAnswers } from '../scale/scale-workflow.service'
import {
  assertExportLimits,
  cleanupExpiredExportFiles,
  ensureExportFileWithinLimit,
  EXPORT_MAX_RECORDS,
  EXPORT_MAX_TRIALS,
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

export interface CompositeExportOptions {
  detail?: CompositeExportDetail
  anonymize?: boolean
  dateRange?: { start?: string; end?: string }
  actor?: { userId: string; role: UserRole }
}

const EXPORT_DIR = exportRoot()

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

const isV2CognitiveAssignment = (assignment: any): boolean => Boolean(
  assignment?.config
  && getCognitiveV2TaskDefinition(
    assignment.config.testType,
    assignment.config.engineVersion,
    assignment.config.scoringVersion,
  ),
)

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

export const teacherRelationalExportVisibility = async (
  actor: CompositeExportOptions['actor'],
): Promise<Prisma.CompositeAssessmentAttemptWhereInput | null> => {
  if (!actor || actor.role !== UserRole.TEACHER) return null
  const readable = await prisma.relationalAssessmentAssignment.findMany({
    where: {
      createdByUserId: actor.userId,
      perspective: 'OBSERVER_REPORT',
      analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'observer_assigning_teacher_v1',
    },
    select: { id: true },
  })
  return {
    OR: [
      { assignmentRef: null },
      { assignmentRef: { in: readable.map((row) => row.id) } },
    ],
  }
}

export const getExportData = async (
  assessmentId: string,
  options: CompositeExportOptions = {},
): Promise<CompositeExportData> => {
  const detail = options.detail ?? 'summary'
  const anonymize = options.anonymize ?? true
  const filters: Prisma.CompositeAssessmentAttemptWhereInput[] = [{
    compositeAssessmentId: assessmentId,
    status: 'COMPLETED',
    ...(completedDateWhere(options.dateRange) ? { completedAt: completedDateWhere(options.dateRange) } : {}),
  }]
  const relationalVisibility = await teacherRelationalExportVisibility(options.actor)
  if (relationalVisibility) filters.push(relationalVisibility)
  const completedAttemptWhere: Prisma.CompositeAssessmentAttemptWhereInput = filters.length === 1
    ? filters[0]
    : { AND: filters }

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
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              instrumentClass: true,
              instrumentVersion: true,
              definition: true,
            },
          },
          cognitiveAssignment: {
            select: {
              title: true,
              profile: true,
              resolvedReportSnapshotEncrypted: true,
              config: { select: { testType: true, engineVersion: true, scoringVersion: true } },
            },
          },
        },
      },
      attempts: {
        where: completedAttemptWhere,
        orderBy: [{ completedAt: 'asc' }, { startedAt: 'asc' }],
        take: EXPORT_MAX_RECORDS + 1,
        include: {
          user: { select: { id: true, nickname: true, username: true } },
          formAnswers: true,
          scaleAssessments: {
            select: {
              compositeItemId: true,
              answers: true,
              result: true,
            },
          },
          cognitiveSessions: {
            include: {
              assignment: { select: { title: true, profile: true, resolvedReportSnapshotEncrypted: true } },
              ...(detail === 'full' ? {
                trials: {
                  orderBy: { trialIndex: 'asc' },
                  take: EXPORT_MAX_TRIALS + 1,
                  select: { trialIndex: true, payloadEncrypted: true },
                },
              } : {}),
            },
          },
        },
      },
    },
  })
  if (!template) throw new Error('综合测评不存在')
  assertExportLimits({ records: template.attempts.length })
  const packageSlotLabels = getFrozenPackageSlotLabels(template)

  const builder = new ExportFieldBuilder()
  builder.add('U_id', '参与者编号', 'string', 80)
  if (!anonymize) builder.add('U_name', '姓名', 'string', 80)
  builder.add('A_attempt_id', '综合测评记录ID', 'string', 80)
  builder.add('A_assessment', '综合测评名称', 'string', 80)
  builder.add('A_date', '完成日期', 'date', 80)
  builder.add('A_duration_s', '完成用时(秒)', 'numeric', 12)
  builder.add('A_context_snapshot_hash', '测评上下文快照哈希', 'string', 64)

  const formItems = template.items.filter((item: any) => item.type === 'FORM')
  formItems.forEach((item: any, index: number) => builder.add(`F${String(index + 1).padStart(3, '0')}_value`, `[表单] ${packageSlotLabels.get(item.position) ?? item.formLabel}`, 'string', 80))

  template.items.forEach((item: any, index: number) => {
    const prefix = slotPrefix('S', index)
    if (item.type === 'SCALE' && item.scale) {
      const scaleLabel = packageSlotLabels.get(item.position) ?? item.scale.name
      builder.add(`${prefix}scale_id`, `[${scaleLabel}] 量表ID`, 'string', 80)
      builder.add(`${prefix}scale_code`, `[${scaleLabel}] 量表编码`, 'string', 80)
      builder.add(`${prefix}report_definition_version`, `[${scaleLabel}] 报告定义版本`, 'string', 80)
      const definition = item.scale.definition && typeof item.scale.definition === 'object' ? item.scale.definition as any : null
      const v2Items = Array.isArray(definition?.items) ? definition.items : []
      const v2Scores = Array.isArray(definition?.scoring?.scores) ? definition.scoring.scores : []
      if (v2Items.length === 0 || v2Scores.length === 0) {
        throw new Error(`量表 ${item.scale.code || item.scale.id} 没有有效的 ScaleDefinitionV2`)
      }
      if (detail === 'full') {
        v2Items.forEach((scaleItem: any) => {
          const itemCode = scaleItem.itemCode
          builder.add(fieldName(`${prefix}Q_V_`, itemCode), `[${scaleLabel}] ${itemCode} 原始回答`, 'string', 32)
          builder.add(fieldName(`${prefix}Q_S_`, itemCode), `[${scaleLabel}] ${itemCode} 映射后题目分值`, 'numeric', 12, 6)
          builder.add(fieldName(`${prefix}RT_`, itemCode), `[${scaleLabel}] ${itemCode} 作答时间(毫秒)`, 'numeric', 12)
        })
      }
      v2Scores.forEach((score: any) => builder.add(fieldName(`${prefix}SCORE_`, score.key), `[${scaleLabel}] ${score.key} ${score.label}冻结得分`, 'numeric', 12, 6))
      builder.add(`${prefix}quality_status`, `[${scaleLabel}] 质量状态`, 'string', 24)
      builder.add(`${prefix}quality_flags`, `[${scaleLabel}] 质量问题`, 'string', 80)
      builder.add(`${prefix}instrument_version`, `[${scaleLabel}] 量表版本`, 'string', 24)
      builder.add(`${prefix}scoring_version`, `[${scaleLabel}] 计分版本`, 'string', 24)
      builder.add(`${prefix}definition_hash`, `[${scaleLabel}] 定义哈希`, 'string', 80)
      builder.add(`${prefix}reference_versions`, `[${scaleLabel}] 使用的参考版本`, 'string', 48)
      builder.add(`${prefix}context_snapshot_hash`, `[${scaleLabel}] 测评上下文快照哈希`, 'string', 64)
      builder.add(`${prefix}device_class`, `[${scaleLabel}] 设备类别`, 'string', 16)
      builder.add(`${prefix}device_os_family`, `[${scaleLabel}] 操作系统族`, 'string', 24)
      builder.add(`${prefix}device_browser_family`, `[${scaleLabel}] 浏览器族`, 'string', 24)
      builder.add(`${prefix}device_viewport_width`, `[${scaleLabel}] 视口宽度`, 'numeric', 12)
      builder.add(`${prefix}device_viewport_height`, `[${scaleLabel}] 视口高度`, 'numeric', 12)
      builder.add(`${prefix}device_screen_width`, `[${scaleLabel}] 屏幕宽度`, 'numeric', 12)
      builder.add(`${prefix}device_screen_height`, `[${scaleLabel}] 屏幕高度`, 'numeric', 12)
      builder.add(`${prefix}device_pixel_ratio`, `[${scaleLabel}] 设备像素比`, 'numeric', 12, 3)
      builder.add(`${prefix}device_max_touch_points`, `[${scaleLabel}] 最大触点数`, 'numeric', 12)
      builder.add(`${prefix}device_primary_pointer`, `[${scaleLabel}] 主指针类型`, 'string', 16)
      builder.add(`${prefix}device_captured_at`, `[${scaleLabel}] 捕获时间`, 'string', 32)
    }
    if (item.type === 'COGNITIVE') {
      const childPrefix = slotPrefix('C', index)
      const title = packageSlotLabels.get(item.position) ?? (item.cognitiveAssignment?.title || '认知任务')
      const frozenReport = frozenReportFor(item.cognitiveAssignment)
      // v2 result snapshots deliberately have no generic score. Determine the
      // column from the frozen assignment contract so an empty export has the
      // same schema as a populated export.
      const showProductIndex = !isV2CognitiveAssignment(item.cognitiveAssignment)
        && frozenReport?.reportDefinition?.showProductIndex !== false
      if (showProductIndex) builder.add(`${childPrefix}score`, `[${title}] 测评得分`, 'numeric', 12, 2)
      builder.add(`${childPrefix}quality`, `[${title}] 数据质量`, 'string', 80)
      builder.add(`${childPrefix}profile`, `[${title}] Profile`, 'string', 80)
      builder.add(`${childPrefix}profile_definition_version`, `[${title}] profile-definition version`, 'string', 80)
      builder.add(`${childPrefix}metric_definition_version`, `[${title}] metric-definition version`, 'string', 80)
      builder.add(`${childPrefix}quality_definition_version`, `[${title}] quality-definition version`, 'string', 80)
      builder.add(`${childPrefix}test_type`, `[${title}] testType`, 'string', 80)
      builder.add(`${childPrefix}engine_version`, `[${title}] engineVersion`, 'string', 80)
      builder.add(`${childPrefix}scoring_version`, `[${title}] scoringVersion`, 'string', 80)
      builder.add(`${childPrefix}config_version`, `[${title}] configVersion`, 'string', 80)
      builder.add(`${childPrefix}randomization_algorithm_version`, `[${title}] randomization algorithm version`, 'string', 80)
      builder.add(`${childPrefix}report_definition_version`, `[${title}] report-definition version`, 'string', 80)
      if (frozenReport) {
        for (const key of Object.keys(frozenReport.metricDefinitions || {}).sort()) {
          const definition = frozenReport.metricDefinitions[key]
          if (!includeFrozenMetric(definition, detail)) continue
          const metricLabel = definition.export?.label || definition.label || key
          builder.add(
            fieldName(`${childPrefix}M_`, key),
            `[${title}] ${metricLabel}`,
            frozenMetricType(definition),
            12,
            frozenMetricDecimals(definition),
          )
        }
      }
    }
  })

  const rows: Record<string, unknown>[] = []
  let trialCount = 0
  for (const attempt of template.attempts as any[]) {
    const readableFormAnswers = readContextFormAnswers(formItems, attempt.formAnswers)
    const row: Record<string, unknown> = {
      U_id: attempt.anonymousCode || (attempt.userId ? `U${attempt.userId.substring(0, 8)}` : 'ANONYMOUS'),
      A_attempt_id: attempt.id,
      A_assessment: template.name,
      A_date: attempt.completedAt?.toISOString() ?? null,
      A_duration_s: attempt.totalTime == null ? null : Math.round(attempt.totalTime / 1000),
      A_context_snapshot_hash: attempt.contextSnapshotHash ?? null,
    }
    if (!anonymize) row.U_name = attempt.user?.nickname || attempt.user?.username || null

    for (let index = 0; index < formItems.length; index += 1) {
      const item = formItems[index]
      row[`F${String(index + 1).padStart(3, '0')}_value`] = readableFormAnswers.find((answer: any) => answer.itemId === item.id)?.value ?? null
    }

    for (let index = 0; index < template.items.length; index += 1) {
      const item: any = template.items[index]
      const prefix = slotPrefix('S', index)
      if (item.type === 'SCALE') {
        const result = attempt.scaleAssessments.find((assessment: any) => assessment.compositeItemId === item.id)
        row[`${prefix}scale_id`] = item.scale?.id ?? item.scaleId ?? null
        row[`${prefix}scale_code`] = item.scale?.code ?? null
        const definition = item.scale.definition && typeof item.scale.definition === 'object' ? item.scale.definition as any : null
        const v2Items = Array.isArray(definition?.items) ? definition.items : []
        const v2Scores = Array.isArray(definition?.scoring?.scores) ? definition.scoring.scores : []
        const scaleResult = decode<Record<string, any>>(result?.result)
        const decodedAnswers = readScaleAnswers(result?.answers)
        const answers = detail === 'full' ? decodedAnswers.answers : []
        const answerMap = new Map<string, any>(answers.map((answer) => [answer.itemCode, answer]))
        const itemScoreMap = new Map<string, any>((scaleResult?.itemScores || []).map((answer: any) => [answer.itemCode, answer]))
        if (detail === 'full') {
          v2Items.forEach((scaleItem: any) => {
            const itemCode = scaleItem.itemCode
            const questionLabel = `[${packageSlotLabels.get(item.position) ?? item.scale.name}] ${itemCode} 原始回答`
            const scoreLabel = `[${packageSlotLabels.get(item.position) ?? item.scale.name}] ${itemCode} 映射后题目分值`
            const responseTimeLabel = `[${packageSlotLabels.get(item.position) ?? item.scale.name}] ${itemCode} 作答时间(毫秒)`
            row[builder.resolve(fieldName(`${prefix}Q_V_`, itemCode), questionLabel)] = answerMap.get(itemCode)?.responseValue ?? null
            row[builder.resolve(fieldName(`${prefix}Q_S_`, itemCode), scoreLabel)] = itemScoreMap.get(itemCode)?.score ?? null
            row[builder.resolve(fieldName(`${prefix}RT_`, itemCode), responseTimeLabel)] = answerMap.get(itemCode)?.responseTimeMs ?? null
          })
        }
        row[`${prefix}report_definition_version`] = scaleResult?.method?.reportVersion ?? null
        row[`${prefix}quality_status`] = scaleResult?.quality?.status ?? null
        row[`${prefix}quality_flags`] = Array.isArray(scaleResult?.quality?.flags) ? scaleResult.quality.flags.join('|') : null
        row[`${prefix}instrument_version`] = scaleResult?.method?.instrumentVersion ?? null
        row[`${prefix}scoring_version`] = scaleResult?.method?.scoringVersion ?? null
        row[`${prefix}definition_hash`] = scaleResult?.method?.definitionHash ?? null
        row[`${prefix}reference_versions`] = Array.isArray(scaleResult?.method?.referenceVersions) ? scaleResult.method.referenceVersions.join('|') : null
        row[`${prefix}context_snapshot_hash`] = scaleResult?.method?.assessmentContext?.snapshotHash ?? attempt.contextSnapshotHash ?? null
        const device = decodedAnswers.deviceInputProvenance
        row[`${prefix}device_class`] = device?.deviceClass ?? null
        row[`${prefix}device_os_family`] = device?.osFamily ?? null
        row[`${prefix}device_browser_family`] = device?.browserFamily ?? null
        row[`${prefix}device_viewport_width`] = device?.viewportWidth ?? null
        row[`${prefix}device_viewport_height`] = device?.viewportHeight ?? null
        row[`${prefix}device_screen_width`] = device?.screenWidth ?? null
        row[`${prefix}device_screen_height`] = device?.screenHeight ?? null
        row[`${prefix}device_pixel_ratio`] = device?.devicePixelRatio ?? null
        row[`${prefix}device_max_touch_points`] = device?.maxTouchPoints ?? null
        row[`${prefix}device_primary_pointer`] = device?.primaryPointer ?? null
        row[`${prefix}device_captured_at`] = device?.capturedAt ?? null
        const scoreMap = new Map<string, any>((scaleResult?.scores || []).map((score: any) => [score.key, score]))
        v2Scores.forEach((score: any) => {
          const scoreLabel = `[${packageSlotLabels.get(item.position) ?? item.scale.name}] ${score.key} ${score.label}冻结得分`
          row[builder.resolve(fieldName(`${prefix}SCORE_`, score.key), scoreLabel)] = scoreMap.get(score.key)?.value ?? null
        })
      }
      if (item.type === 'COGNITIVE') {
        const session = attempt.cognitiveSessions.find((candidate: any) => candidate.compositeItemId === item.id)
        const childPrefix = slotPrefix('C', index)
        const assignment = session?.assignment || item.cognitiveAssignment
        if (session) {
          const resultSnapshot: CognitiveResultSnapshot | null = session.resultSnapshotEncrypted
            ? parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted))
            : null
          const score = resultSnapshot ? null : safeCognitiveValue<number>(session.scoreEncrypted)
          const quality = resultSnapshot?.quality.flags
            ?? safeCognitiveValue<Record<string, unknown>>(session.qualityFlagsEncrypted)
            ?? {}
          const metrics = resultSnapshot?.metrics
            ?? safeCognitiveValue<Record<string, unknown>>(session.metricsEncrypted)
            ?? {}
          const frozenReport = frozenReportFor(assignment)
          const showProductIndex = !isV2CognitiveAssignment(item.cognitiveAssignment)
            && frozenReport?.reportDefinition?.showProductIndex !== false
          if (showProductIndex && !resultSnapshot) row[`${childPrefix}score`] = score
          row[`${childPrefix}quality`] = resultSnapshot
            ? resultSnapshot.quality.state
            : quality.interpretable === false ? 'insufficient' : quality.interpretable === true ? 'interpretable' : null
          row[`${childPrefix}profile`] = resultSnapshot?.profile ?? frozenReport?.profile ?? assignment?.profile ?? null
          row[`${childPrefix}profile_definition_version`] = frozenReport?.profileDefinitionVersion ?? null
          row[`${childPrefix}metric_definition_version`] = frozenReport?.metricDefinitionVersion ?? null
          row[`${childPrefix}quality_definition_version`] = frozenReport?.qualityDefinitionVersion ?? null
          row[`${childPrefix}test_type`] = resultSnapshot?.testType ?? session.testType ?? null
          row[`${childPrefix}engine_version`] = resultSnapshot?.engineVersion ?? session.engineVersion ?? null
          row[`${childPrefix}scoring_version`] = resultSnapshot?.scoringVersion ?? session.scoringVersion ?? null
          row[`${childPrefix}config_version`] = resultSnapshot?.configVersion ?? session.configVersion ?? null
          row[`${childPrefix}randomization_algorithm_version`] = frozenReport?.randomizationAlgorithmVersion ?? null
          row[`${childPrefix}report_definition_version`] = frozenReport?.reportDefinitionVersion ?? null
          if (frozenReport) {
            for (const key of Object.keys(frozenReport.metricDefinitions || {}).sort()) {
              const definition = frozenReport.metricDefinitions[key]
              if (!includeFrozenMetric(definition, detail)) continue
              const metricLabel = definition.export?.label || definition.label || key
              const metricName = builder.resolve(fieldName(`${childPrefix}M_`, key), `[${packageSlotLabels.get(item.position) ?? (item.cognitiveAssignment?.title || '认知任务')}] ${metricLabel}`)
              row[metricName] = scalarExportValue(metrics[key] ?? null)
            }
          } else {
            // Historical assignments without a frozen report remain readable,
            // but once a snapshot exists no row can add a data-dependent field.
            for (const [key, value] of Object.entries(metrics)) {
              const metricLabel = `[${packageSlotLabels.get(item.position) ?? (item.cognitiveAssignment?.title || '认知任务')}] ${key}`
              const metricType = typeof value === 'number' ? 'numeric' : 'string'
              const metricName = builder.add(
                fieldName(`${childPrefix}M_`, key),
                metricLabel,
                metricType,
                metricType === 'numeric' ? 12 : 80,
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
                const trialLabel = `[${packageSlotLabels.get(item.position) ?? (item.cognitiveAssignment?.title || '认知任务')}] 第${trial.trialIndex + 1}次 ${key}`
                const trialType = typeof value === 'number' ? 'numeric' : 'string'
                const trialName = builder.add(
                  fieldName(`${childPrefix}T${String(trial.trialIndex + 1).padStart(3, '0')}_`, key),
                  trialLabel,
                  trialType,
                  trialType === 'numeric' ? 12 : 80,
                  typeof value === 'number' && !Number.isInteger(value) ? 4 : 0,
                )
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
  for (const row of rows) for (const field of builder.fields) if (!(field.name in row)) row[field.name] = null
  assertExportLimits({ records: rows.length, fields: builder.fields.length, trials: trialCount })
  return { assessmentId: template.id, assessmentName: template.name, detail, fields: builder.fields, rows, trialCount }
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
  options: CompositeExportOptions,
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
