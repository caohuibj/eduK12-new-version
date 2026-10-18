import { Prisma, UserRole } from '@prisma/client'
import { parseCompiledWeightedVariants } from '../assessment-core/weighted-variants'
import { canonicalHash } from '../assessment-runtime/canonical'
import { isScaleReportFactsView } from '../assessment-runtime/compact-scale-facts'
import { loadStoredCanonicalUnitResults } from '../assessment-runtime/compact-assessment-storage'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { compositeItemSlotKey, formSectionSlotKey, type FrozenActiveSlotSetV1 } from '../assessment-runtime/slot-set'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { typedCompositeFormQuestion } from '../assessment-runtime/typed-form'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from '../assessment-runtime/unit-result'
import { preloadCompositeReportFacts } from '../composite/composite-report-read-batch'
import { loadTrainingVariantExportGraph } from '../composite/training-variant-export'
import { applyTrainingAttemptScope, resolveTrainingAttemptScope, buildTrainingVariantUnion, type TrainingAttemptScope } from '../composite/training-variant-scope'
import { loadSituationalExportSlotSets } from '../composite/situational-canonical-export'
import { CompositeServiceError, compositeBadRequest, compositeConflict, compositeNotFound } from '../composite/composite.errors'
import { readScaleResult, resolveProjectionPolicyForAssessment } from '../scale/scale-workflow.service'
import { createScaleProjectionContext } from '../scale/projection/context-factory'
import { resolveEffectiveScaleDisclosure } from '../scale/projection/context'
import { readFrozenReport } from '../cognitive/profile-freeze'
import type { TrainingAnalysisRequestV1, TrainingAnalysisSourceV1, TrainingAnalysisWaveV1, TrainingMetricIdentityV1, TrainingNumericObservationV1, TrainingObservationReason } from './types'

export const TRAINING_ANALYSIS_SOURCE_LIMIT = 6000
export type TrainingAnalysisActor = {userId: string; role: UserRole}
export interface TrainingAnalysisManifestAttemptV1 {
  waveKey: string; taskId: string; attemptId: string; attemptEpoch: number
  sourceHash: string; sourceHashes: Record<string, string>; status: string; taskSatisfaction: string | null
}
export interface TrainingAnalysisSourceManifestV1 {
  schemaVersion: 1; courseId: string; selectorHash: string
  attempts: TrainingAnalysisManifestAttemptV1[]
  dictionary: Array<{waveKey: string; taskId: string; itemId: string; metricKey: string; measurement: TrainingMetricIdentityV1 | null}>
  authoritySnapshot: unknown
  exclusions: {IDENTITY_UNAVAILABLE: number}
}
export interface TrainingResearchGovernance {
  attemptId:string;taskId:string;attemptEpoch:number;studyId:string;participantId:string|null;acceptanceId:string|null;
  acceptedVersionId:string|null;bodyHash:string|null;scopeHash:string|null;dataCategories:string[]|null;status:string|null;revision:number;
}
export interface LoadedTrainingAnalysisSources {
  researchGovernance: TrainingResearchGovernance[];
  source: TrainingAnalysisSourceV1; manifest: TrainingAnalysisSourceManifestV1
  authorityHash: string; sourceFingerprint: string; dictionary: TrainingAnalysisSourceManifestV1['dictionary']
}
function unavailable(): never {throw compositeNotFound('数据源不存在或当前不可用于此分析')}
function invalid(message: string): never {throw compositeConflict(message)}
const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null
const hash = (value: unknown) => canonicalHash(value)
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const productWhere = {in: ['QUESTIONNAIRE', 'LEGACY_COMPOSITE']}
const templateInclude = {
  items: {orderBy: {position: 'asc' as const}, include: {
    scale: {select: {id: true, code: true, name: true, instrumentClass: true, instrumentVersion: true, definition: true}},
    cognitiveAssignment: {select: {title: true, profile: true, resolvedReportSnapshotEncrypted: true,
      config: {select: {testType: true, engineVersion: true, scoringVersion: true}}}},
  }},
  formSections: {orderBy: {position: 'asc' as const}, include: {items: true}},
}

/** Permission identity deliberately excludes lastSeen, updatedAt and other
 * unrelated activity. C13 reporting grants are never consulted as raw access. */
async function authority(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, courseId: string) {
  if (![UserRole.TEACHER, UserRole.ADMIN].includes(actor.role as any)) unavailable()
  const principal = await tx.user.findFirst({where: {id: actor.userId, role: actor.role, isActive: true, isFrozen: false, mustChangePassword: false, accountDomain: {in: ['LEGACY', 'TRAINING']},
    ...(actor.role === UserRole.TEACHER ? {teacherApproved: true} : {}), OR: [{expiresAt: null}, {expiresAt: {gt: new Date()}}]}, select: {id: true, role: true, isActive: true, isFrozen: true, expiresAt: true, teacherApproved: true, accountDomain: true, mustChangePassword: true, tokenVersion: true}})
  if (!principal) unavailable()
  const course = await tx.course.findFirst({where: {id: courseId, courseType: 'TRAINING_COURSE', isLibrary: false,
    ...(actor.role === UserRole.ADMIN ? {} : {creatorId: actor.userId})}, select: {id: true, creatorId: true, courseType: true, isLibrary: true}})
  if (!course) unavailable()
  const assignments = actor.role === UserRole.TEACHER ? await tx.relationalAssessmentAssignment.findMany({where: {
    createdByUserId: actor.userId, perspective: 'OBSERVER_REPORT', analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'observer_assigning_teacher_v1',
  }, select: {id: true, createdByUserId: true, perspective: true, analysisMode: true, visibilityPolicyKey: true}, orderBy: {id: 'asc'}}) : []
  const visibility = actor.role === UserRole.TEACHER ? {OR: [{assignmentRef: null}, {assignmentRef: {in: assignments.map(row => row.id)}}]} : null
  return {principal: {...principal, expiresAt: iso(principal.expiresAt)}, course, assignments, visibility}
}
const authorizedTaskWhere = (actor: TrainingAnalysisActor, courseId: string) => ({
  productKind: productWhere, compositionTemplates: {none: {}}, ...(actor.role === UserRole.ADMIN ? {} : {createdBy: actor.userId}),
  // Historical delivery identity survives removal of a current course link.
  OR: [{courseId}, {questionnaireCourses: {some: {courseId}}}, {attempts: {some: {deliveryCourseId: courseId}}}],
})
const parentIdentity = (attempt: any) => ({id: attempt.id, taskId: attempt.compositeAssessmentId, epoch: attempt.attemptEpoch,
  courseId: attempt.deliveryCourseId, userId: attempt.userId ?? null, subjectUserId: attempt.subjectUserId ?? null,
  respondentUserId: attempt.respondentUserId ?? null, respondentType: attempt.respondentType ?? null,
  assignmentRef: attempt.assignmentRef ?? null, status: attempt.status, deliveryMode: attempt.deliveryMode,
  runtimeGeneration: attempt.runtimeGeneration ?? null, taskSatisfaction: attempt.taskSatisfaction ?? null,
  completedAt: iso(attempt.completedAt), aggregateInputHash: attempt.aggregateInputHash ?? null,
  contextHash: attempt.contextSnapshotHash ?? null, slotsHash: attempt.frozenActiveSlotSetHash ?? null,
  allocationHash: attempt.trainingVariantAllocationHash ?? null,...(attempt.trainingFlowSnapshotHash!=null?{flowSnapshotHash:attempt.trainingFlowSnapshotHash,flowPathHash:attempt.trainingFlowPathHash??null}: {})})
