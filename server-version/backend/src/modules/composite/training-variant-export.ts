import { isTaskSatisfied } from '../assessment-runtime/form-policy'
import { parseCompiledWeightedVariants } from '../assessment-core/weighted-variants'
import { compositeBadRequest } from './composite.errors'
import { buildTrainingVariantUnion } from './training-variant-scope'
import { prisma } from '../../config/database'
import { assertExportLimits, EXPORT_MAX_RECORDS, EXPORT_MAX_TRIALS } from '../../services/exportStorage'
import { canonicalHash } from '../assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { parseUnifiedCognitiveRawSubmissionPayload, UNIFIED_COGNITIVE_RAW_ENCODING_VERSION, UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION } from '../cognitive/unified-raw-submission'
import { loadSituationalExportSlotSets } from './situational-canonical-export'
import { resolveTrainingAttemptScope, type TrainingAttemptScope } from './training-variant-scope'
import type { CompositeExportOptions } from './composite-export.service'

export const TRAINING_VARIANT_EXPORT_VERSION = 'training-weighted-variant-export-v1' as const
export const trainingVariantProvenance = (scope: TrainingAttemptScope) => {
  const allocation = scope.variant
  if (!allocation) return null
  // Participant keys are allocation inputs, not export provenance.
  return {
    schemaVersion: 1, algorithm: allocation.algorithm, configDigest: allocation.configDigest,
    unionDigest: allocation.unionDigest, publishedAt: allocation.publishedAt, variantKey: allocation.variantKey,
    assignedAt: allocation.assignedAt, allocationHash: allocation.allocationHash,
    selectedItemIds: [...allocation.selectedItemIds], selectedSectionIds: [...allocation.selectedSectionIds],
  }
}
export const trainingVariantStratumKey = (scope: TrainingAttemptScope) => scope.variant ? canonicalHash({
  configDigest: scope.variant.configDigest, publishedAt: scope.variant.publishedAt, variantKey: scope.variant.variantKey,
}) : null

export function trainingVariantExportStrata(attempts: any[], scopes: Map<string, TrainingAttemptScope>) {
  const groups = new Map<string, any>()
  for (const attempt of attempts) {
    const scope = scopes.get(attempt.id)!
    const provenance = trainingVariantProvenance(scope)
    if (!provenance) continue
    const key = trainingVariantStratumKey(scope)!
    const group = groups.get(key) ?? {
      stratumKey: key, configDigest: provenance.configDigest, unionDigest: provenance.unionDigest,
      publishedAt: provenance.publishedAt, variantKey: provenance.variantKey, algorithm: provenance.algorithm,
      selectedItemIds: provenance.selectedItemIds, selectedSectionIds: provenance.selectedSectionIds,
      recordCount: 0, completedCount: 0, inProgressCount: 0, abandonedCount: 0, taskSatisfiedCount: 0, taskNotSatisfiedCount: 0,
    }
    group.recordCount++
    if (attempt.status === 'COMPLETED') group.completedCount++
    if (attempt.status === 'IN_PROGRESS') group.inProgressCount++
    if (attempt.status === 'ABANDONED') group.abandonedCount++
    if (attempt.status === 'COMPLETED') group[isTaskSatisfied(attempt) ? 'taskSatisfiedCount' : 'taskNotSatisfiedCount']++
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => a.stratumKey.localeCompare(b.stratumKey))
}

/** The lightweight marker keeps null legacy exports byte-compatible. For a
 * variant, resolve one graph/plan batch before counting or reading child data. */
