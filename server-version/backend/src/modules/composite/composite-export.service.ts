import { loadTrainingVariantExportGraph, trainingVariantProvenance, trainingVariantStratumKey, trainingVariantExportStrata, readTrainingVariantCognitiveTrials, TRAINING_VARIANT_EXPORT_VERSION } from './training-variant-export'
import { loadSituationalExportSlotSets, readSituationalExportResults, situationalExportColumns } from './situational-canonical-export'
import {projectTrainingTimingFact} from '../assessment-runtime/training-scale-timing'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import { legacyFormValueProjection } from '../assessment-runtime/typed-form'
import { canonicalHash } from '../assessment-runtime/canonical'
import { typedFormExportColumns, type TypedFormColumnSource } from './typed-form-export'
import { readLoadedCompositeTypedFormValues } from '../assessment-runtime/typed-form-facts'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { protectCsvCell } from '../../utils/exportCsvCell'
import { loadScaleResult } from '../scale/scale-workflow.service'
import { createStoredScaleExportReader } from '../assessment-runtime/compact-assessment-storage'
import { loadScaleAnswers } from '../scale/scale-workflow.service'
import { compositeForbidden, compositeBadRequest } from './composite.errors'
import { wideExportPackage } from '../../services/wideExportPackage'
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
export type CompositeExportFormat = 'csv' | 'sav' | 'zip'

export interface CompositeExportField {
  formSource?: TypedFormColumnSource
  name: string
  label: string
  type: 'numeric' | 'string' | 'date'
  width?: number
  decimals?: number
  unit?: string | null
  allowedValues?: unknown[]
  missingMeaning?: string
}

export interface CompositeExportData {
  trainingVariantExport?: { version: typeof TRAINING_VARIANT_EXPORT_VERSION; strata: ReturnType<typeof trainingVariantExportStrata>; pooling: 'STRATIFIED_ONLY' }
  typedFormExportVersion?: string
  totalCount?: number
  assessmentId: string
  assessmentName: string
  detail: CompositeExportDetail
  fields: CompositeExportField[]
  rows: Record<string, unknown>[]
  trialCount: number
}