const stratumMatches = (wave: TrainingAnalysisWaveV1, scope: TrainingAttemptScope) => scope.variant
  ? wave.configDigest === scope.variant.configDigest && wave.variantKey === scope.variant.variantKey && wave.publication === scope.variant.publishedAt
  : wave.configDigest === null && wave.variantKey === null
const groupRows = (rows: any[], key: (row: any) => string) => {
  const result = new Map<string, any[]>()
  for (const row of rows) {const id = key(row), list = result.get(id) ?? []; list.push(row); result.set(id, list)}
  return result
}

/** Only database-backed user or study-local linkage may establish a pair. */
async function participantIdentities(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, attempts: any[]) {
  const ids = new Map<string, {participantKey: string; participantKind: 'USER' | 'STUDY_LOCAL'}>()
  for (const attempt of attempts) if (attempt.userId) {
    // Relational observations concern the explicitly bound subject; a teacher
    // responding for several subjects must not collapse into one participant.
    const userId = attempt.assignmentRef ? attempt.subjectUserId : attempt.userId
    if (userId) ids.set(attempt.id, {participantKey: `user:${userId}`, participantKind: 'USER'})
  }
  const anonymous = attempts.filter(attempt => !attempt.userId && !attempt.assignmentRef)
  if (!anonymous.length) return {ids,researchGovernance:[] as TrainingResearchGovernance[]}
  const anonymousIds = new Set(anonymous.map(row => row.id))
  const links = await tx.$queryRaw<TrainingResearchGovernance[]>`
    SELECT a.id AS "attemptId",a.composite_assessment_id AS "taskId",a.attempt_epoch AS "attemptEpoch",s.id AS "studyId",p.id AS "participantId",
      r.acceptance_id AS "acceptanceId",ac.version_id AS "acceptedVersionId",ac.body_hash AS "bodyHash",cv.scope_hash AS "scopeHash",cv.scope->'dataCategories' AS "dataCategories",r.status,COALESCE(r.revision,0) AS revision
    FROM composite_assessment_attempts a
    JOIN anonymous_study_waves w ON w.access_token_id=a.access_token_id
    JOIN anonymous_studies s ON s.id=w.study_id
    JOIN composite_assessment_access_tokens t ON t.id=w.access_token_id AND t.composite_assessment_id=a.composite_assessment_id
    JOIN composite_assessments c ON c.id=a.composite_assessment_id
    LEFT JOIN anonymous_study_attempts sa ON sa.attempt_id=a.id AND sa.study_id=s.id AND sa.wave_id=w.id
    LEFT JOIN anonymous_study_participants p ON p.id=sa.participant_id AND p.study_id=s.id
    LEFT JOIN anonymous_study_research_states r ON r.participant_id=p.id AND r.study_id=s.id
    LEFT JOIN anonymous_study_consent_acceptances ac ON ac.id=r.acceptance_id AND ac.participant_id=p.id AND ac.study_id=s.id
    LEFT JOIN anonymous_study_consent_versions cv ON cv.id=ac.version_id AND cv.study_id=s.id
    WHERE a.id IN (${Prisma.join(anonymous.map(row => row.id))}) AND a.user_id IS NULL AND a.assignment_ref IS NULL
      AND c.created_by=s.owner_user_id AND t.created_by=s.owner_user_id
      AND (${actor.role === UserRole.ADMIN} OR s.owner_user_id=${actor.userId})`
  for (const link of links) {
    if (!anonymousIds.has(link.attemptId) || ids.has(link.attemptId)) invalid('研究内身份绑定不一致')
    if(link.participantId) ids.set(link.attemptId, {participantKey: `study:${link.studyId}:${link.participantId}`, participantKind: 'STUDY_LOCAL'})
  }
  return {ids,researchGovernance:links.sort((a,b)=>a.attemptId.localeCompare(b.attemptId))}
}

