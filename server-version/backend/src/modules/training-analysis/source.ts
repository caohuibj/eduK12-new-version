import { createHash } from 'node:crypto'
import { compileTrainingFlow, type FrozenTrainingFlow } from '../assessment-core/flow/training'
import { buildTrainingFlowUnits } from '../composite/training-flow-definition'
import { Prisma, UserRole } from '@prisma/client'
import { parseCompiledWeightedVariants } from '../assessment-core/weighted-variants'
import { canonicalHash } from '../assessment-runtime/canonical'
import { isScaleReportFactsView } from '../assessment-runtime/compact-scale-facts'
import { loadStoredCanonicalUnitResults } from '../assessment-runtime/compact-assessment-storage'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { parseVersionedFrozenScaleRuntimeSnapshot, type VersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { createSharedScaleRuntimeStore, isSharedScaleRuntimeReference, type SharedScaleArtifactRecord } from '../assessment-runtime/shared-scale-runtime'
import { compositeItemSlotKey, formSectionSlotKey, type FrozenActiveSlotSetV1 } from '../assessment-runtime/slot-set'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { typedCompositeFormQuestion } from '../assessment-runtime/typed-form'
import { parseCanonicalUnitResultEnvelope, type CanonicalUnitResultEnvelopeV1 } from '../assessment-runtime/unit-result'
import { preloadCompositeReportFacts } from '../composite/composite-report-read-batch'
import { loadTrainingVariantExportGraph } from '../composite/training-variant-export'
import { applyTrainingAttemptScope, resolveTrainingAttemptScope, assertVerifiedTrainingAttemptScope, buildTrainingVariantUnion, type TrainingAttemptScope } from '../composite/training-variant-scope'
import { loadSituationalExportSlotSets } from '../composite/situational-canonical-export'
import { CompositeServiceError, compositeBadRequest, compositeConflict, compositeNotFound } from '../composite/composite.errors'
import { readScaleResult, resolveProjectionPolicyForAssessment } from '../scale/scale-workflow.service'
import { createScaleProjectionContext } from '../scale/projection/context-factory'
import { resolveEffectiveScaleDisclosure } from '../scale/projection/context'
import { readFrozenReport } from '../cognitive/profile-freeze'
import { resolveTrainingComparability } from './core'
import { trainingGroupFormDefinitions, trainingGroupFormQuestion, selectLatestTrainingGroupParents, trainingGroupLeafItems, trainingCognitiveGroupTaskKey, trainingCognitiveGroupAssignmentId, trainingStandaloneCognitiveFacts, selectLatestTrainingCognitiveSessions, type TrainingGroupSource } from './group-source'
import { decryptCognitivePayload } from '../cognitive/cognitive.security'
import { parseCognitiveResultSnapshot } from '../cognitive/v2/result-snapshot'
import { readTaskGroupArtifact } from '../reporting/task-artifact'
import type { GroupMetricDefinition, GroupMetricObservation } from '../reporting/group-summary'
import type { TrainingAnalysisRequestV1, TrainingAnalysisSourceV1, TrainingAnalysisWaveV1, TrainingMetricIdentityV1, TrainingNumericObservationV1, TrainingObservationReason } from './types'

export const TRAINING_ANALYSIS_SOURCE_LIMIT = 6000
export type TrainingAnalysisActor = {userId: string; role: UserRole}
export interface TrainingAnalysisManifestAttemptV1 {
  waveKey: string; taskId: string; materialGroupKey?: string; attemptId: string; attemptEpoch: number
  sourceHash: string; sourceHashes: Record<string, string>; status: string; taskSatisfaction: string | null
}
export interface TrainingAnalysisSourceManifestV1 {
  schemaVersion: 1; courseId: string; selectorHash: string
  attempts: TrainingAnalysisManifestAttemptV1[]
  dictionary: Array<{waveKey: string; taskId: string; materialGroupKey?: string; itemId: string; metricKey: string; measurement: TrainingMetricIdentityV1 | null}>
  authoritySnapshot: unknown
  exclusions: {IDENTITY_UNAVAILABLE: number}
}
export interface TrainingResearchGovernance {
  attemptId:string;taskId:string;attemptEpoch:number;studyId:string;participantId:string|null;acceptanceId:string|null;
  acceptedVersionId:string|null;bodyHash:string|null;scopeHash:string|null;dataCategories:string[]|null;status:string|null;revision:number;
}
export interface LoadedTrainingAnalysisSources {
  group?: TrainingGroupSource
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
async function authority(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, courseId: string,
  lockMode?: 'SHARE' | 'UPDATE', expectedTokenVersion?: number) {
  if (actor.role !== UserRole.TEACHER) unavailable() // Management/old export identities do not imply raw-data access.
  // Grant mutations lock the same user row and increment token_version. A
  // single statement both projects the current entry role and locks the full
  // authority context; the caller cannot supply an already-verified shortcut.
  const effectiveRole = Prisma.sql`u.role::text`
  const rows = await tx.$queryRaw<Array<{id:string;role:UserRole;businessRole:UserRole;isActive:boolean;isFrozen:boolean;
    expiresAt:Date|null;teacherApproved:boolean;accountDomain:string;mustChangePassword:boolean;tokenVersion:number;
    trainingGrantVersion:number|null;courseId:string;creatorId:string;courseType:string;isLibrary:boolean}>>`
      SELECT u.id,${effectiveRole} AS role,u.role AS "businessRole",u.is_active AS "isActive",u.is_frozen AS "isFrozen",u.expires_at AS "expiresAt",
        u.teacher_approved AS "teacherApproved",u.account_domain AS "accountDomain",
        u.must_change_password AS "mustChangePassword",u.token_version AS "tokenVersion",
        NULL::integer AS "trainingGrantVersion",
        c.id AS "courseId",c.creator_id AS "creatorId",c.course_type AS "courseType",c.is_library AS "isLibrary"
      FROM courses c JOIN users u ON u.id=${actor.userId}
      WHERE c.id=${courseId} AND c.course_type='TRAINING_COURSE' AND NOT c.is_library
        AND c.creator_id=u.id
        AND ${effectiveRole}=${actor.role}
        AND u.account_domain IN ('LEGACY','TRAINING') AND u.is_active AND NOT u.is_frozen
        AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
        ${expectedTokenVersion === undefined ? Prisma.empty : Prisma.sql`AND u.token_version=${expectedTokenVersion}`}
      ${lockMode === 'UPDATE' ? Prisma.sql`FOR UPDATE OF c FOR SHARE OF u`
        : lockMode === 'SHARE' ? Prisma.sql`FOR SHARE OF c,u` : Prisma.empty}
    `
  if (rows.length !== 1) {
    if (lockMode) throw Object.assign(new Error('课程不存在或无当前数据访问权限'), {statusCode:404,code:'TRAINING_ANALYSIS_NOT_FOUND'})
    unavailable()
  }
  const row = rows[0]
  const principal = {id:row.id,role:row.role,businessRole:row.businessRole,isActive:row.isActive,isFrozen:row.isFrozen,expiresAt:row.expiresAt,
    teacherApproved:row.teacherApproved,accountDomain:row.accountDomain,mustChangePassword:row.mustChangePassword,
    tokenVersion:row.tokenVersion,trainingGrantVersion:row.trainingGrantVersion}
  const course = {id:row.courseId,creatorId:row.creatorId,courseType:row.courseType,isLibrary:row.isLibrary}
  if (principal.mustChangePassword || (actor.role === UserRole.TEACHER && !principal.teacherApproved)) unavailable()
  const assignments = actor.role === UserRole.TEACHER ? await tx.relationalAssessmentAssignment.findMany({where: {
    createdByUserId: actor.userId, perspective: 'OBSERVER_REPORT', analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'observer_assigning_teacher_v1',
  }, select: {id: true, createdByUserId: true, perspective: true, analysisMode: true, visibilityPolicyKey: true}, orderBy: {id: 'asc'}}) : []
  const visibility = actor.role === UserRole.TEACHER ? {OR: [{assignmentRef: null}, {assignmentRef: {in: assignments.map(row => row.id)}}]} : null
  return {principal: {...principal, expiresAt: iso(principal.expiresAt)}, course, assignments, visibility}
}
const authorizedTaskWhere = (actor: TrainingAnalysisActor, courseId: string, group=false) => ({
  productKind: group?{in:[...productWhere.in,'ASSESSMENT_BUNDLE']}:productWhere, compositionTemplates: {none: {}}, ...(actor.role === UserRole.ADMIN ? {} : {createdBy: actor.userId}),
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
const materialFields = (value: {materialGroupKey?: string}) => value.materialGroupKey === undefined ? {} : {materialGroupKey: value.materialGroupKey}
/** Validate the complete frozen definition even when a group has no attempts. */
function materialConfig(task: any): FrozenTrainingFlow | null {
  if (task.trainingFlowFrozen?.schemaVersion !== 2) return null
  const {policy, unionDigest, flowDigest, ...draft} = task.trainingFlowFrozen
  const compiled = compileTrainingFlow(draft, buildTrainingFlowUnits(task))
  if (task.trainingVariantFrozen != null || task.trainingVariantDigest != null || task.trainingVariantDraft != null
    || compiled.flowDigest !== task.trainingFlowDigest || hash(compiled) !== hash(task.trainingFlowFrozen)) invalid('实验材料冻结定义不一致')
  return compiled
}
const stratumMatches = (wave: TrainingAnalysisWaveV1, scope: TrainingAttemptScope) => {
  if (scope.flow?.materialAssignment) return wave.configDigest === null && wave.variantKey === null
    && wave.materialGroupKey === scope.flow.materialAssignment.groupKey
  if (wave.materialGroupKey !== undefined) invalid('实验材料分组缺少已验证分配')
  return scope.variant
    ? wave.configDigest === scope.variant.configDigest && wave.variantKey === scope.variant.variantKey && wave.publication === scope.variant.publishedAt
    : wave.configDigest === null && wave.variantKey === null
}
const groupRows = (rows: any[], key: (row: any) => string) => {
  const result = new Map<string, any[]>()
  for (const row of rows) {const id = key(row), list = result.get(id) ?? []; list.push(row); result.set(id, list)}
  return result
}

/** Only database-backed user or study-local linkage may establish a pair. */
export async function trainingParticipantIdentities(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, attempts: any[]) {
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
  options: {authorityLock?: 'SHARE' | 'UPDATE'; expectedTokenVersion?: number; fixedManifest?: {attempts: TrainingAnalysisManifestAttemptV1[];researchSources?:Array<{taskId:string;attemptId:string;attemptEpoch:number}>}; sourceCutoff?: string; group?: {headersOnly?: boolean; parentIds?: string[]}} = {}): Promise<LoadedTrainingAnalysisSources> {
  const cutoff = options.sourceCutoff ? new Date(options.sourceCutoff) : null
  if (cutoff && !Number.isFinite(cutoff.getTime())) throw compositeBadRequest('来源截止时间无效')
  const auth = await authority(tx, actor, selector.courseId, options.authorityLock, options.expectedTokenVersion)
  if (options.group && selector.waves.length !== 1) throw compositeBadRequest('单次群体报告只选择一个任务来源')
  if (!selector.waves.length || selector.waves.length > 8) throw compositeBadRequest('请选择 1–8 个明确波次')
  const tasks = await tx.compositeAssessment.findMany({where: {...authorizedTaskWhere(actor, selector.courseId, Boolean(options.group)), id: {in: [...new Set(selector.waves.map(wave => wave.taskId))]}}, include: options.group?{...templateInclude,bundleInstance:true}:templateInclude})
  if (tasks.length !== new Set(selector.waves.map(wave => wave.taskId)).size) unavailable()
  const byTask = new Map(tasks.map(task => [task.id, task])), entries: Array<{wave: TrainingAnalysisWaveV1; attempt: any; scope: TrainingAttemptScope; slots: FrozenActiveSlotSetV1 | null}> = []
  const fixed = options.fixedManifest?.attempts
  if (fixed && (fixed.length > TRAINING_ANALYSIS_SOURCE_LIMIT || fixed.some(row => !selector.waves.some(wave => wave.waveKey === row.waveKey && wave.taskId === row.taskId && wave.materialGroupKey === row.materialGroupKey)))) invalid('分析清单与选择范围不一致')
  const taskAuthority: unknown[] = [], policies: unknown[] = []
  for (const wave of selector.waves) {
    const task: any = byTask.get(wave.taskId)
    if (iso(task.publishedAt) !== wave.publication || !wave.metrics.length || wave.metrics.length > (options.group ? 500 : 32)) unavailable()
    if ((task.trainingVariantDigest ?? null) !== wave.configDigest || Boolean(wave.configDigest) !== Boolean(wave.variantKey)) unavailable()
    const material = materialConfig(task)
    if (material?.schemaVersion === 2 ? !material.experiment.groups.some(group => group.groupKey === wave.materialGroupKey) : wave.materialGroupKey !== undefined) unavailable()
    const metricItems=options.group?trainingGroupLeafItems(task):task.items
    if (wave.metrics.some(metric => !metricItems.some((item: any) => item.id === metric.itemId))) unavailable()
    taskAuthority.push({id: task.id, createdBy: task.createdBy, productKind: task.productKind})
    const filters: Prisma.CompositeAssessmentAttemptWhereInput[] = [
      ...(auth.visibility ? [auth.visibility] : []),
      ...(options.group ? [{assignmentRef: null, status: 'COMPLETED' as const, deliveryMode: 'FINAL_ONLY' as const, runtimeGeneration: 'UNIFIED_V1' as const}, ...(options.group.parentIds ? [{id: {in: options.group.parentIds}}] : [])] : []),
      ...(fixed ? [{OR: [...fixed.filter(row => row.waveKey === wave.waveKey),...(options.fixedManifest?.researchSources??[]).filter(row=>row.taskId===wave.taskId)].map(row => ({id: row.attemptId, attemptEpoch: row.attemptEpoch}))}] : []),
      ...(cutoff ? [{startedAt: {lte: cutoff}}, {OR: [{completedAt: null}, {completedAt: {lte: cutoff}}]}] : []),
    ]
    const where = {compositeAssessmentId: task.id, deliveryCourseId: selector.courseId, ...(filters.length ? {AND: filters} : {})}
    // The variant graph is requested in headers-only mode: selected strata are
    // resolved BEFORE any child result, raw answer or Form facts can be read.
    const graph = await loadTrainingVariantExportGraph(task.id, where, {previewLimit: TRAINING_ANALYSIS_SOURCE_LIMIT + 1}, true, tx)
    const attempts: any[] = graph?.template.attempts ?? await tx.compositeAssessmentAttempt.findMany({where, orderBy: {id: 'asc'}, take: TRAINING_ANALYSIS_SOURCE_LIMIT + 1})
    if (attempts.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('分析来源超过 6000 条，请缩小选择范围')
    const identitySelection = options.group ? await trainingParticipantIdentities(tx, actor, attempts) : null
    const groupIds = options.group ? new Set((options.group.parentIds ? attempts : selectLatestTrainingGroupParents(attempts, identitySelection!.ids)).map(row => row.id)) : null
    const eligibleForSlots = attempts.filter(row => row.runtimeGeneration === 'UNIFIED_V1' && row.frozenActiveSlotSetEncrypted && row.frozenActiveSlotSetHash)
    const slotSets = graph?.frozenSlotSets ?? await loadSituationalExportSlotSets(eligibleForSlots, tx)
    for (const row of attempts) {
      if (groupIds && !groupIds.has(row.id)) continue
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
  const {ids:identities,researchGovernance} = await trainingParticipantIdentities(tx, actor, entries.map(entry => entry.attempt))
  const selected = entries.filter(entry => options.group || identities.has(entry.attempt.id))
  const group: TrainingGroupSource | undefined = options.group ? {parents: selected.map(({attempt}) => ({attemptId: attempt.id, attemptEpoch: attempt.attemptEpoch, stableIdentity: identities.get(attempt.id)?.participantKey ?? null})), definitions: [], observations: [], snapshots: []} : undefined
  if (options.group?.headersOnly) {
    return {group, researchGovernance, source: {schemaVersion: 1, courseId: selector.courseId, observations: []}, manifest: {schemaVersion: 1, courseId: selector.courseId, selectorHash: hash(selector), attempts: [], dictionary: [], authoritySnapshot: null, exclusions: {IDENTITY_UNAVAILABLE: 0}}, authorityHash: hash({principal: auth.principal, course: auth.course}), sourceFingerprint: hash({selector, parents: group?.parents ?? []}), dictionary: []}
  }
  if (entries.reduce((count, entry) => count + entry.wave.metrics.length, 0) > 50000) throw compositeBadRequest('数值观测超过 50000 条，请缩小指标范围')
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
  const factsFor = await preloadCompositeReportFacts(final.map(entry => entry.attempt), tx, {selectedItemIds, numericOnly: true, includeLegacyForm: Boolean(options.group)})
  // Existing canonical validation may internally expand scored item facts, but
  // never reads raw answers. Reuse the same invocation-local fact rows/body;
  // neither scored items nor raw fields enter analysis/export output.
  const uniqueCiphers = [...new Set(canonicalCiphers)]
  const canonicalViews = await loadStoredCanonicalUnitResults(uniqueCiphers, tx, [], factsFor.scaleFacts)
  const canonicalByCipher = new Map(uniqueCiphers.map((cipher, index) => [cipher, canonicalViews[index]]))
  if (group) group.snapshots = snapshots.map(row => ({attemptId: row.compositeAttemptId!, attemptEpoch: row.attemptEpoch, slotKey: row.slotKey, hash: trainingGroupSnapshotHash(row)}))
  const groupForms = new Map<string, {question: ReturnType<typeof trainingGroupFormQuestion>; definitions: GroupMetricDefinition[]}>()
  const categoricalGroup = options.group && selector.waves.some(wave => wave.metrics.some(metric => {const item: any = byTask.get(wave.taskId)!.items.find(item => item.id === metric.itemId); return item.type === 'FORM' && !['NUMBER', 'SLIDER'].includes(item.formDefinition?.type)}))
  const observations: TrainingNumericObservationV1[] = [], manifests: TrainingAnalysisManifestAttemptV1[] = [], formSourceHashes = new WeakMap<object, string>()
  for (const {wave, attempt, scope, slots} of selected) {
    const participant = identities.get(attempt.id), attemptObservations: TrainingNumericObservationV1[] = [], groupObservations: GroupMetricObservation[] = []
    const sourceHashes: Record<string, string> = {participant: hash(participant ?? {response: attempt.id}), parent: hash(parentIdentity(attempt)), publication: hash({taskId: wave.taskId, publication: wave.publication, configDigest: wave.configDigest, variantKey: wave.variantKey, ...materialFields(wave)})}
    if(scope.flow?.materialAssignment){sourceHashes.materialAssignment=scope.flow.materialAssignment.assignmentHash;sourceHashes.materialConfig=scope.flow.config.flowDigest;sourceHashes.materialPath=scope.flow.pathHash}
    const isFinal = finalSet.has(attempt), facts = isFinal ? factsFor(attempt) : null
    const itemsById = new Map(scope.items.map(item => [item.id, item]))
    for (const metric of wave.metrics) {
      const item = itemsById.get(metric.itemId)
      let measurementQuality: string | undefined, metricQuality: string | undefined
      let groupDefinition: GroupMetricDefinition | undefined, groupValue: GroupMetricObservation['value'] = null
      let value: number | null = null, measurement: TrainingMetricIdentityV1 | null = null, reason: TrainingObservationReason | null = null
      if (!item) reason = 'NOT_ASSIGNED'
      else if (!isFinal) reason = 'NON_FINAL'
      else if (item.type === 'FORM') {
        let groupForm = groupForms.get(item.id)
        if (options.group && !groupForm) {groupForm = {question: trainingGroupFormQuestion(item), definitions: trainingGroupFormDefinitions(item)}; groupForms.set(item.id, groupForm)}
        groupDefinition = groupForm?.definitions.find(row => row.key === metric.metricKey)
        const question = groupForm?.question ?? formMetric(item, metric.metricKey)
        if (options.group && !groupDefinition) unavailable()
        const raw = facts!.typedFormValues.get(item.id), state = facts!.typedFormStates.get(item.id)?.state
        const section = scope.formSections.find(candidate => candidate.id === item.formSectionId), slot = slots!.slots.find(candidate => candidate.slotKey === formSectionSlotKey(item.formSectionId))
        if (!section || !slot || slot.sourceDefinitionIdentity.hash !== hash(mapCompositeSection(section))) invalid('表单冻结定义不一致')
        measurement = {instrumentKey: `FORM:${question.itemKey}`, scoreKey: question.itemKey, scoringDigest: hash(item.formDefinition ?? {type: question.type, options: question.options}), responseSignature: hash({type: question.type, definition: item.formDefinition ?? {options: question.options}}),
          respondentType: attempt.respondentType ?? 'SELF', unit: null, version: 'training-typed-form-v1'}
        const projected = question.type === 'MATRIX' || question.type === 'MATRIX_MULTIPLE' ? (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>)[metric.metricKey.slice(question.itemKey.length + 1)] : null) : raw
        groupValue = numeric(projected) || typeof projected === 'string' || (Array.isArray(projected) && projected.every(value => typeof value === 'string')) ? projected as GroupMetricObservation['value'] : null
        value = numeric(raw) ? raw : null
        reason = options.group ? state === 'NOT_SHOWN' ? 'NOT_ASSIGNED' : state === 'REFUSED' || state === 'SHOWN_MISSING' || groupValue === null ? 'UNANSWERED' : null : state === 'NOT_SHOWN' ? 'NOT_ASSIGNED' : raw == null || state === 'REFUSED' || state === 'SHOWN_MISSING' ? 'UNANSWERED' : !numeric(raw) ? 'INVALID_VALUE' : null
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
          if (options.group) groupDefinition = {key: metric.metricKey, label: metric.metricKey, measurement: null, type: 'NUMBER', unit: storedMetric.unit ?? null, range: null}
          measurementQuality = core.quality.status
          metricQuality = storedMetric.quality
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
            if (groupDefinition && score) {groupDefinition.label = score.label; groupDefinition.range = score.range ?? null}
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
            if (groupDefinition) groupDefinition.label = definition.label ?? metric.metricKey
            if ((definition.unit ?? null) !== (storedMetric.unit ?? null)) invalid('认知指标单位不一致')
            policies.push({taskId: wave.taskId, itemId: item.id, metricKey: metric.metricKey, profile: report.profile, role: definition.role ?? null, availableProfiles: definition.availableProfiles ?? null})
          } else if (item.type === 'SITUATIONAL') {
            if (item.situationalInstrumentKey !== core.instrumentKey || item.situationalInstrumentVersion !== core.instrumentVersion) invalid('情境测量工具身份不一致')
          } else unavailable()
          measurement = {instrumentKey: core.instrumentKey, scoreKey: metric.metricKey,
            scoringDigest: hash({scorer: core.scorerKey, version: core.scorerVersion, definition: core.sourceDefinitionHash, runtime: core.compiledRuntimeHash}),
            responseSignature, respondentType: attempt.respondentType ?? 'SELF', unit: storedMetric.unit ?? null, version: core.instrumentVersion}
          value = numeric(storedMetric.value) ? storedMetric.value : null
          groupValue = value
          reason = storedMetric.quality === 'not_calculable' ? 'NOT_CALCULABLE' : core.quality.status === 'invalid' ? 'INVALID_VALUE' : storedMetric.value === null ? 'UNANSWERED' : !numeric(storedMetric.value) ? 'INVALID_VALUE' : null
          sourceHashes[item.id] = envelope.resultHash
        }
      }
      if (group) {
        if (groupDefinition) group.definitions.push({...groupDefinition, measurement})
        groupObservations.push({parentId: attempt.id, metricKey: metric.metricKey, value: groupValue, missingReason: reason, quality: metricQuality === 'invalid' ? 'invalid' : measurementQuality ?? null})
      }
      if (participant && (!groupDefinition || groupDefinition.type === 'NUMBER')) attemptObservations.push({...participant,...(participant.participantKind==='STUDY_LOCAL'?{researchCategory:item?.type==='SITUATIONAL'?'SJT':item?.type}:{}), waveKey: wave.waveKey, taskId: wave.taskId, publication: wave.publication, configDigest: wave.configDigest, variantKey: wave.variantKey, ...materialFields(wave),
        attemptId: attempt.id, attemptEpoch: attempt.attemptEpoch, sourceHashes, metricKey: metric.metricKey, itemId: metric.itemId, measurement, value, reason,
        ...(measurementQuality===undefined?{}:{measurementQuality}),...(metricQuality===undefined?{}:{metricQuality}),originalFinalStatus: attempt.status, taskSatisfied: attempt.taskSatisfaction === 'SATISFIED' ? true : attempt.taskSatisfaction === 'NOT_SATISFIED' ? false : null})
    }
    if (group) group.observations.push(...groupObservations)
    const sourceHash = hash({sourceHashes, ...(categoricalGroup ? {groupObservations} : {}), observations: attemptObservations.map(({metricKey, itemId, measurement, value, reason}) => ({metricKey, itemId, measurement, value, reason}))})
    sourceHashes.sourceHash = sourceHash
    manifests.push({waveKey: wave.waveKey, taskId: wave.taskId, ...materialFields(wave), attemptId: attempt.id, attemptEpoch: attempt.attemptEpoch, sourceHash, sourceHashes,
      status: attempt.status, taskSatisfaction: attempt.taskSatisfaction ?? null})
    observations.push(...attemptObservations)
  }
  manifests.sort((a, b) => a.waveKey.localeCompare(b.waveKey) || a.attemptId.localeCompare(b.attemptId))
  const dictionary = [...new Map(observations.map(row => {
    const value = {waveKey: row.waveKey, taskId: row.taskId, ...materialFields(row), itemId: row.itemId, metricKey: row.metricKey, measurement: row.measurement}
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
  return {...(group ? {group} : {}),researchGovernance,source: {schemaVersion: 1, courseId: selector.courseId, observations}, manifest, dictionary,
    authorityHash: hash(authoritySnapshot), sourceFingerprint: hash({selector: manifest.selectorHash, attempts: manifests, dictionary})}
}
const taskIdOf = (attempt: any) => attempt.compositeAssessmentId

/** Runtime-only reader: no result facts, answers, reports or rescoring. Exact
 * ciphertext/reference identities are request-local; artifacts are read in one
 * batch and grouped so the bounded shared parser cannot churn between artifacts. */
async function discoveryScaleRuntimes(rows: any[], tx: Prisma.TransactionClient) {
  const decoded = new Map<string, any>(), groups = new Map<string, string[]>(), artifactHashes = new Set<string>()
  try {
    for (const row of rows) {
      const cipher = row.runtimeSnapshotEncrypted
      if (typeof cipher !== 'string' || !cipher) invalid('量表指标冻结运行时缺失')
      if (decoded.has(cipher)) continue
      const value = decryptUnifiedRuntimePayload<any>(cipher)
      decoded.set(cipher, value)
      const shared = isSharedScaleRuntimeReference(value)
      if (shared && (typeof value.artifactHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.artifactHash))) invalid('量表指标共享运行时无效')
      if (shared) artifactHashes.add(value.artifactHash)
      const key = shared ? value.artifactHash : cipher
      const group = groups.get(key) ?? []; group.push(cipher); groups.set(key, group)
    }
    const artifacts = artifactHashes.size ? await tx.$queryRaw<SharedScaleArtifactRecord[]>`SELECT artifact_hash AS "artifactHash",format_version AS "formatVersion",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted"
      FROM assessment_runtime_artifacts WHERE artifact_hash IN (${Prisma.join([...artifactHashes])})` : []
    const byHash = new Map(artifacts.map(row => [row.artifactHash, row]))
    if (byHash.size !== artifacts.length || artifacts.length !== artifactHashes.size || artifacts.some(row => !artifactHashes.has(row.artifactHash))) invalid('量表指标共享运行时批次不一致')
    const store = createSharedScaleRuntimeStore({find: async key => byHash.get(key) ?? null, insert: async () => {throw new Error('Discovery runtime reader is read only')}})
    const runtimes = new Map<string, VersionedFrozenScaleRuntimeSnapshot>(), references = new Map<string, VersionedFrozenScaleRuntimeSnapshot>()
    for (const group of groups.values()) for (const cipher of group) {
      const value = decoded.get(cipher)
      if (isSharedScaleRuntimeReference(value)) {
        const identity = hash(value)
        const runtime = references.get(identity) ?? await store.load(value)
        references.set(identity, runtime); runtimes.set(cipher, runtime)
      } else runtimes.set(cipher, parseVersionedFrozenScaleRuntimeSnapshot(value))
    }
    return runtimes
  } catch {invalid('量表指标冻结运行时不可用')}
}

/** Discovery reads every authorized frozen dictionary, never editable templates.
 * The public selector cannot distinguish conflicting meanings for one item/key. */
async function discoverFrozenScaleMetrics(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, courseId: string,
  tasks: any[], visibility: Prisma.CompositeAssessmentAttemptWhereInput | null, itemId?: string) {
  const scaleTasks = tasks.filter(task => task.items.some((item: any) => item.type === 'SCALE'))
  const metrics = new Map<string, Array<{itemId: string; metricKey: string; label: string}>>()
  if (!scaleTasks.length) return metrics
  const rows: any[] = await tx.assessment.findMany({where: {
    status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', ...(itemId ? {compositeItemId: itemId} : {}),
    compositeAttempt: {is: {compositeAssessmentId: {in: scaleTasks.map(task => task.id)}, deliveryCourseId: courseId,
      status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1', ...(visibility ? {AND: [visibility]} : {})}},
  }, select: {id: true, compositeAttemptId: true, compositeItemId: true, scaleId: true, attemptEpoch: true,
    status: true, deliveryMode: true, runtimeGeneration: true, submissionId: true, submissionPayloadHash: true,
    runtimeSnapshotEncrypted: true, compiledRuntimeHash: true, compositeAttempt: {select: {
      id: true, compositeAssessmentId: true, participantKey: true, deliveryCourseId: true, assignmentRef: true, respondentType: true,
      attemptEpoch: true, status: true, deliveryMode: true, runtimeGeneration: true, contextSnapshotHash: true,
      frozenActiveSlotSetEncrypted: true, frozenActiveSlotSetHash: true,
      trainingVariantAllocationEncrypted: true, trainingVariantAllocationHash: true,
      trainingFlowSnapshotEncrypted: true, trainingFlowSnapshotHash: true, trainingFlowPathEncrypted: true, trainingFlowPathHash: true,
    }}}, orderBy: {id: 'asc'}, take: TRAINING_ANALYSIS_SOURCE_LIMIT + 1})
  if (rows.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('量表指标来源超过 6000 条，请缩小课程范围')
  const current = rows.filter(row => {
    if (!row.compositeAttempt || row.compositeAttempt.id !== row.compositeAttemptId) invalid('量表指标父记录绑定不一致')
    return row.attemptEpoch === row.compositeAttempt.attemptEpoch
  })
  const parents = [...new Map(current.map(row => [row.compositeAttempt.id, row.compositeAttempt])).values()]
  const tasksById = new Map(scaleTasks.map(task => [task.id, task]))
  const slots = await loadSituationalExportSlotSets(parents, tx), children = groupRows(current, row => row.compositeAttemptId)
  const flowParents = parents.filter(parent => tasksById.get(parent.compositeAssessmentId)?.trainingFlowFrozen != null)
  const flowSnapshots = new Map<string, any[]>(flowParents.map(parent => [parent.id, []]))
  if (flowParents.length) {
    const accepted = await tx.assessmentUnitSnapshot.findMany({where: {OR: flowParents.map(parent => ({compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch}))}, orderBy: {id: 'asc'}, take: TRAINING_ANALYSIS_SOURCE_LIMIT + 1})
    if (accepted.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('量表流程来源超过 6000 条，请缩小课程范围')
    const epochs = new Map(flowParents.map(parent => [parent.id, parent.attemptEpoch]))
    for (const row of accepted) {
      if (!row.compositeAttemptId || epochs.get(row.compositeAttemptId) !== row.attemptEpoch) invalid('量表流程快照不在发现范围')
      flowSnapshots.get(row.compositeAttemptId)!.push(row)
    }
  }
  const projected: any[] = []
  for (const parent of parents) {
    const task = tasksById.get(parent.compositeAssessmentId)
    if (!task || parent.deliveryCourseId !== courseId || parent.status !== 'COMPLETED'
      || parent.deliveryMode !== 'FINAL_ONLY' || parent.runtimeGeneration !== 'UNIFIED_V1') invalid('量表指标课程来源不一致')
    const attempt = {...parent, compositeAssessment: task, scaleAssessments: children.get(parent.id) ?? []}
    const scope = await resolveTrainingAttemptScope(attempt, task, {db: tx, frozenSlotSets: slots, flowSnapshots})
    for (const child of attempt.scaleAssessments) {
      if (child.compositeAttemptId !== parent.id || child.attemptEpoch !== parent.attemptEpoch
        || !scope.items.some(item => item.id === child.compositeItemId && item.type === 'SCALE')) invalid('量表指标不在已分配范围')
      if (scope.flow) {
        const accepted = scope.flow.snapshots.filter(row => row.slotKey === compositeItemSlotKey(child.compositeItemId, 'SCALE'))
        if (accepted.length !== 1 || accepted[0].sourceType !== 'ASSESSMENT' || accepted[0].sourceAttemptId !== child.id
          || accepted[0].sourceSubmissionId !== child.submissionId || accepted[0].compiledRuntimeHash !== child.compiledRuntimeHash) invalid('量表指标流程已接受来源不一致')
      }
    }
    projected.push(await applyTrainingAttemptScope(attempt, {db: tx, frozenSlotSets: slots, verifiedScope: scope}))
  }
  const runtimes = await discoveryScaleRuntimes(current, tx), meanings = new Map<string, {label: string; measurement: TrainingMetricIdentityV1}>()
  const dictionaryIdentities = new Map<VersionedFrozenScaleRuntimeSnapshot, {scoringDigest: string; responseSignature: string}>()
  for (const parent of projected) for (const child of parent.scaleAssessments) {
    const item = parent.compositeAssessment.items.find((candidate: any) => candidate.id === child.compositeItemId)
    const slot = slots.get(parent.id)!.slots.find(candidate => candidate.slotKey === compositeItemSlotKey(item.id, 'SCALE'))
    const runtime = runtimes.get(child.runtimeSnapshotEncrypted)
    if (!runtime || !slot || slot.unitType !== 'SCALE' || !child.submissionId || child.status !== 'COMPLETED'
      || child.deliveryMode !== 'FINAL_ONLY' || child.runtimeGeneration !== 'UNIFIED_V1'
      || child.scaleId !== item.scaleId || item.scale?.id !== child.scaleId
      || runtime.instrumentKey !== slot.sourceDefinitionIdentity.key || runtime.instrumentVersion !== slot.sourceDefinitionIdentity.version
      || runtime.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash || runtime.compiledRuntime.compiledRuntimeHash !== child.compiledRuntimeHash
      || (slot.sourceBinding.compiledRuntimeHash && slot.sourceBinding.compiledRuntimeHash !== child.compiledRuntimeHash)) invalid('量表指标冻结运行时或来源不一致')
    const policy = resolveProjectionPolicyForAssessment({...child, scale: {code: runtime.instrumentKey,
      instrumentVersion: runtime.instrumentVersion, instrumentClass: item.scale.instrumentClass}}, null, runtime)
    const disclosure = resolveEffectiveScaleDisclosure(createScaleProjectionContext({instrumentKey: runtime.instrumentKey,
      instrumentVersion: runtime.instrumentVersion, audience: 'teacher', purpose: 'export', principalId: actor.userId, frozenPolicy: policy.policy}))
    if (policy.snapshotError) invalid('量表指标冻结权限不可用')
    if (!disclosure.numericScores) continue
    const existing = metrics.get(parent.compositeAssessmentId) ?? [], compiled = runtime.compiledRuntime
    let identity = dictionaryIdentities.get(runtime)
    if (!identity) {
      identity = {scoringDigest: hash({scorer: compiled.scorerKey, version: compiled.scorerVersion, definition: runtime.sourceDefinitionHash, runtime: compiled.compiledRuntimeHash}),
        responseSignature: hash({items: runtime.definition.items.map(row => ({itemCode: row.itemCode, responseSetKey: row.responseSetKey})), responseSets: runtime.definition.responseSets})}
      dictionaryIdentities.set(runtime, identity)
    }
    for (const score of runtime.definition.scoring.scores) {
      const key = hash({taskId: parent.compositeAssessmentId, itemId: item.id, metricKey: score.key})
      // Use the existing exact-measurement comparability contract. A policy or
      // timestamp change alone is not a new scientific measurement identity.
      const measurement: TrainingMetricIdentityV1 = {instrumentKey: runtime.instrumentKey, scoreKey: score.key, ...identity,
        respondentType: parent.respondentType ?? 'SELF', unit: compiled.metricDefinitions[score.key]?.unit ?? null, version: runtime.instrumentVersion}
      const previous = meanings.get(key)
      if (previous && (previous.label !== score.label || resolveTrainingComparability(score.key, previous.measurement, measurement).level !== 'EXACT')) invalid('量表指标冻结版本冲突，当前选择协议无法区分')
      meanings.set(key, {label: score.label, measurement})
      if (!existing.some(value => value.itemId === item.id && value.metricKey === score.key)) existing.push({itemId: item.id, metricKey: score.key, label: score.label})
    }
    metrics.set(parent.compositeAssessmentId, existing)
  }
  return metrics
}

/** Bounded, owner-authorized discovery. Actual runs revalidate every frozen
 * source and disclosure; Scale selectors come only from frozen runtimes. */
export async function listTrainingAnalysisSources(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, courseId: string, options: {authorityLock?: 'SHARE' | 'UPDATE'; group?: boolean; taskId?: string; groupKey?: string} = {}) {
  const auth = await authority(tx, actor, courseId, options.authorityLock)
  const tasks: any[] = await tx.compositeAssessment.findMany({where: {...authorizedTaskWhere(actor, courseId, Boolean(options.group)), publishedAt: {not: null}, ...(options.taskId ? {id: options.taskId} : {})}, include: options.group?{...templateInclude,bundleInstance:true}:templateInclude,
    orderBy: [{publishedAt: 'desc'}, {id: 'asc'}], take: 101})
  const list: Array<{taskId: string; taskName: string; publication: string; configDigest: string | null; variantKey: string | null; materialGroupKey?: string; metrics: Array<{itemId: string; metricKey: string; label: string}>}> = []
  // Discover SJT metric keys from accepted frozen facts, never from a mutable
  // authoring registry or a grant that only permits derived C13 reporting.
  const governed = tasks.length ? await tx.$queryRaw<Array<{id: string}>>`SELECT DISTINCT a.composite_assessment_id AS id FROM composite_assessment_attempts a
    JOIN assessment_run_executions e ON e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=a.id
    JOIN assessment_run_tracks t ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
    WHERE a.composite_assessment_id IN (${Prisma.join(tasks.map(task => task.id))}) AND t.frozen_resource_policy ? 'resultDisclosure'` : []
  const blocked = new Set(governed.map(row => row.id)), available = tasks.slice(0, 100).filter(task => !blocked.has(task.id))
  const sjtTasks = available.filter(task => task.items.some((item: any) => item.type === 'SITUATIONAL' && (!options.groupKey || item.id === options.groupKey)))
  const sjtRows: any[] = sjtTasks.length ? await tx.assessmentUnitSnapshot.findMany({where: {unitType: 'SITUATIONAL', ...(options.groupKey ? {slotKey: compositeItemSlotKey(options.groupKey, 'SITUATIONAL')} : {}), compositeAttempt: {is: {
    compositeAssessmentId: {in: sjtTasks.map(task => task.id)}, deliveryCourseId: courseId, status: 'COMPLETED', deliveryMode: 'FINAL_ONLY', runtimeGeneration: 'UNIFIED_V1',
    ...(auth.visibility ? {AND: [auth.visibility]} : {}),
  }}}, include: {compositeAttempt: true}, orderBy: {id: 'asc'}, take: TRAINING_ANALYSIS_SOURCE_LIMIT + 1}) : []
  if (sjtRows.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('情境测量来源超过 6000 条，请缩小课程范围')
  for (const row of sjtRows) if (!row.compositeAttempt || row.compositeAttemptId !== row.compositeAttempt.id) invalid('情境指标父记录绑定不一致')
  const sjtParents = [...new Map(sjtRows.map(row => [row.compositeAttempt.id, row.compositeAttempt])).values()]
  const sjtSlots = await loadSituationalExportSlotSets(sjtParents, tx), sjtMetrics = new Map<string, Array<{itemId: string; metricKey: string; label: string}>>()
  // Flow authorization is parent-scoped, not SJT-row-scoped. Batch the complete
  // accepted header set once; every reused scope retains its original binding.
  const currentSjtParentIds = new Set(sjtRows.filter(row => row.attemptEpoch === row.compositeAttempt.attemptEpoch).map(row => row.compositeAttemptId))
  const sjtFlowParents = sjtParents.filter(parent => currentSjtParentIds.has(parent.id)
    && sjtTasks.find(task => task.id === parent.compositeAssessmentId)?.trainingFlowFrozen != null)
  const sjtFlowSnapshots = new Map<string, any[]>(sjtFlowParents.map(parent => [parent.id, []]))
  if (sjtFlowParents.length) {
    const accepted = await tx.assessmentUnitSnapshot.findMany({where: {OR: sjtFlowParents.map(parent => ({compositeAttemptId: parent.id, attemptEpoch: parent.attemptEpoch}))},
      orderBy: {id: 'asc'}, take: TRAINING_ANALYSIS_SOURCE_LIMIT + 1})
    if (accepted.length > TRAINING_ANALYSIS_SOURCE_LIMIT) throw compositeBadRequest('情境流程来源超过 6000 条，请缩小课程范围')
    const epochs = new Map(sjtFlowParents.map(parent => [parent.id, parent.attemptEpoch]))
    for (const row of accepted) {
      if (!row.compositeAttemptId || epochs.get(row.compositeAttemptId) !== row.attemptEpoch) invalid('情境流程快照不在发现范围')
      sjtFlowSnapshots.get(row.compositeAttemptId)!.push(row)
    }
  }
  const sjtFlowScopes = new Map<string, TrainingAttemptScope>()
  for (const row of sjtRows) {
    const parent = row.compositeAttempt, task = sjtTasks.find(task => task.id === parent.compositeAssessmentId)
    if (!task || parent.deliveryCourseId !== courseId) invalid('情境指标发现来源不一致')
    if (row.attemptEpoch !== parent.attemptEpoch) continue
    let scope = sjtFlowScopes.get(parent.id)
    if (scope) assertVerifiedTrainingAttemptScope(parent, task, scope)
    else {
      scope = await resolveTrainingAttemptScope(parent, task, {db: tx, frozenSlotSets: sjtSlots, flowSnapshots: sjtFlowSnapshots})
      if (scope.flow) sjtFlowScopes.set(parent.id, scope)
    }
    if (scope.flow) {
      const accepted = scope.flow.snapshots.find(snapshot => snapshot.slotKey === row.slotKey)
      const headerFields = ['id', 'compositeAttemptId', 'attemptEpoch', 'slotKey', 'unitType', 'terminalState', 'payloadKind',
        'sourceType', 'sourceAttemptId', 'sourceSubmissionId', 'sourceDefinitionHash', 'compiledRuntimeHash', 'canonicalResultEncrypted', 'collectionFactsEncrypted']
      if (!accepted || headerFields.some(key => (accepted[key] ?? null) !== (row[key] ?? null))
        || iso(accepted.completedAt) !== iso(row.completedAt)) invalid('情境指标与流程已接受来源不一致')
    }
    const item = scope.items.find(item => item.type === 'SITUATIONAL' && compositeItemSlotKey(item.id, item.type) === row.slotKey)
    if (!item) invalid('情境指标不在已分配范围')
    const envelope = acceptedEnvelope(parent, item, [row], sjtSlots.get(parent.id)!)
    const existing = sjtMetrics.get(task.id) ?? []
    for (const metric of envelope?.core.metrics ?? []) if ((metric.value === null || numeric(metric.value)) && !existing.some(value => value.itemId === item.id && value.metricKey === metric.key)) existing.push({itemId: item.id, metricKey: metric.key, label: metric.key})
    sjtMetrics.set(task.id, existing)
  }
  const scaleTasks = options.groupKey ? available.filter(task => task.items.some((item: any) => item.type === 'SCALE' && item.id === options.groupKey)) : available
  const scaleMetrics = await discoverFrozenScaleMetrics(tx, actor, courseId, scaleTasks, auth.visibility, options.groupKey)
  for (const task of available) {
    const metricItems=options.group?trainingGroupLeafItems(task):task.items
    const leafIds=new Set(metricItems.map((item:any)=>item.id))
    const metrics: Array<{itemId: string; metricKey: string; label: string}> = [...(sjtMetrics.get(task.id) ?? []), ...(scaleMetrics.get(task.id) ?? [])].filter(metric=>leafIds.has(metric.itemId))
    for (const item of metricItems) {
      if (options.groupKey && (item.type === 'FORM' ? `FORM:${item.formSectionId}` : item.id) !== options.groupKey) continue
      if (options.group && item.type === 'FORM') {
        for (const definition of trainingGroupFormDefinitions(item)) metrics.push({itemId: item.id, metricKey: definition.key, label: definition.label})
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
    const material = materialConfig(task)
    if (material?.schemaVersion === 2) {
      for (const group of material.experiment.groups) list.push({taskId: task.id, taskName: task.name, publication: iso(task.publishedAt)!,
        configDigest: null, variantKey: null, materialGroupKey: group.groupKey, metrics})
    } else if (task.trainingVariantFrozen || task.trainingVariantDigest) {
      const config = parseCompiledWeightedVariants(task.trainingVariantFrozen)
      if (config.configDigest !== task.trainingVariantDigest || config.unionDigest !== hash({kind: 'WEIGHTED_VARIANT_UNION', schemaVersion: 1, units: buildTrainingVariantUnion(task).units})) invalid('分卷冻结定义不一致')
      for (const group of config.groups) list.push({taskId: task.id, taskName: task.name, publication: iso(task.publishedAt)!, configDigest: config.configDigest,
        variantKey: group.variantKey, metrics: metrics.filter(metric => group.selectedItemIds.includes(metric.itemId))})
    } else list.push({taskId: task.id, taskName: task.name, publication: iso(task.publishedAt)!, configDigest: null, variantKey: null, metrics})
  }
  const tools = options.group ? list.flatMap(source => {
    const task = available.find(task => task.id === source.taskId)!
    const keys = new Set(source.metrics.map(metric => {const item = task.items.find((item: any) => item.id === metric.itemId)!; return item.type === 'FORM' ? `FORM:${item.formSectionId}` : item.id}))
    return [...keys].map(key => {
      const metrics = source.metrics.filter(metric => {const item = task.items.find((item: any) => item.id === metric.itemId)!; return (item.type === 'FORM' ? `FORM:${item.formSectionId}` : item.id) === key})
      const item = task.items.find((item: any) => item.id === metrics[0].itemId)!
      const definitions = metrics.map(metric => {const field = task.items.find((candidate: any) => candidate.id === metric.itemId)!; return field.type === 'FORM' ? trainingGroupFormDefinitions(field).find(definition => definition.key === metric.metricKey)! : {key: metric.metricKey, label: metric.label, type: 'NUMBER' as const, measurement: null, unit: null, range: null}})
      return {source: {...source, metrics}, definitions, key, kind: item.type === 'SITUATIONAL' ? 'SJT' : item.type, title: item.scale?.name ?? item.cognitiveAssignment?.title ?? (item.type === 'FORM' ? `${task.formSections.find((section: any) => section.id === item.formSectionId)?.title ?? '表单'} · ${item.formLabel}` : null) ?? item.situationalInstrumentKey ?? key}
    })
  }) : []
  return {tools, list, total: list.length, hasMore: tasks.length > 100, canQuality: true, canExport: true,
    unsupportedReason: '只纳入正式完成且已保存本课程来源的结果；旧独立测评或未绑定课程的历史记录不按今天的名单推断。固定 Bundle 仅报告声明的叶工具，不统计 Context 或 Profile。'}
}

/** Reuse original course/task ownership at the snapshot boundary; no result read. */
export async function assertTrainingGroupAccess(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, courseId: string, taskId?: string) {
  await authority(tx, actor, courseId, 'SHARE')
  if(taskId){
    const task=await tx.compositeAssessment.findFirst({where:{...authorizedTaskWhere(actor,courseId,true),id:taskId},select:{id:true,productKind:true,bundleInstance:true,items:{select:{id:true,type:true}}}})
    if(!task)unavailable()
    if(task.productKind==='ASSESSMENT_BUNDLE')trainingGroupLeafItems(task)
  }
}
/** Immutable accepted slot pointers can be checked without decrypting facts. */
export function trainingGroupSnapshotHash(row: any) {
  return hash({slotKey: row.slotKey, terminalState: row.terminalState, payloadKind: row.payloadKind, sourceType: row.sourceType ?? null,
    sourceAttemptId: row.sourceAttemptId ?? null, sourceSubmissionId: row.sourceSubmissionId ?? null, sourceDefinitionHash: row.sourceDefinitionHash ?? null,
    canonicalDigest: row.canonicalDigest ?? (row.canonicalResultEncrypted ? createHash('md5').update(row.canonicalResultEncrypted).digest('hex') : null), collectionDigest: row.collectionDigest ?? (row.collectionFactsEncrypted ? createHash('md5').update(row.collectionFactsEncrypted).digest('hex') : null), completedAt: iso(row.completedAt)})
}

export async function listTrainingGroupTasks(tx: Prisma.TransactionClient, actor: TrainingAnalysisActor, courseId: string) {
  await assertTrainingGroupAccess(tx, actor, courseId)
  const [composite,cognitive]=await Promise.all([
    tx.compositeAssessment.findMany({where: {...authorizedTaskWhere(actor, courseId, true), publishedAt: {not: null}}, select: {id: true, name: true}, orderBy: {publishedAt: 'desc'}, take: 100}),
    tx.cognitiveAssignment.findMany({where:{courseId,listedStandalone:true,status:{in:['PUBLISHED','ARCHIVED']},publishedAt:{not:null},resolvedConfigHash:{not:null},resolvedReportSnapshotEncrypted:{not:null},courseSnapshot:{path:['id'],equals:courseId},...(actor.role===UserRole.ADMIN?{}:{createdBy:actor.userId})},select:{id:true,title:true,status:true},orderBy:[{publishedAt:'desc'},{id:'desc'}],take:100}),
  ])
  return [...composite,...cognitive.map(row=>({id:trainingCognitiveGroupTaskKey(row.id),name:row.title+' · 独立认知'+(row.status==='ARCHIVED'?'（已归档，只读）':'')}))]
}

async function standaloneCognitiveGroupHeader(tx:Prisma.TransactionClient,actor:TrainingAnalysisActor,courseId:string,taskId:string,historical=false){
  await authority(tx,actor,courseId,'SHARE')
  const id=trainingCognitiveGroupAssignmentId(taskId)
  if(!id)unavailable()
  const assignment=await tx.cognitiveAssignment.findFirst({where:{id,courseId,listedStandalone:true,status:historical?{in:['PUBLISHED','ARCHIVED']}:'PUBLISHED',publishedAt:{not:null},...(actor.role===UserRole.ADMIN?{}:{createdBy:actor.userId})}})
  const report=readFrozenReport(assignment?.resolvedReportSnapshotEncrypted)
  if(!assignment?.resolvedConfigHash||!report||(assignment.courseSnapshot as {id?:string}|null)?.id!==courseId)unavailable()
  const contractHash=hash({id,courseId,publishedAt:iso(assignment.publishedAt),resolvedConfigHash:assignment.resolvedConfigHash,report})
  const tool={key:trainingCognitiveGroupTaskKey(assignment.id),kind:'COGNITIVE' as const,title:assignment.title,
    source:{taskId,taskName:assignment.title,publication:iso(assignment.publishedAt)!,configDigest:assignment.resolvedConfigHash,variantKey:null}}
  return {assignment,report,contractHash,tool}
}
const standaloneSessionHash=(row:{id:string;userId:string|null;participantKey:string;attemptNo:number;status:string;finishedAt:Date|string|null;resultDigest:string|null})=>hash({...row,finishedAt:iso(row.finishedAt)})
export interface TrainingStandaloneCognitiveBindings {kind:'COGNITIVE_ASSIGNMENT';contractHash:string;sessions:Array<{id:string;hash:string}>}

/** Tool selection reads the frozen assignment only, not participants/results. */
export async function trainingStandaloneCognitiveGroupTool(tx:Prisma.TransactionClient,actor:TrainingAnalysisActor,courseId:string,taskId:string){
  const {assignment,tool}=await standaloneCognitiveGroupHeader(tx,actor,courseId,taskId,true)
  return assignment.status==='PUBLISHED'?tool:null
}

/** Same creator/professional-report boundary as standalone Cognitive. No raw
 * trials, current roster join, live scoring or fake composite parent. */
export async function loadTrainingStandaloneCognitiveGroup(tx:Prisma.TransactionClient,actor:TrainingAnalysisActor,courseId:string,taskId:string){
  const {assignment,report,contractHash,tool}=await standaloneCognitiveGroupHeader(tx,actor,courseId,taskId)
  const rows=await tx.cognitiveSession.findMany({where:{assignmentId:assignment.id,compositeAttemptId:null,status:'COMPLETED',finishedAt:{not:null}},select:{id:true,userId:true,participantKey:true,attemptNo:true,status:true,finishedAt:true,resultSnapshotEncrypted:true},orderBy:[{finishedAt:'desc'},{id:'desc'}],take:TRAINING_ANALYSIS_SOURCE_LIMIT+1})
  if(rows.length>TRAINING_ANALYSIS_SOURCE_LIMIT)throw Object.assign(new Error('正式认知结果超过现有6000份来源上限'),{statusCode:413})
  const facts=trainingStandaloneCognitiveFacts({assignmentId:assignment.id,resolvedConfigHash:assignment.resolvedConfigHash!,report,sessions:selectLatestTrainingCognitiveSessions(assignment.id,rows).map(row=>({...row,finishedAt:row.finishedAt!,result:row.resultSnapshotEncrypted?parseCognitiveResultSnapshot(decryptCognitivePayload(row.resultSnapshotEncrypted)):null}))})
  if(!facts)return null
  const byId=new Map(rows.map(row=>[row.id,row]))
  const bindings:TrainingStandaloneCognitiveBindings={kind:'COGNITIVE_ASSIGNMENT',contractHash,sessions:facts.selected.map(row=>{const {resultSnapshotEncrypted,...metadata}=byId.get(row.id)!;return {id:row.id,hash:standaloneSessionHash({...metadata,resultDigest:resultSnapshotEncrypted?createHash('md5').update(resultSnapshotEncrypted).digest('hex'):null})}})}
  return {...facts,bindings,tool}
}

/** Frozen pointer verification only. New sessions never change an old snapshot. */
export async function readTrainingStandaloneCognitiveGroupArtifact(tx:Prisma.TransactionClient,actor:TrainingAnalysisActor,courseId:string,taskId:string,artifactId:string){
  const {assignment,contractHash}=await standaloneCognitiveGroupHeader(tx,actor,courseId,taskId,true)
  const artifact=await readTaskGroupArtifact(tx,{product:'TRAINING',containerId:courseId,taskId},artifactId)
  if(!artifact)return null
  const bindings=artifact.sourceBindings as TrainingStandaloneCognitiveBindings
  if(bindings.kind!=='COGNITIVE_ASSIGNMENT'||bindings.contractHash!==contractHash)invalid('原独立认知来源或纳入资格已变化，请生成更新版报告')
  const rows=bindings.sessions.length?await tx.$queryRaw<Array<{id:string;userId:string|null;participantKey:string;attemptNo:number;status:string;finishedAt:Date|null;resultDigest:string|null}>>`SELECT id,user_id AS "userId",participant_key AS "participantKey",attempt_no AS "attemptNo",status,finished_at AS "finishedAt",md5(result_snapshot_encrypted) AS "resultDigest" FROM cognitive_sessions WHERE id IN (${Prisma.join(bindings.sessions.map(row=>row.id))}) AND assignment_id=${assignment.id} AND composite_attempt_id IS NULL AND status='COMPLETED'`:[]
  const hashes=new Map(rows.map(row=>[row.id,standaloneSessionHash(row)]))
  if(hashes.size!==bindings.sessions.length||bindings.sessions.some(row=>hashes.get(row.id)!==row.hash))invalid('原独立认知快照的正式结果已变化，请生成更新版报告')
  return artifact
}