export interface CompositeExportOptions {
  courseId?: string
  previewLimit?: number
  accessTokenId?: string // Internal exact-wave filter; never supplied directly by the generic export route.
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
  const governed = await prisma.$queryRaw<Array<{id:string}>>`
    SELECT e.id FROM assessment_run_executions e JOIN assessment_run_tracks t
      ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
    JOIN composite_assessment_attempts a ON e.runtime_binding_kind='COMPOSITE' AND a.id=e.runtime_binding_ref
    WHERE a.composite_assessment_id=${assessmentId} AND t.frozen_resource_policy ? 'resultDisclosure' LIMIT 1
  `
  if (governed.length) throw compositeForbidden('本测评包含按内容权限保护的投放结果，请使用有权限的投放报告导出。')
  const detail = options.detail ?? 'summary'
  const anonymize = options.anonymize ?? true
  const filters: Prisma.CompositeAssessmentAttemptWhereInput[] = [{
    compositeAssessmentId: assessmentId,
    ...(options.courseId ? { deliveryCourseId: options.courseId } : {}),
    status: 'COMPLETED',
    ...(options.accessTokenId ? {accessTokenId: options.accessTokenId, userId: null} : {}),
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
  if (!options.previewLimit) assertExportLimits({ records: recordCount })
  const variantGraph = await loadTrainingVariantExportGraph(assessmentId, completedAttemptWhere, {...options, detail})
  if (!variantGraph && !options.previewLimit && detail === 'full') {
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

  const legacyTemplate = variantGraph ? null : await prisma.compositeAssessment.findUnique({
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
        take: options.previewLimit ?? EXPORT_MAX_RECORDS + 1,
        include: {
          user: { select: { id: true, nickname: true, username: true } },
          formAnswers: true,
          scaleAssessments: {
            select: {
              compositeItemId: true,
              timingEncrypted:true,id:true,attemptEpoch:true,submissionId:true,submissionPayloadHash:true,
              answers: true,
              result: true,
            },
          },
          cognitiveSessions: {
            include: {
              assignment: { select: { title: true, profile: true, resolvedReportSnapshotEncrypted: true } },
              ...(!options.previewLimit && detail === 'full' ? {
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
  const template = (variantGraph?.template as NonNullable<typeof legacyTemplate> | undefined) ?? legacyTemplate
  if (!template) throw new Error('综合测评不存在')
  const hasSituational = template.items.some((item: any) => item.type === 'SITUATIONAL')
  const hasTypedForms = template.items.some(item => item.formDefinition != null)
  const sections: any[] = variantGraph ? variantGraph.template.formSections : hasTypedForms ? await prisma.compositeFormSection.findMany({where:{compositeAssessmentId:assessmentId},include:{items:true}}) : []
  const typedSections = sections.map(mapCompositeSection).filter(section=>section.items.some(item=>item.formDefinition!=null))
  if(hasTypedForms && typedSections.reduce((n,section)=>n+section.items.filter(item=>item.formDefinition!=null).length,0)!==template.items.filter(item=>item.formDefinition!=null).length) throw compositeBadRequest('typed Form 缺少冻结区段')
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
  if((template as any).trainingFlowFrozen!=null){
    for(const [key,label]of [['config_digest','流程配置摘要'],['path_hash','接受事实路径摘要'],['termination','结束原因'],['task_satisfaction','课程任务满足状态']])builder.add(`P_${key}`,label,'string',80)
    if((template.trainingFlowFrozen as any)?.schemaVersion===2)for(const [key,label]of [['assignment_hash','材料分配摘要'],['group_key','材料实验组'],['material_digest','已分配材料摘要']])builder.add(`M_${key}`,label,'string',80)
    for(const [index,item]of(template.items as any[]).entries())builder.add(`P${String(index+1).padStart(3,'0')}_path_state`,`[${item.id}] 流程呈现状态`,'string',32,0,{allowedValues:['EXECUTED','CURRENT','NOT_SHOWN'],missingMeaning:'NOT_SHOWN未执行，测量/计时为空而非0。'})
  }
  if (template.trainingVariantFrozen!=null) for (const [key, label] of [['stratum_key', '独立分析分层'], ['config_digest', '分卷配置摘要'], ['union_digest', '发布全集摘要'], ['published_at', '发布时刻'], ['variant_key', '分组'], ['algorithm', '分配算法'], ['assigned_at', '分配时刻'], ['allocation_hash', '分配记录摘要']]) builder.add(`V_${key}`, label, 'string', 80)
  if (template.trainingVariantFrozen!=null) for (const [index, item] of (template.items as any[]).entries()) builder.add(`V${String(index + 1).padStart(3, '0')}_selection_state`, `[${item.id}] 分卷呈现状态`, 'string', 24, 0, {allowedValues: ['SELECTED', 'NOT_SHOWN'], missingMeaning: 'NOT_SHOWN 为未选中，不是零分、未完成或拒答；不同分层不得静默合并分析。'})

  const formItems = template.items.filter((item: any) => item.type === 'FORM')
  const sectionSources = new Map(typedSections.flatMap(section=>{
    const source={sectionKey:section.id,sectionDefinitionHash:canonicalHash(section),factsSchemaVersion:(section.items.some(item=>item.formPolicy!=null)?3:2) as 2|3}
    return section.items.map(item=>[item.id,source] as const)
  }))
  const typedColumns = new Map<string,ReturnType<typeof typedFormExportColumns>>()
  formItems.forEach((item: any, index: number) => {
    if(item.formDefinition!=null) {
      const columns=typedFormExportColumns(item,index,detail,sectionSources.get(item.id)); typedColumns.set(item.id,columns)
      for(const {field} of columns) { builder.add(field.name,field.label,field.type,field.width,field.decimals,field); Object.assign(builder.fields.find(f=>f.name===field.name)!,field) }
    } else builder.add(`F${String(index + 1).padStart(3, '0')}_value`, `[表单] ${packageSlotLabels.get(item.position) ?? item.formLabel}`, 'string', 80)
  })

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
      if(template.productKind==='QUESTIONNAIRE'&&template.timingExportEnabled){
        builder.add(`${prefix}TIMING_scope`,'计时课程来源','string',24)
        builder.add(`${prefix}TIMING_status`,'计时采集状态','string',32)
        for(const question of v2Items)for(const [key,label] of [['firstResponseMs','首次反应毫秒'],['activeTimeMs','有效前台毫秒'],['changeCount','修改次数'],['revisitCount','重访次数'],['status','计时状态']])builder.add(fieldName(`${prefix}TIMING_${key}_`,question.itemCode),`[${scaleLabel}] ${question.itemCode} ${label}`,key==='status'?'string':'numeric',key==='status'?32:12)
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
            { unit: definition.unit ?? null },
          )
        }
      }
    }
  })

  // Flow scopes already authenticated one batch of all current-epoch facts.
  // Consume those exact rows, rather than rereading a potentially changed set.
  // Other exports retain their original single bounded snapshot query.
  const flowSnapshots = (template as any).trainingFlowFrozen != null ? template.attempts.flatMap(attempt => {
    const flow = variantGraph?.scopes.get(attempt.id)?.flow
    if (!flow) throw new Error('Training flow export verified scope missing')
    return flow.snapshots
  }) : null
  const snapshots = flowSnapshots ?? ((hasTypedForms || hasSituational) && template.attempts.length ? await prisma.assessmentUnitSnapshot.findMany({where:{OR:template.attempts.map(attempt=>({compositeAttemptId:attempt.id,attemptEpoch:attempt.attemptEpoch})),unitType:{in:[...(hasTypedForms ? ['FORM_SECTION' as const] : []), ...(hasSituational ? ['SITUATIONAL' as const] : [])]}}}) : [])
  const snapshotsByAttempt = new Map<string,typeof snapshots>()
  for(const snapshot of snapshots) { const rows=snapshotsByAttempt.get(snapshot.compositeAttemptId!)??[]; rows.push(snapshot); snapshotsByAttempt.set(snapshot.compositeAttemptId!,rows) }
  const situationalSlots = hasSituational ? (variantGraph?.frozenSlotSets ?? await loadSituationalExportSlotSets(template.attempts)) : new Map()
  const situationalByAttempt = new Map(template.attempts.map(attempt => [attempt.id,
    hasSituational ? readSituationalExportResults({ ...attempt, compositeAssessment: template }, snapshotsByAttempt.get(attempt.id) ?? [],
      situationalSlots.get(attempt.id)!, variantGraph?.scopes.get(attempt.id)) : new Map()]))
  const visibleSjtSlots = new Set(template.items.filter(item => item.type === 'SITUATIONAL').map(item => `situational:${item.id}`))
  for (const plan of situationalSlots.values()) for (const slot of plan.slots) if (slot.unitType === 'SITUATIONAL' && !visibleSjtSlots.has(slot.slotKey)) throw new Error('SJT export frozen slot has no export column')
  const situationalColumns = new Map<string, ReturnType<typeof situationalExportColumns>>()
  template.items.forEach((item, index) => {
    if (item.type !== 'SITUATIONAL') return
    const columns = situationalExportColumns(`J${String(index + 1).padStart(3, '0')}_`, packageSlotLabels.get(item.position) ?? 'SJT',
      template.attempts.map(attempt => situationalByAttempt.get(attempt.id)?.get(`situational:${item.id}`) ?? null))
    situationalColumns.set(item.id, columns)
    for (const field of columns.fields) builder.add(field.name, field.label, field.type, field.width, field.decimals, field)
  })
  const rows: Record<string, unknown>[] = []
  let trialCount = 0
  // Only the already-authorized, selected graph may enter the request-local
  // reader. Its order matches projection below, including multi-Scale attempts.
  const orderedScaleRecords: any[] = []
  for (const attempt of template.attempts as any[]) {
    const scope = variantGraph?.scopes.get(attempt.id)
    for (const item of template.items) {
      if (item.type !== 'SCALE' || (scope && !scope.itemIds.has(item.id))) continue
      const record = attempt.scaleAssessments.find((assessment: any) => assessment.compositeItemId === item.id)
      if (record) orderedScaleRecords.push(record)
    }
  }
  const scaleReader = createStoredScaleExportReader(orderedScaleRecords)
  try {
  for (const attempt of template.attempts as any[]) {
    const scope = variantGraph?.scopes.get(attempt.id)
    const selectedFormItems = scope ? formItems.filter((item: any) => scope.itemIds.has(item.id)) : formItems
    const selectedTypedSections = scope ? typedSections.filter(section => scope.sectionIds.has(section.id)) : typedSections
    const readableFormAnswers = readContextFormAnswers(selectedFormItems, attempt.formAnswers)
    const formStates = new Map<string,import('../assessment-runtime/typed-form-facts').TypedFormMetadata>()
    const canonicalValues = hasTypedForms ? readLoadedCompositeTypedFormValues(attempt,selectedTypedSections,snapshotsByAttempt.get(attempt.id)??[],formStates) : new Map()
    const legacyValues = new Map(readableFormAnswers.map((answer:any)=>[answer.itemId,answer.value]))
    const row: Record<string, unknown> = {
      U_id: attempt.anonymousCode || (attempt.userId ? `U${attempt.userId.substring(0, 8)}` : 'ANONYMOUS'),
      A_attempt_id: attempt.id,
      A_assessment: template.name,
      A_date: attempt.completedAt?.toISOString() ?? null,
      A_duration_s: attempt.totalTime == null ? null : Math.round(attempt.totalTime / 1000),
      A_context_snapshot_hash: attempt.contextSnapshotHash ?? null,
    }
    if (scope?.variant) {
      const provenance = trainingVariantProvenance(scope)!
      Object.assign(row, {V_stratum_key: trainingVariantStratumKey(scope), V_config_digest: provenance.configDigest, V_union_digest: provenance.unionDigest, V_published_at: provenance.publishedAt, V_variant_key: provenance.variantKey, V_algorithm: provenance.algorithm, V_assigned_at: provenance.assignedAt, V_allocation_hash: provenance.allocationHash})
      template.items.forEach((item: any, index: number) => {row[`V${String(index + 1).padStart(3, '0')}_selection_state`] = scope.itemIds.has(item.id) ? 'SELECTED' : 'NOT_SHOWN'})
    }
    if(scope?.flow){
      Object.assign(row,{P_config_digest:scope.flow.config.flowDigest,P_path_hash:scope.flow.pathHash,P_termination:scope.flow.path.termination,P_task_satisfaction:scope.flow.path.taskSatisfaction})
      if(scope.flow.materialAssignment)Object.assign(row,{M_assignment_hash:scope.flow.materialAssignment.assignmentHash,M_group_key:scope.flow.materialAssignment.groupKey,M_material_digest:scope.flow.materialAssignment.materialDigest})
      template.items.forEach((item:any,index:number)=>{const slot=item.type==='FORM'?`form-section:${item.formSectionId}`:`${item.type.toLowerCase()}:${item.id}`;row[`P${String(index+1).padStart(3,'0')}_path_state`]=scope.flow!.executedSlotKeys.has(slot)?'EXECUTED':scope.itemIds.has(item.id)?'CURRENT':'NOT_SHOWN'})
    }
    if (!anonymize) row.U_name = attempt.user?.nickname || attempt.user?.username || null

    for (let index = 0; index < formItems.length; index += 1) {
      const item = formItems[index]
      if (scope && !scope.itemIds.has(item.id)) {
        for (const column of typedColumns.get(item.id) ?? []) row[column.field.name] = column.field.formSource?.encoding === 'STATE' ? 'NOT_SHOWN' : null
        if (item.formDefinition == null) row[`F${String(index + 1).padStart(3, '0')}_value`] = null
        continue
      }
      if(item.formDefinition!=null) for(const column of typedColumns.get(item.id)??[]) row[column.field.name]=column.read(canonicalValues.get(item.id)??null,formStates.get(item.id))
      else row[`F${String(index + 1).padStart(3, '0')}_value`] = canonicalValues.has(item.id)?legacyFormValueProjection(canonicalValues.get(item.id)??null):legacyValues.get(item.id)??null
    }

    for (let index = 0; index < template.items.length; index += 1) {
      const item: any = template.items[index]
      const prefix = slotPrefix('S', index)
      if (scope && !scope.itemIds.has(item.id)) {
        if (item.type === 'SITUATIONAL') Object.assign(row, situationalColumns.get(item.id)!.read(null, scope.flow ? 'NOT_SHOWN' : 'NOT_APPLICABLE'))
        continue
      }
      if (item.type === 'SITUATIONAL') {
        const slotKey = `situational:${item.id}`
        const terminal = snapshotsByAttempt.get(attempt.id)?.find(snapshot => snapshot.slotKey === slotKey)?.terminalState
          ?? (situationalSlots.get(attempt.id)?.slots.some((slot: { slotKey: string }) => slot.slotKey === slotKey) ? 'MISSING_OPTIONAL' : 'NOT_ACTIVE')
        Object.assign(row, situationalColumns.get(item.id)!.read(situationalByAttempt.get(attempt.id)?.get(slotKey) ?? null, terminal))
      }
      if (item.type === 'SCALE') {
        const result = attempt.scaleAssessments.find((assessment: any) => assessment.compositeItemId === item.id)
        row[`${prefix}scale_id`] = item.scale?.id ?? item.scaleId ?? null
        row[`${prefix}scale_code`] = item.scale?.code ?? null
        const definition = item.scale.definition && typeof item.scale.definition === 'object' ? item.scale.definition as any : null
        const v2Items = Array.isArray(definition?.items) ? definition.items : []
        const v2Scores = Array.isArray(definition?.scoring?.scores) ? definition.scoring.scores : []
        if(template.productKind==='QUESTIONNAIRE'&&template.timingExportEnabled){
          const timing=projectTrainingTimingFact(attempt.trainingTimingSnapshot,result?.timingEncrypted?decryptUnifiedRuntimePayload(result.timingEncrypted):null)
          row[`${prefix}TIMING_scope`]=timing.scope;row[`${prefix}TIMING_status`]=timing.status
          const scaleLabel=packageSlotLabels.get(item.position)??item.scale.name
          for(const question of v2Items){
            const observed=(timing.items as Record<string,any>)[question.itemCode]
            for(const [key,label] of [['firstResponseMs','首次反应毫秒'],['activeTimeMs','有效前台毫秒'],['changeCount','修改次数'],['revisitCount','重访次数'],['status','计时状态']]){
              const value=key==='status'?(timing.status==='NOT_COLLECTED'?'NOT_COLLECTED':!observed?'MISSING':observed.recoveredWithoutClock?'RECOVERED_NO_FIRST_RESPONSE':observed.interrupted?'INTERRUPTED':'RECORDED'):observed?.[key]??null
              row[builder.resolve(fieldName(`${prefix}TIMING_${key}_`,question.itemCode),`[${scaleLabel}] ${question.itemCode} ${label}`)]=value
            }
          }
        }
        if (result) await scaleReader.prepare(result)
        const scaleResult = (await loadScaleResult(result?.result, result)).result
        const decodedAnswers = (await loadScaleAnswers(result?.answers, result))
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
            const decodedTrials = scope ? readTrainingVariantCognitiveTrials(session) : null
            for (const trial of decodedTrials ?? session.trials ?? []) {
              const payload = decodedTrials ? trial.payload : decryptCognitivePayload<unknown>(trial.payloadEncrypted)
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
  } finally {
    // Raw/fact/whole-receipt batches are released even if projection fails.
    await scaleReader.close()
  }

  // 动态字段在遍历数据时才会出现，确保每一行具有稳定列集合。
  for (const row of rows) for (const field of builder.fields) if (!(field.name in row)) row[field.name] = null
  assertExportLimits({ records: rows.length, fields: builder.fields.length, trials: trialCount })
  return { ...(options.previewLimit ? {totalCount: recordCount} : {}), ...(variantGraph && template.trainingVariantFrozen!=null ? {trainingVariantExport: {version: TRAINING_VARIANT_EXPORT_VERSION, pooling: 'STRATIFIED_ONLY' as const, strata: trainingVariantExportStrata(template.attempts, variantGraph.scopes)}} : {}), ...(hasTypedForms?{typedFormExportVersion:"training-form-export-v1"}:{}), assessmentId: template.id, assessmentName: template.name, detail, fields: builder.fields, rows, trialCount }
}

/** Basic task administration only. Every denominator is a single immutable
 * publication/configuration/group; no psychological metrics are pooled. */
export const getTrainingVariantTaskAnalysis = async (assessmentId: string, actor: NonNullable<CompositeExportOptions['actor']>) => {
  const visibility = await teacherRelationalExportVisibility(actor)
  const where: Prisma.CompositeAssessmentAttemptWhereInput = {AND: [{compositeAssessmentId: assessmentId}, ...(visibility ? [visibility] : [])]}
  const recordCount = await prisma.compositeAssessmentAttempt.count({where})
  assertExportLimits({records: recordCount})
  const graph = await loadTrainingVariantExportGraph(assessmentId, where, {}, true)
  if (!graph) throw compositeBadRequest('此问卷未启用概率分卷')
  // A concurrent append cannot be silently omitted from a bounded result.
  assertExportLimits({records: graph.template.attempts.length})
  return {schemaVersion: TRAINING_VARIANT_EXPORT_VERSION, assessmentId, pooling: 'STRATIFIED_ONLY' as const,
    recordCount: graph.template.attempts.length, strata: trainingVariantExportStrata(graph.template.attempts, graph.scopes),
    countMeaning: '每个发布、配置、分组独立计数；次数不是人数。任务达成以该组已交卷为分母。未选中单元不适用，不计作零分或缺失。未提供跨组心理指标统计。'}
}

export const exportToCSV = (data: CompositeExportData) => {
  if(!data.fields.some(field=>field.formSource)) return exportCognitiveToCSV(data)
  // Only new typed text cells use the shared strengthened guard. Legacy bytes stay unchanged.
  const typedTextFields=new Set(data.fields.filter(field=>field.formSource && field.type==='string').map(field=>field.name))
  const rows=data.rows.map(row=>Object.fromEntries(Object.entries(row).map(([name,value])=>{
    return [name,typedTextFields.has(name)?protectCsvCell(value):value]
  })))
  return exportCognitiveToCSV({...data,rows})
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
  if(format==='sav' && (exportData.typedFormExportVersion || exportData.fields.some(field=>field.formSource))) throw compositeBadRequest('TYPED_FORM_SAV_NOT_SUPPORTED: typed Form 仅支持 CSV/ZIP 无损导出')
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
  } else if (format === 'zip') {
    fs.writeFileSync(filePath, wideExportPackage(exportToCSV(exportData), exportData.fields, { resourceType: 'COMPOSITE', resourceId: assessmentId, detail: exportData.detail, ...(exportData.trainingVariantExport ? {trainingVariantExport: exportData.trainingVariantExport} : {}) }))
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

export const compositeExportService = { getTrainingVariantTaskAnalysis, getExportData, exportToCSV, makeFileName, saveExportFiles, toSavVariables }

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