function acceptedEnvelope(attempt: any, item: any, snapshots: any[], slots: FrozenActiveSlotSetV1, canonicalByCipher?: ReadonlyMap<string, CanonicalUnitResultEnvelopeV1>): CanonicalUnitResultEnvelopeV1 | null {
  const key = compositeItemSlotKey(item.id, item.type), slot = slots.slots.find(row => row.slotKey === key)
  const matches = snapshots.filter(row => row.slotKey === key)
  if (!slot) {if (item.required !== false || matches.length) invalid('必需测量缺少冻结单元或事实未被分配'); return null}
  if (item.required !== false && !slot.required) invalid('必需测量冻结策略不一致')
  if (!matches.length) {if (slot.required) invalid('必需测量缺少已接受事实'); return null}
  if (matches.length !== 1) invalid('重复的已接受测量事实')
  const row = matches[0]
  if (row.compositeAttemptId !== attempt.id || row.attemptEpoch !== attempt.attemptEpoch || row.unitType !== item.type) invalid('测量事实父记录或版本不一致')
  if (['SKIPPED', 'NOT_APPLICABLE'].includes(row.terminalState)) {
    if (slot.required || row.payloadKind !== 'NONE' || row.canonicalResultEncrypted || row.collectionFactsEncrypted) invalid('必需测量或跳过状态事实不一致')
    return null
  }
  if (row.terminalState !== 'COMPLETED' || row.payloadKind !== 'UNIT_RESULT' || !row.sourceSubmissionId || !row.canonicalResultEncrypted || row.collectionFactsEncrypted) invalid('已接受测量事实不完整')
  const result = canonicalByCipher ? canonicalByCipher.get(row.canonicalResultEncrypted) : parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload(row.canonicalResultEncrypted))
  if (!result) invalid('已接受测量事实缺少规范结果')
  const core = result.core
  const expectedSourceType = item.type === 'SCALE' ? 'ASSESSMENT' : item.type === 'COGNITIVE' ? 'COGNITIVE_SESSION' : 'SITUATIONAL_ATTEMPT'
  if (new Set(core.metrics.map(metric => metric.key)).size !== core.metrics.length || row.sourceType !== expectedSourceType
    || core.scientificProvenance.instrumentKey !== core.instrumentKey || core.scientificProvenance.instrumentVersion !== core.instrumentVersion) invalid('测量事实指标或科学来源身份不一致')
  if (core.unitType !== item.type || core.instrumentKey !== slot.sourceDefinitionIdentity.key || core.instrumentVersion !== slot.sourceDefinitionIdentity.version
    || core.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash || core.sourceDefinitionHash !== row.sourceDefinitionHash
    || core.compiledRuntimeHash !== row.compiledRuntimeHash || core.contextHash !== (attempt.contextSnapshotHash ?? null)
    || result.persistenceProvenance.sourceType !== row.sourceType || result.persistenceProvenance.sourceAttemptId !== row.sourceAttemptId
    || result.persistenceProvenance.sourceSubmissionId !== row.sourceSubmissionId || result.completedAt !== iso(row.completedAt)
    || (slot.sourceBinding.compiledRuntimeHash && core.compiledRuntimeHash !== slot.sourceBinding.compiledRuntimeHash)
    || (slot.runtimeIdentity && (core.compiledRuntimeHash !== slot.runtimeIdentity.compiledRuntimeHash || core.scorerKey !== slot.runtimeIdentity.scorerKey || core.scorerVersion !== slot.runtimeIdentity.scoringVersion))) invalid('已接受测量事实与冻结来源不一致')
  return result
}
function formMetric(item: any, metricKey: string) {
  if (!item.formDefinition) unavailable() // A mutable legacy title is never a scientific identity.
  const question = typedCompositeFormQuestion(mapCompositeSection({id: item.formSectionId, title: '', position: 0, items: [item]}).items[0])
  const allowed = ['NUMBER', 'SLIDER']
  if (!allowed.includes(question.type) || metricKey !== question.itemKey) unavailable()
  return question
}
function cognitivePermission(item: any, key: string, actor: TrainingAnalysisActor) {
  const report = readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)
  const metric: any = report?.metricDefinitions?.[key]
  if (!report || !metric || !['number', 'integer'].includes(metric.valueType)) unavailable()
  if (metric.role === 'research_only'
    || (report.profile === 'research' && !metric.availableProfiles?.includes('standard'))
    || (metric.availableProfiles && !metric.availableProfiles.includes('standard'))
    || key === 'productIndex' || key === 'product_index') unavailable()
  return {report, metric}
}

/** Caller owns a RepeatableRead/Serializable transaction. Every reader below,
 * including shared plans/templates/facts, uses that exact client. No current
 * CourseStudent join is used: departed students keep their historical records. */