export async function loadTrainingVariantExportGraph(assessmentId: string, where: any, options: CompositeExportOptions, headersOnly = false) {
  const marker = await prisma.$queryRaw<Array<{id: string}>>`SELECT c.id FROM composite_assessments c
    WHERE c.id=${assessmentId} AND (c.training_variant_frozen IS NOT NULL OR c.training_variant_digest IS NOT NULL
      OR c.training_variant_draft IS NOT NULL OR EXISTS (SELECT 1 FROM composite_assessment_attempts a
        WHERE a.composite_assessment_id=c.id AND (a.training_variant_allocation_encrypted IS NOT NULL OR a.training_variant_allocation_hash IS NOT NULL)))`
  if (!marker.length) return null
  const template: any = await prisma.compositeAssessment.findUnique({ where: { id: assessmentId }, include: {
    items: { orderBy: { position: 'asc' }, include: {
      scale: { select: { id: true, code: true, name: true, instrumentClass: true, instrumentVersion: true, definition: true } },
      cognitiveAssignment: { select: { title: true, profile: true, resolvedReportSnapshotEncrypted: true,
        config: { select: { testType: true, engineVersion: true, scoringVersion: true } } } },
    } },
    formSections: { orderBy: {position: 'asc'}, include: {items: true} },
    attempts: { where, orderBy: [{ completedAt: 'asc' }, { startedAt: 'asc' }], take: options.previewLimit ?? EXPORT_MAX_RECORDS + 1,
      include: {user: {select: {id: true, nickname: true, username: true}}} },
  } })
  if (!template) throw new Error('综合测评不存在')
  const config = parseCompiledWeightedVariants(template.trainingVariantFrozen)
  if (config.configDigest !== template.trainingVariantDigest || config.unionDigest !== canonicalHash({kind: 'WEIGHTED_VARIANT_UNION', schemaVersion: 1, units: buildTrainingVariantUnion(template).units})) throw compositeBadRequest('分卷发布配置不一致')
  assertExportLimits({records: template.attempts.length})
  const frozenSlotSets = await loadSituationalExportSlotSets(template.attempts)
  const scopes = new Map<string, TrainingAttemptScope>()
  for (const attempt of template.attempts) scopes.set(attempt.id, await resolveTrainingAttemptScope(attempt, template, {frozenSlotSets}))
  if (headersOnly) return {template, scopes, frozenSlotSets}
  // Group by the immutable selection and current epoch, avoiding one OR
  // predicate per participant and quadratic child-to-parent attachment.
  const groups = new Map<string, {attemptIds: string[]; attemptEpoch: number; scope: TrainingAttemptScope}>()
  for (const attempt of template.attempts) {
    const scope = scopes.get(attempt.id)!, key = `${trainingVariantStratumKey(scope)}:${attempt.attemptEpoch}`
    const group = groups.get(key) ?? {attemptIds: [] as string[], attemptEpoch: attempt.attemptEpoch, scope}
    group.attemptIds.push(attempt.id); groups.set(key, group)
  }
  const childWhere = (type: string, epochField: string) => ({OR: [...groups.values()].flatMap(group => {
    const ids = group.scope.items.filter(item => item.type === type).map(item => item.id)
    return ids.length ? [{compositeAttemptId: {in: group.attemptIds}, [epochField]: group.attemptEpoch, compositeItemId: {in: ids}}] : []
  })})
  const scaleWhere = childWhere('SCALE', 'attemptEpoch'), cognitiveWhere = childWhere('COGNITIVE', 'attemptNo')
  const formWhere = {OR: [...groups.values()].flatMap(group => {
    const ids = group.scope.items.filter(item => item.type === 'FORM').map(item => item.id)
    return ids.length ? [{attemptId: {in: group.attemptIds}, itemId: {in: ids}}] : []
  })}
  const full = !options.previewLimit && options.detail === 'full'
  if (full && cognitiveWhere.OR.length) {
    const [legacy, unified] = await Promise.all([
      prisma.cognitiveTrial.count({where: {session: {is: {...cognitiveWhere, AND: [{OR: [{runtimeGeneration: null}, {runtimeGeneration: {not: 'UNIFIED_V1'}}]}]}}}}),
      prisma.cognitiveRawSubmission.aggregate({where: {OR: cognitiveWhere.OR.map(condition => ({
        attemptEpoch: condition.attemptNo as number, session: {is: condition},
      }))}, _sum: {trialCount: true}}),
    ])
    assertExportLimits({trials: legacy + (unified._sum.trialCount ?? 0)})
  }
  const [scales, sessions, forms] = template.attempts.length ? await Promise.all([
    scaleWhere.OR.length ? prisma.assessment.findMany({where: scaleWhere, select: {compositeAttemptId: true, compositeItemId: true,
      timingEncrypted: true, id: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true, answers: true, result: true}}) : [],
    cognitiveWhere.OR.length ? prisma.cognitiveSession.findMany({where: cognitiveWhere, include: {
      assignment: {select: {title: true, profile: true, resolvedReportSnapshotEncrypted: true}},
      ...(full ? {trials: {orderBy: {trialIndex: 'asc' as const}, take: EXPORT_MAX_TRIALS + 1, select: {trialIndex: true, payloadEncrypted: true}},
        rawSubmissions: {select: {attemptEpoch: true, trialCount: true, payloadEncrypted: true, payloadSchemaVersion: true, encodingVersion: true}}} : {}),
    }}) : [],
    formWhere.OR.length ? prisma.compositeFormAnswer.findMany({where: formWhere}) : [],
  ]) : [[], [], []]
  const grouped = <T>(rows: T[], key: (row:T)=>string|null) => {
    const result = new Map<string,T[]>()
    for (const row of rows) {const id = key(row); if (!id) continue; const group = result.get(id) ?? []; group.push(row); result.set(id,group)}
    return result
  }
  const scalesByAttempt = grouped(scales,row=>row.compositeAttemptId), sessionsByAttempt = grouped(sessions,row=>row.compositeAttemptId), formsByAttempt = grouped(forms,row=>row.attemptId)
  for (const attempt of template.attempts) {
    attempt.scaleAssessments = scalesByAttempt.get(attempt.id) ?? []
    attempt.cognitiveSessions = sessionsByAttempt.get(attempt.id) ?? []
    attempt.formAnswers = formsByAttempt.get(attempt.id) ?? []
  }
  return {template, scopes, frozenSlotSets}
}

export function readTrainingVariantCognitiveTrials(session: any): Array<{trialIndex: number; payload: unknown}> | null {
  if (session.runtimeGeneration !== 'UNIFIED_V1') return null
  const raws = (session.rawSubmissions ?? []).filter((row: any) => row.attemptEpoch === session.attemptNo)
  if (raws.length !== 1) throw new Error('分卷认知测评原始提交缺失或重复')
  const raw = raws[0]
  if (raw.payloadSchemaVersion !== UNIFIED_COGNITIVE_RAW_PAYLOAD_SCHEMA_VERSION || raw.encodingVersion !== UNIFIED_COGNITIVE_RAW_ENCODING_VERSION) throw new Error('分卷认知测评原始提交编码不支持')
  const payload = parseUnifiedCognitiveRawSubmissionPayload(decryptUnifiedRuntimePayload(raw.payloadEncrypted))
  if (payload.attemptEpoch !== session.attemptNo || payload.trials.length !== raw.trialCount) throw new Error('分卷认知测评原始提交绑定不一致')
  return payload.trials.map(trial => ({trialIndex: trial.trialIndex, payload: trial.payload}))
}