export async function loadTrainingAnalysisSources(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, selector: TrainingAnalysisRequestV1,
  options: {fixedManifest?: {attempts: TrainingAnalysisManifestAttemptV1[];researchSources?:Array<{taskId:string;attemptId:string;attemptEpoch:number}>}; sourceCutoff?: string} = {}): Promise<LoadedTrainingAnalysisSources> {
  const cutoff = options.sourceCutoff ? new Date(options.sourceCutoff) : null
  if (cutoff && !Number.isFinite(cutoff.getTime())) throw compositeBadRequest('来源截止时间无效')
  const auth = await authority(tx, actor, selector.courseId)
  if (!selector.waves.length || selector.waves.length > 8) throw compositeBadRequest('请选择 1–8 个明确波次')
  const tasks = await tx.compositeAssessment.findMany({where: {...authorizedTaskWhere(actor, selector.courseId), id: {in: [...new Set(selector.waves.map(wave => wave.taskId))]}}, include: templateInclude})
  if (tasks.length !== new Set(selector.waves.map(wave => wave.taskId)).size) unavailable()
  const byTask = new Map(tasks.map(task => [task.id, task])), entries: Array<{wave: TrainingAnalysisWaveV1; attempt: any; scope: TrainingAttemptScope; slots: FrozenActiveSlotSetV1 | null}> = []
  const fixed = options.fixedManifest?.attempts
  if (fixed && (fixed.length > TRAINING_ANALYSIS_SOURCE_LIMIT || fixed.some(row => !selector.waves.some(wave => wave.waveKey === row.waveKey && wave.taskId === row.taskId)))) invalid('分析清单与选择范围不一致')
  const taskAuthority: unknown[] = [], policies: unknown[] = []
  for (const wave of selector.waves) {
    const task: any = byTask.get(wave.taskId)
    if (iso(task.publishedAt) !== wave.publication || !wave.metrics.length || wave.metrics.length > 32) unavailable()
    if ((task.trainingVariantDigest ?? null) !== wave.configDigest || Boolean(wave.configDigest) !== Boolean(wave.variantKey)) unavailable()
    if (wave.metrics.some(metric => !task.items.some((item: any) => item.id === metric.itemId))) unavailable()
    taskAuthority.push({id: task.id, createdBy: task.createdBy, productKind: task.productKind})
    const filters: Prisma.CompositeAssessmentAttemptWhereInput[] = [
      ...(auth.visibility ? [auth.visibility] : []),
      ...(fixed ? [{OR: [...fixed.filter(row => row.waveKey === wave.waveKey),...(options.fixedManifest?.researchSources??[]).filter(row=>row.taskId===wave.taskId)].map(row => ({id: row.attemptId, attemptEpoch: row.attemptEpoch}))}] : []),
      ...(cutoff ? [{startedAt: {lte: cutoff}}, {OR: [{completedAt: null}, {completedAt: {lte: cutoff}}]}] : []),
    ]
    const where = {compositeAssessmentId: task.id, deliveryCourseId: selector.courseId, ...(filters.length ? {AND: filters} : {})}
    // The variant graph is requested in headers-only mode: selected strata are
    // resolved BEFORE any child result, raw answer or Form facts can be read.
    const graph = await loadTrainingVariantExportGraph(task.id, where, {previewLimit: TRAINING_ANALYSIS_SOURCE_LIMIT + 1}, true, tx)
    const attempts: any[] = graph?.template.attempts ?? await tx.compositeAssessmentAttempt.findMany({where, orderBy: {id: 'asc'}, take: TRAINING_ANALYSIS_SOURCE_LIMIT + 1})
    if (attempts.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('分析来源超过 6000 条，请缩小选择范围')
    const eligibleForSlots = attempts.filter(row => row.runtimeGeneration === 'UNIFIED_V1' && row.frozenActiveSlotSetEncrypted && row.frozenActiveSlotSetHash)
    const slotSets = graph?.frozenSlotSets ?? await loadSituationalExportSlotSets(eligibleForSlots, tx)
    for (const row of attempts) {
      if (row.compositeAssessmentId !== task.id || row.deliveryCourseId !== selector.courseId) invalid('课程来源绑定不一致')
      const attempt = {...row, compositeAssessment: task, scaleAssessments: [], cognitiveSessions: [], formAnswers: []}
      const scope = graph?.scopes.get(row.id) ?? await resolveTrainingAttemptScope(attempt, task, {db: tx, frozenSlotSets: slotSets})
      if (!stratumMatches(wave, scope)) continue
      if (row.status === 'COMPLETED' && row.deliveryMode === 'FINAL_ONLY' && row.runtimeGeneration === 'UNIFIED_V1' && !slotSets.has(row.id)) invalid('已完成 FINAL 测量缺少冻结单元计划')
      entries.push({wave, attempt: await applyTrainingAttemptScope(attempt, {db: tx, frozenSlotSets: slotSets,verifiedScope:scope}), scope, slots: slotSets.get(row.id) ?? null})
    }
  }
  if (entries.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('分析来源超过 6000 条，请缩小选择范围')
  // Governance-based reporting is a separate permission surface. Its grants
  // cannot unlock the original instruments through a Training analysis.
  if (entries.length) {
    const governed = await tx.$queryRaw<Array<{id: string}>>`SELECT a.id FROM composite_assessment_attempts a JOIN assessment_run_executions e
      ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=a.id JOIN assessment_run_tracks t
      ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
      WHERE a.id IN (${Prisma.join([...new Set(entries.map(entry => entry.attempt.id))])}) AND t.frozen_resource_policy ? 'resultDisclosure' LIMIT 1`
    if (governed.length) unavailable()
  }
  if (entries.reduce((count, entry) => count + entry.wave.metrics.length, 0) > 50000) throw compositeBadRequest('数值观测超过 50000 条，请缩小指标范围')
  const {ids:identities,researchGovernance} = await participantIdentities(tx, actor, entries.map(entry => entry.attempt))
  const selected = entries.filter(entry => identities.has(entry.attempt.id))
  const final = selected.filter(entry => entry.attempt.status === 'COMPLETED' && entry.attempt.deliveryMode === 'FINAL_ONLY' && entry.attempt.runtimeGeneration === 'UNIFIED_V1' && entry.slots)
  const finalSet = new Set(final.map(entry => entry.attempt))
  const childConditions = final.map(({attempt, wave, scope}) => ({compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch,
    compositeItemId: {in: wave.metrics.filter(metric => scope.itemIds.has(metric.itemId) && scope.items.some(item => item.id === metric.itemId && item.type === 'SCALE')).map(metric => metric.itemId)}})).filter(row => row.compositeItemId.in.length)
  const snapshotConditions = final.map(({attempt, wave, scope}) => ({compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch, slotKey: {in: [...new Set(wave.metrics.flatMap(metric => {
    const item = scope.items.find(candidate => candidate.id === metric.itemId)
    return !item ? [] : [item.type === 'FORM' ? formSectionSlotKey(item.formSectionId) : compositeItemSlotKey(item.id, item.type)]
  }))]}})).filter(row => row.slotKey.in.length)
  // Prisma's PostgreSQL connector has a lower safe bind budget than the
  // wire-protocol maximum. Reject before either child query, never partially
  // fetch a selected sample. Each OR branch binds parent, epoch and selected IDs.
  if (childConditions.reduce((sum, row) => sum + 2 + row.compositeItemId.in.length, 0) > 30000
    || snapshotConditions.reduce((sum, row) => sum + 2 + row.slotKey.in.length, 0) > 30000) throw new CompositeServiceError('选中的来源查询超过参数上限，请减少指标或波次', 413)
  const [children, snapshots] = await Promise.all([
    childConditions.length ? tx.assessment.findMany({where: {OR: childConditions}, select: {id: true, compositeAttemptId: true, compositeItemId: true,
      scaleId: true, status: true, deliveryMode: true, runtimeGeneration: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true,
      result: true, runtimeSnapshotEncrypted: true, compiledRuntimeHash: true, respondentType: true}}) : [],
    snapshotConditions.length ? tx.assessmentUnitSnapshot.findMany({where: {OR: snapshotConditions}}) : [],
  ])
  // Each immutable Scale fact binds two SQL parameters (id, epoch). Keep
  // the batch below PostgreSQL's parameter ceiling, before any fact read.
  if (children.length > 15000) throw new CompositeServiceError('选中的量表来源超过 15000 条，请减少指标或波次', 413)
  // Validate reference boundaries before the canonical loader can read any
  // referenced fact. Inline envelopes keep the shared runtime parser; this is
  // only authorization of the two existing reference storage representations.
  const allowedSnapshotSlots = new Map<string, Set<string>>()
  for (const condition of snapshotConditions) {
    const key = `${condition.compositeAttemptId}:${condition.attemptEpoch}`, keys = allowedSnapshotSlots.get(key) ?? new Set<string>()
    condition.slotKey.in.forEach(slotKey => keys.add(slotKey)); allowedSnapshotSlots.set(key, keys)
  }
  const selectedChildren = new Map(children.map(child => [`${child.compositeAttemptId}:${child.attemptEpoch}:${child.id}`, child]))
  const canonicalCiphers: string[] = []
  for (const row of snapshots) {
    if (!allowedSnapshotSlots.get(`${row.compositeAttemptId}:${row.attemptEpoch}`)?.has(row.slotKey)) invalid('测量快照不在选中来源范围')
    if (row.terminalState !== 'COMPLETED' || row.payloadKind !== 'UNIT_RESULT' || !row.canonicalResultEncrypted) continue
    const stored = decryptUnifiedRuntimePayload<any>(row.canonicalResultEncrypted)
    if (stored?.k === 'SCF2' || stored?.kind === 'SCALE_FACTS_CANONICAL_REF') {
      const referenceId = stored.k === 'SCF2' ? stored.a : stored.binding?.assessmentId
      const referenceEpoch = stored.k === 'SCF2' ? stored.e : stored.binding?.attemptEpoch
      const child = selectedChildren.get(`${row.compositeAttemptId}:${row.attemptEpoch}:${row.sourceAttemptId}`)
      if (row.unitType !== 'SCALE' || row.sourceType !== 'ASSESSMENT' || !child || referenceId !== child.id || referenceEpoch !== child.attemptEpoch
        || referenceEpoch !== row.attemptEpoch || !child.compositeItemId || row.slotKey !== compositeItemSlotKey(child.compositeItemId, 'SCALE')
        || row.sourceSubmissionId !== child.submissionId
        || (stored.kind === 'SCALE_FACTS_CANONICAL_REF' && (stored.version !== 1 || stored.binding?.submissionId !== child.submissionId || stored.binding?.payloadHash !== child.submissionPayloadHash))) invalid('规范结果引用不属于选中测量来源')
    }
    canonicalCiphers.push(row.canonicalResultEncrypted)
  }
  const childrenByParent = groupRows(children, row => row.compositeAttemptId), snapshotsByParent = groupRows(snapshots, row => row.compositeAttemptId)
  for (const entry of final) entry.attempt.scaleAssessments = childrenByParent.get(entry.attempt.id) ?? []
  // Existing batch parser performs immutable source-result hash, epoch and
  // frozen policy validation. It does not load answers or item-level raw data.
  const selectedItemIds = new Map<string, Set<string>>()
  for (const {wave, attempt} of final) {const ids = selectedItemIds.get(attempt.id) ?? new Set<string>(); wave.metrics.forEach(metric => ids.add(metric.itemId)); selectedItemIds.set(attempt.id, ids)}
  const factsFor = await preloadCompositeReportFacts(final.map(entry => entry.attempt), tx, {selectedItemIds, numericOnly: true})
  // Existing canonical validation may internally expand scored item facts, but
  // never reads raw answers. Reference storage adds one bounded fact batch;
  // neither scored items nor raw fields enter analysis/export output.
  const uniqueCiphers = [...new Set(canonicalCiphers)]
  const canonicalViews = await loadStoredCanonicalUnitResults(uniqueCiphers, tx)
  const canonicalByCipher = new Map(uniqueCiphers.map((cipher, index) => [cipher, canonicalViews[index]]))
  const observations: TrainingNumericObservationV1[] = [], manifests: TrainingAnalysisManifestAttemptV1[] = [], formSourceHashes = new WeakMap<object, string>()
  for (const {wave, attempt, scope, slots} of selected) {
    const participant = identities.get(attempt.id)!, attemptObservations: TrainingNumericObservationV1[] = []
    const sourceHashes: Record<string, string> = {participant: hash(participant), parent: hash(parentIdentity(attempt)), publication: hash({taskId: wave.taskId, publication: wave.publication, configDigest: wave.configDigest, variantKey: wave.variantKey})}
    const isFinal = finalSet.has(attempt), facts = isFinal ? factsFor(attempt) : null
    for (const metric of wave.metrics) {
      const item = scope.items.find(candidate => candidate.id === metric.itemId)
      let value: number | null = null, measurement: TrainingMetricIdentityV1 | null = null, reason: TrainingObservationReason | null = null
      if (!item) reason = 'NOT_ASSIGNED'
      else if (!isFinal) reason = 'NON_FINAL'
      else if (item.type === 'FORM') {
        const question = formMetric(item, metric.metricKey), raw = facts!.typedFormValues.get(item.id), state = facts!.typedFormStates.get(item.id)?.state
        const section = scope.formSections.find(candidate => candidate.id === item.formSectionId), slot = slots!.slots.find(candidate => candidate.slotKey === formSectionSlotKey(item.formSectionId))
        if (!section || !slot || slot.sourceDefinitionIdentity.hash !== hash(mapCompositeSection(section))) invalid('表单冻结定义不一致')
        measurement = {instrumentKey: `FORM:${question.itemKey}`, scoreKey: question.itemKey, scoringDigest: hash(item.formDefinition), responseSignature: hash({type: question.type, definition: item.formDefinition}),
          respondentType: attempt.respondentType ?? 'SELF', unit: null, version: 'training-typed-form-v1'}
        value = numeric(raw) ? raw : null
        reason = state === 'NOT_SHOWN' ? 'NOT_ASSIGNED' : raw == null || state === 'REFUSED' || state === 'SHOWN_MISSING' ? 'UNANSWERED' : !numeric(raw) ? 'INVALID_VALUE' : null
        const formRows = (snapshotsByParent.get(attempt.id) ?? []).filter(row => row.slotKey === slot.slotKey && row.attemptEpoch === attempt.attemptEpoch)
        const formRow = formRows[0]
        if (formRows.length !== 1 || !formRow.sourceAttemptId || !formRow.sourceSubmissionId || formRow.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash
          || formRow.sourceType !== 'COMPOSITE_FORM_SECTION' || !formRow.completedAt) invalid('表单已接受来源身份不完整')
        let formHash = formSourceHashes.get(formRow)
        if (!formHash) {formHash = hash({sourceAttemptId: formRow.sourceAttemptId, sourceSubmissionId: formRow.sourceSubmissionId,
          completedAt: iso(formRow.completedAt), definitionHash: formRow.sourceDefinitionHash, facts: decryptUnifiedRuntimePayload(formRow.collectionFactsEncrypted)}); formSourceHashes.set(formRow, formHash)}
        sourceHashes[item.id] = formHash
        policies.push({taskId: taskIdOf(attempt), itemId: item.id, formReadable: true})
      } else {
        const envelope = acceptedEnvelope(attempt, item, snapshotsByParent.get(attempt.id) ?? [], slots!, canonicalByCipher)
        if (!envelope) {
          const terminal = (snapshotsByParent.get(attempt.id) ?? []).find(row => row.slotKey === compositeItemSlotKey(item.id, item.type))
          reason = terminal ? 'NOT_ASSIGNED' : 'MISSING_SOURCE'
          // An accepted optional skip is still frozen evidence, not an absent
          // source. Bind its terminal state so replay cannot silently change it.
          if (terminal) sourceHashes[item.id] = hash({slotKey: terminal.slotKey, terminalState: terminal.terminalState, payloadKind: terminal.payloadKind,
            sourceType: terminal.sourceType ?? null, sourceAttemptId: terminal.sourceAttemptId ?? null, sourceSubmissionId: terminal.sourceSubmissionId ?? null,
            definitionHash: terminal.sourceDefinitionHash ?? null, completedAt: iso(terminal.completedAt)})
        } else {
          const core = envelope.core, storedMetric = core.metrics.find(candidate => candidate.key === metric.metricKey)
          if (!storedMetric) unavailable()
          let responseSignature = core.scientificProvenance.protocolSignature ?? core.compiledRuntimeHash
          if (item.type === 'SCALE') {
            const matches = attempt.scaleAssessments.filter((row: any) => row.compositeItemId === item.id), child = matches[0]
            if (matches.length !== 1 || child.compositeAttemptId !== attempt.id || child.attemptEpoch !== attempt.attemptEpoch
              || child.status !== 'COMPLETED' || child.deliveryMode !== 'FINAL_ONLY' || child.runtimeGeneration !== 'UNIFIED_V1'
              || child.id !== envelope.persistenceProvenance.sourceAttemptId || child.submissionId !== envelope.persistenceProvenance.sourceSubmissionId) invalid('量表已接受事实来源不一致')
            const runtime = facts!.scaleRuntimes.get(child), result = readScaleResult(facts!.scaleResults.get(child)).result
            if (!runtime || !result || runtime.compiledRuntime.compiledRuntimeHash !== child.compiledRuntimeHash
              || runtime.compiledRuntime.compiledRuntimeHash !== core.compiledRuntimeHash || runtime.instrumentKey !== core.instrumentKey
              || runtime.instrumentVersion !== core.instrumentVersion || runtime.sourceDefinitionHash !== core.sourceDefinitionHash || result.instrument.code !== runtime.instrumentKey
              || result.instrument.instrumentVersion !== runtime.instrumentVersion || result.method.definitionHash !== runtime.legacyDefinitionHash
              || result.method.scoringVersion !== core.scorerVersion || result.instrument.scaleId !== child.scaleId || child.scaleId !== item.scaleId || item.scale?.id !== child.scaleId) invalid('量表冻结运行时或评分版本不一致')
            // V1 compatibility needs the explicitly authoritative Scale class.
            // Preserve frozen scientific identity; do not infer a custom class
            // from an unregistered instrument or replace a V2 frozen policy.
            const policy = resolveProjectionPolicyForAssessment({...child, scale: {
              code: runtime.instrumentKey, instrumentVersion: runtime.instrumentVersion, instrumentClass: item.scale.instrumentClass,
            }}, result, runtime)
            const capability = resolveEffectiveScaleDisclosure(createScaleProjectionContext({instrumentKey: runtime.instrumentKey, instrumentVersion: runtime.instrumentVersion,
              audience: 'teacher', purpose: 'export', principalId: actor.userId, frozenPolicy: policy.policy}))
            if (policy.snapshotError || !capability.numericScores) unavailable()
            // RawAnswers and itemScores remain independent; neither is needed or
            // inferred from numericScores, and neither is returned by this API.
            policies.push({taskId: wave.taskId, itemId: item.id, policy: policy.policy, capability})
            const score = result.scores.find(candidate => candidate.key === metric.metricKey)
            if (!score || score.value !== storedMetric.value || (runtime.compiledRuntime.metricDefinitions[metric.metricKey]?.unit ?? null) !== (storedMetric.unit ?? null)
              || hash({status: result.quality.status, flags: [...result.quality.flags].sort()}) !== hash(core.quality)) invalid('量表分数与已接受事实不一致')
            responseSignature = hash({items: runtime.definition.items.map(row => ({itemCode: row.itemCode, responseSetKey: row.responseSetKey})), responseSets: runtime.definition.responseSets})
            // A numeric compact view intentionally omits original item/raw data
            // and carries a non-JSON marker. Its digest must come from the bound
            // immutable fact, never from hashing or stripping the report view.
            const immutableResultHash = facts!.scaleSourceResultHashes.get(child)
            if (isScaleReportFactsView(result) && !immutableResultHash) invalid('量表原始结果摘要缺失')
            const sourceResultHash = immutableResultHash ?? hash(result) // Validated, original noncompact result only.
            if (envelope.bundleBridge && envelope.bundleBridge.sourceResultHash !== sourceResultHash) invalid('量表原始结果摘要与已接受事实不一致')
            sourceHashes[`scale:${item.id}`] = hash({id: child.id, epoch: child.attemptEpoch, submissionId: child.submissionId, payloadHash: child.submissionPayloadHash, runtime: runtime.snapshotHash, result: sourceResultHash})
          } else if (item.type === 'COGNITIVE') {
            const {report, metric: definition} = cognitivePermission(item, metric.metricKey, actor)
            if ((definition.unit ?? null) !== (storedMetric.unit ?? null)) invalid('认知指标单位不一致')
            policies.push({taskId: wave.taskId, itemId: item.id, metricKey: metric.metricKey, profile: report.profile, role: definition.role ?? null, availableProfiles: definition.availableProfiles ?? null})
          } else if (item.type === 'SITUATIONAL') {
            if (item.situationalInstrumentKey !== core.instrumentKey || item.situationalInstrumentVersion !== core.instrumentVersion) invalid('情境测量工具身份不一致')
          } else unavailable()
          measurement = {instrumentKey: core.instrumentKey, scoreKey: metric.metricKey,
            scoringDigest: hash({scorer: core.scorerKey, version: core.scorerVersion, definition: core.sourceDefinitionHash, runtime: core.compiledRuntimeHash}),
            responseSignature, respondentType: attempt.respondentType ?? 'SELF', unit: storedMetric.unit ?? null, version: core.instrumentVersion}
          value = numeric(storedMetric.value) ? storedMetric.value : null
          reason = storedMetric.quality === 'not_calculable' ? 'NOT_CALCULABLE' : core.quality.status === 'invalid' ? 'INVALID_VALUE' : storedMetric.value === null ? 'UNANSWERED' : !numeric(storedMetric.value) ? 'INVALID_VALUE' : null
          sourceHashes[item.id] = envelope.resultHash
        }
      }
      attemptObservations.push({...participant,...(participant.participantKind==='STUDY_LOCAL'?{researchCategory:item?.type==='SITUATIONAL'?'SJT':item?.type}:{}), waveKey: wave.waveKey, taskId: wave.taskId, publication: wave.publication, configDigest: wave.configDigest, variantKey: wave.variantKey,
        attemptId: attempt.id, attemptEpoch: attempt.attemptEpoch, sourceHashes, metricKey: metric.metricKey, itemId: metric.itemId, measurement, value, reason,
        originalFinalStatus: attempt.status, taskSatisfied: attempt.taskSatisfaction === 'SATISFIED' ? true : attempt.taskSatisfaction === 'NOT_SATISFIED' ? false : null})
    }
    const sourceHash = hash({sourceHashes, observations: attemptObservations.map(({metricKey, itemId, measurement, value, reason}) => ({metricKey, itemId, measurement, value, reason}))})
    sourceHashes.sourceHash = sourceHash
    manifests.push({waveKey: wave.waveKey, taskId: wave.taskId, attemptId: attempt.id, attemptEpoch: attempt.attemptEpoch, sourceHash, sourceHashes,
      status: attempt.status, taskSatisfaction: attempt.taskSatisfaction ?? null})
    observations.push(...attemptObservations)
  }
  manifests.sort((a, b) => a.waveKey.localeCompare(b.waveKey) || a.attemptId.localeCompare(b.attemptId))
  const dictionary = [...new Map(observations.map(row => {
    const value = {waveKey: row.waveKey, taskId: row.taskId, itemId: row.itemId, metricKey: row.metricKey, measurement: row.measurement}
    return [hash(value), value] as const
  })).values()].sort((a, b) => hash(a).localeCompare(hash(b)))
  const authoritySnapshot = {principal: auth.principal, course: auth.course,
    assignments: auth.assignments.filter(assignment => selected.some(entry => entry.attempt.assignmentRef === assignment.id)),
    tasks: [...new Map(taskAuthority.map(value => [hash(value), value])).values()].sort((a, b) => hash(a).localeCompare(hash(b))),
    policies: [...new Map(policies.map(value => [hash(value), value])).values()].sort((a, b) => hash(a).localeCompare(hash(b)))}
  const manifest: TrainingAnalysisSourceManifestV1 = {schemaVersion: 1, courseId: selector.courseId, selectorHash: hash(selector), attempts: manifests, dictionary, authoritySnapshot,
    exclusions: {IDENTITY_UNAVAILABLE: entries.length - selected.length}}
  // If a frozen parent disappeared, moved, changed epoch or lost authority,
  // rereading can only shrink its sample and must change this fingerprint.
  return {researchGovernance,source: {schemaVersion: 1, courseId: selector.courseId, observations}, manifest, dictionary,
    authorityHash: hash(authoritySnapshot), sourceFingerprint: hash({selector: manifest.selectorHash, attempts: manifests, dictionary})}
}
const taskIdOf = (attempt: any) => attempt.compositeAssessmentId

/** Bounded, owner-authorized discovery. Actual runs revalidate every frozen
 * source and disclosure; current definitions here are selector labels only. */
export async function listTrainingAnalysisSources(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, courseId: string) {
  const auth = await authority(tx, actor, courseId)
  const tasks: any[] = await tx.compositeAssessment.findMany({where: {...authorizedTaskWhere(actor, courseId), publishedAt: {not: null}}, include: templateInclude,
    orderBy: [{publishedAt: 'desc'}, {id: 'asc'}], take: 101})
  const list: Array<{taskId: string; taskName: string; publication: string; configDigest: string | null; variantKey: string | null; metrics: Array<{itemId: string; metricKey: string; label: string}>}> = []
  // Discover SJT metric keys from accepted frozen facts, never from a mutable
  // authoring registry or a grant that only permits derived C13 reporting.
  const governed = tasks.length ? await tx.$queryRaw<Array<{id: string}>>`SELECT DISTINCT a.composite_assessment_id AS id FROM composite_assessment_attempts a
    JOIN assessment_run_executions e ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=a.id
    JOIN assessment_run_tracks t ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
    WHERE a.composite_assessment_id IN (${Prisma.join(tasks.map(task => task.id))}) AND t.frozen_resource_policy ? 'resultDisclosure'` : []
  const blocked = new Set(governed.map(row => row.id)), available = tasks.slice(0, 100).filter(task => !blocked.has(task.id))
  const sjtTasks = available.filter(task => task.items.some((item: any) => item.type === 'SITUATIONAL'))
  const sjtRows: any[] = sjtTasks.length ? await tx.assessmentUnitSnapshot.findMany({where: {unitType: 'SITUATIONAL', compositeAttempt: {is: {
    compositeAssessmentId: {in: sjtTasks.map(task => task.id)}, deliveryCourseId: courseId, status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1',
    ...(auth.visibility ? {AND: [auth.visibility]} : {}),
  }}}, include: {compositeAttempt: true}, orderBy: {id: 'asc'}, take: TRAINING_ANALYSIS_SOURCE_LIMIT + 1}) : []
  if (sjtRows.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('情境测量来源超过 6000 条，请缩小课程范围')
  const sjtParents = [...new Map(sjtRows.map(row => [row.compositeAttempt.id, row.compositeAttempt])).values()]
  const sjtSlots = await loadSituationalExportSlotSets(sjtParents, tx), sjtMetrics = new Map<string, Array<{itemId: string; metricKey: string; label: string}>>()
  for (const row of sjtRows) {
    const parent = row.compositeAttempt, task = sjtTasks.find(task => task.id === parent.compositeAssessmentId)
    if (!task || parent.deliveryCourseId !== courseId) invalid('情境指标发现来源不一致')
    if (row.attemptEpoch !== parent.attemptEpoch) continue
    const scope = await resolveTrainingAttemptScope(parent, task, {db: tx, frozenSlotSets: sjtSlots})
    const item = scope.items.find(item => item.type === 'SITUATIONAL' && compositeItemSlotKey(item.id, item.type) === row.slotKey)
    if (!item) invalid('情境指标不在已分配范围')
    const envelope = acceptedEnvelope(parent, item, [row], sjtSlots.get(parent.id)!)
    const existing = sjtMetrics.get(task.id) ?? []
    for (const metric of envelope?.core.metrics ?? []) if ((metric.value === null || numeric(metric.value)) && !existing.some(value => value.itemId === item.id && value.metricKey === metric.key)) existing.push({itemId: item.id, metricKey: metric.key, label: metric.key})
    sjtMetrics.set(task.id, existing)
  }
  for (const task of available) {
    const metrics: Array<{itemId: string; metricKey: string; label: string}> = [...(sjtMetrics.get(task.id) ?? [])]
    for (const item of task.items) {
      if (item.type === 'SCALE') {
        const disclosure = resolveEffectiveScaleDisclosure(createScaleProjectionContext({instrumentKey: item.scale?.code, instrumentVersion: item.scale?.instrumentVersion,
          instrumentClass: item.scale?.instrumentClass, audience: 'teacher', purpose: 'export'}))
        if (disclosure.numericScores) for (const score of item.scale?.definition?.scores ?? []) metrics.push({itemId: item.id, metricKey: score.key, label: score.label ?? score.key})
      } else if (item.type === 'FORM' && item.formDefinition && ['NUMBER', 'SLIDER'].includes(item.formDefinition.type)) {
        const question = formMetric(item, item.formDefinition.itemKey); metrics.push({itemId: item.id, metricKey: question.itemKey, label: question.prompt})
      } else if (item.type === 'COGNITIVE') {
        const frozen = readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)
        for (const [key, metric] of Object.entries(frozen?.metricDefinitions ?? {})) {
          try {cognitivePermission(item, key, actor); metrics.push({itemId: item.id, metricKey: key, label: metric.label ?? key})} catch {/* inaccessible metrics are not advertised */}
        }
      }
    }
    if (!metrics.length) continue
    if (task.trainingVariantFrozen || task.trainingVariantDigest) {
      const config = parseCompiledWeightedVariants(task.trainingVariantFrozen)
      if (config.configDigest !== task.trainingVariantDigest || config.unionDigest !== hash({kind: 'WEIGHTED_VARIANT_UNION', schemaVersion: 1, units: buildTrainingVariantUnion(task).units})) invalid('分卷冻结定义不一致')
      for (const group of config.groups) list.push({taskId: task.id, taskName: task.name, publication: iso(task.publishedAt)!, configDigest: config.configDigest,
        variantKey: group.variantKey, metrics: metrics.filter(metric => group.selectedItemIds.includes(metric.itemId))})
    } else list.push({taskId: task.id, taskName: task.name, publication: iso(task.publishedAt)!, configDigest: null, variantKey: null, metrics})
  }
  return {list, total: list.length, hasMore: tasks.length > 100, canQuality: true, canExport: true,
    unsupportedReason: '独立 Assessment 或缺少冻结课程来源的数据标记为 LEGACY_UNSCOPED，不依据当前班级成员推断。'}
}
