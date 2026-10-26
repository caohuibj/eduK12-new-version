import {acceptedStudyReceipt,assertCurrentStudyPrincipal,type AcceptedStudyReceipt} from '../anonymous-study/admission-principal'
import { applyTrainingAttemptScope, hasTrainingVariantMetadata } from './training-variant-scope'
import {readTrainingTimingSnapshot,normalizeTrainingScaleTiming,type TrainingTimingSnapshot} from '../assessment-runtime/training-scale-timing'
import { withSharedControlContext, storeSharedWholeValidation, loadSharedWholeValidation } from '../assessment-runtime/shared-control-records'
import { compactAssessmentStorageEnabled } from '../assessment-runtime/compact-field-codec'
import { packWholeRawEnvelope, unpackWholeRawEnvelope } from '../assessment-runtime/compact-raw'
import { rememberWholeReportFeedbackHint, readWholeReportFeedbackHint, type ReportFeedbackProfile } from '../../services/reportFeedbackHints'
import { markAssessmentTimeline, assessmentTimelineSpan, traceAssessmentPhase, traceAssessmentPhaseSync } from '../../services/runtimeObservability'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { CompositeReportJob, Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { acceptsAsyncCompositeReport, assessmentReportConfig } from '../../config/assessmentReports'
import { finalScaleSubmitSchema } from '../../services/scale-final-submit.schema'
import { InstrumentFinalSubmitError, assertCanonicalSubmissionPayloadSize, prepareCanonicalSubmission } from '../../services/instrumentFinalSubmit'
import { withUnitSubmitAdmission } from '../../services/unitSubmitAdmission'
import { loadFrozenActiveSlotSet } from '../assessment-runtime/slot-set'
import { encryptUnifiedRuntimePayload, decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { admitWholeReceiptStorage, recordWholeReceiptStored, detachedWholeReceiptsEnabled } from '../assessment-runtime/whole-receipt-storage'
import { REPORT_PARENT_SELECT, storeWholeQuestionnaireValidation, registerWholeQuestionnaireReceipt, type WholeQuestionnaireReceipt, assertReportJobIdentity } from '../assessment-runtime/report-outbox.service'
import { UNIFIED_SCALE_CHILD_ADMISSION_SELECT, ensureScaleAdmissionAtDelivery, loadScaleAdmissionRuntime } from '../scale/scale-admission.service'
import { assertUnifiedScaleDelivery, submitUnifiedScaleAssessmentFinal, submitUnifiedScaleCollectionBatch } from '../scale/unified-final-submit.service'
import { preloadFrozenReferenceDb } from '../assessment-runtime/reference-binding'
import { runnerDefinition } from '../scale/scale-definition'
import {assertTrainingScaleCollectionAllowed} from '../scale/scale-collection-guard'

const encryptWholeRawPayload = (value: unknown): string => encryptUnifiedRuntimePayload(compactAssessmentStorageEnabled() ? packWholeRawEnvelope(value) : value)

const unitSchema = finalScaleSubmitSchema.omit({ submissionId: true, attemptEpoch: true, contextSnapshotHash: true })
  .extend({ itemId: z.string().min(1).max(200) })
export const wholeQuestionnaireSubmitSchema = z.object({
  submissionId: z.string().min(16).max(200), attemptEpoch: z.number().int().min(1),
  slotSetHash: z.string().regex(/^[a-f0-9]{64}$/), contextSnapshotHash: z.string().max(200).nullable(),
  units: z.array(unitSchema).min(1).max(32),
}).strict()
export type WholeQuestionnaireSubmitInput = z.infer<typeof wholeQuestionnaireSubmitSchema>
type Principal = { userId?: string; recoveryTokenHash?: string }
export type WholeReceiptExecution = { submissionId: string; payloadHash: string; leaseToken: string; acceptedAtMs: number; studyReceipt?:AcceptedStudyReceipt }
/** Invocation-scoped verified scientific data; never an authorization cache. */
export type WholeQuestionnaireReportContext = {
  attemptId: string; attemptEpoch: number; slotSetHash: string; contextHash: string | null;
  units: ReadonlyMap<string, { attemptEpoch: number; runtimeSnapshotEncrypted: string;
    runtime: Awaited<ReturnType<typeof loadScaleAdmissionRuntime>> }>;
  committed?: { submissionId: string; leaseToken: string;
    parent: Omit<WholeReportParent, 'scaleAssessments'> & { scaleAssessments: NonNullable<Awaited<ReturnType<typeof submitUnifiedScaleCollectionBatch>>>; cognitiveSessions: []; situationalAttempts: [] } };
}


const wholeParentSelect = {
  ...REPORT_PARENT_SELECT, userId: true, recoveryTokenHash: true,
  trainingTimingSnapshot: true, participantKey: true, trainingVariantAllocationEncrypted: true, trainingFlowSnapshotEncrypted:true,trainingFlowSnapshotHash:true,trainingFlowPathEncrypted:true,trainingFlowPathHash:true,trainingVariantAllocationHash:true,
  contextSnapshotEncrypted: true, frozenActiveSlotSetEncrypted: true,
  compositeAssessment: { select: { id: true, productKind: true, reportPackageKey: true, analysisProtocolKey: true,
    publishedAt: true, trainingVariantDraft: true, trainingVariantFrozen: true, trainingFlowDraft:true,trainingFlowFrozen:true,trainingFlowDigest:true,trainingVariantDigest:true,
    items: true, formSections: { include: {items: true} } } },
  scaleAssessments: { select: { ...UNIFIED_SCALE_CHILD_ADMISSION_SELECT,
    scale: { select: { ...UNIFIED_SCALE_CHILD_ADMISSION_SELECT.scale.select, instruction: true } } } },
} as const
// Worker-only superset: a single read supplies frozen admission, aggregate
// metadata and collection rendering. Both paths include frozen variant binding.
export const wholeReportParentSelect = {
  ...wholeParentSelect, anonymousCode: true, totalTime: true, startedAt: true,
  compositeAssessmentId:true,trainingContentBinding:true,trainingContentBindingHash:true,
  trainingReferenceBinding:true,trainingReferenceBindingHash:true,
  trainingContentInterpretationEncrypted:true,trainingContentInterpretationHash:true,
  formSectionAttempts: {select:{sectionId:true,attemptEpoch:true,status:true,taskSatisfaction:true}},
  completedItems: true, compiledBundleRuntimeHash: true,
  formAnswers: { select: { itemId: true, value: true } },
  compositeAssessment: { select: {
    id: true, name: true, createdBy:true, productKind: true, reportPackageKey: true, analysisProtocolKey: true,
    publishedAt: true, trainingVariantDraft: true, trainingVariantFrozen: true, trainingFlowDraft:true,trainingFlowFrozen:true,trainingFlowDigest:true,trainingVariantDigest:true,
    reportPackageVersion: true, reportPackageProfile: true, reportPackageSnapshotEncrypted: true,
    items: { orderBy: { position: 'asc' }, include: {
      scale: { select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true } },
    } },
    formSections: { orderBy: { position: 'asc' }, select: {
      id: true, title: true, description: true, position: true, contextSection: true,
      items: { orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }], select: {
        id: true, formType: true, formLabel: true, formPlaceholder: true, formOptions: true, formDefinition: true, formPolicy: true,
        contextKey: true, required: true, position: true, formSectionPosition: true,
      } },
    } },
  } },
} satisfies Prisma.CompositeAssessmentAttemptSelect
type WholeReportParent = Prisma.CompositeAssessmentAttemptGetPayload<{ select: typeof wholeReportParentSelect }>

/** Keep the verified full publication in the internal committed carrier. Each
 * later shallow copy can then revalidate allocation/union identity rather than
 * treating an in-memory scope field as authority. Participant DTOs still use
 * loadParent's selected projection. */
export const copyWholeCommittedReportParent = (parent: WholeReportParent,
  scaleAssessments: NonNullable<Awaited<ReturnType<typeof submitUnifiedScaleCollectionBatch>>>) => ({
  ...parent, scaleAssessments, cognitiveSessions: [] as [], situationalAttempts: [] as [],
})

const failure = (message: string, status = 409) => new InstrumentFinalSubmitError('STALE_ATTEMPT', message, status)
const loadParent = async (attemptId: string, principal: Principal, preloaded?: WholeReportParent, receipt?:AcceptedStudyReceipt) => {
  const loaded = preloaded ?? await prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, select: wholeParentSelect })
  if (!loaded) throw failure('问卷作答不存在', 404)
  let parent = loaded
  const owned = principal.userId ? parent.userId === principal.userId
    : parent.userId === null && Boolean(principal.recoveryTokenHash && parent.recoveryTokenHash === principal.recoveryTokenHash)
  const accepted=receipt && await assertCurrentStudyPrincipal(prisma,{attemptId,userId:principal.userId,recoveryTokenHash:principal.recoveryTokenHash,attemptEpoch:parent.attemptEpoch,receipt})
  if (!accepted && !owned) throw failure('无权限操作此问卷', 403)
  if(parent.trainingFlowSnapshotHash!=null||parent.compositeAssessment.trainingFlowFrozen!=null)throw failure('条件流程必须按当前工具逐项提交')
  parent = await applyTrainingAttemptScope(parent) as typeof loaded
  if (parent.asyncReportEpoch !== parent.attemptEpoch && !acceptsAsyncCompositeReport(parent)) throw failure('此问卷尚未启用整份交卷')
  if (!parent.frozenActiveSlotSetEncrypted || !parent.frozenActiveSlotSetHash) throw failure('问卷冻结内容缺失')
  const frozen = await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted)
  if (frozen.snapshotHash !== parent.frozenActiveSlotSetHash || frozen.attemptEpoch !== parent.attemptEpoch) throw failure('问卷冻结版本已改变')
  // Cognitive and situational tasks retain their own timed delivery protocols.
  if (frozen.slots.some(slot => slot.required && !['SCALE', 'FORM_SECTION'].includes(slot.unitType))) throw failure('整份交卷仅适用于量表问卷')
  const slots = frozen.slots.filter(slot => slot.required && slot.unitType === 'SCALE')
  if (!slots.length || slots.length > 32) throw failure('整份交卷的量表数量无效')
  const children = (await Promise.all(slots.map(async slot => {
    const child = parent.scaleAssessments.find(row => row.compositeItemId === slot.sourceBinding.compositeItemId)
    if (!child || child.attemptEpoch !== parent.attemptEpoch || child.runtimeGeneration !== 'UNIFIED_V1') throw failure('量表冻结记录不完整')
    const runtime = (await loadScaleAdmissionRuntime(child))
    if (!runtime.compiledRuntime.runtimeCapabilities.aggregateEligible || runtime.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash || runtime.instrumentKey !== slot.sourceDefinitionIdentity.key
      || runtime.instrumentVersion !== slot.sourceDefinitionIdentity.version || runtime.compiledRuntime.compiledRuntimeHash !== slot.sourceBinding.compiledRuntimeHash) throw failure('量表冻结绑定已改变')
    return { slot, child, runtime }
  })))
  return { parent, frozen, children }
}

type WholeRuleItem = { itemCode: string; required: boolean; values: Array<string | number> }
type WholeRules = { hash: string; definitionHash: string; items: WholeRuleItem[];
  byItem: Map<string, { required: boolean; values: Set<string> }>; bytes: number }
const wholeRules = new Map<string, WholeRules>()
let wholeRulesBytes = 0
const MAX_WHOLE_RULES = 128, MAX_WHOLE_RULE_BYTES = 8 * 1024 * 1024
const compileWholeRules = (definitionHash: string, items: WholeRuleItem[]): WholeRules => {
  const canonical = prepareCanonicalSubmission({ definitionHash, items })
  const known = wholeRules.get(canonical.hash)
  if (known) return known
  const frozenItems = items.map(item => Object.freeze({ ...item, values: Object.freeze([...item.values]) as unknown as Array<string | number> }))
  const plan: WholeRules = { hash: canonical.hash, definitionHash, items: Object.freeze(frozenItems) as unknown as WholeRuleItem[],
    byItem: new Map(items.map(item => [item.itemCode, { required: item.required,
      values: new Set(item.values.map(value => typeof value + ':' + String(value))) }])), bytes: canonical.bytes }
  if (plan.bytes > MAX_WHOLE_RULE_BYTES) return plan
  while (wholeRules.size >= MAX_WHOLE_RULES || wholeRulesBytes + plan.bytes > MAX_WHOLE_RULE_BYTES) {
    const oldest = wholeRules.keys().next().value!
    wholeRulesBytes -= wholeRules.get(oldest)!.bytes; wholeRules.delete(oldest)
  }
  wholeRules.set(plan.hash, plan); wholeRulesBytes += plan.bytes
  return plan
}
export const clearWholeValidationRulesForTest = () => {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test-only rule-cache reset')
  wholeRules.clear(); wholeRulesBytes = 0
}
const rulesFor = (unit: WholeValidationManifest['units'][number]): WholeRules => {
  const plan = unit.rulesHash ? wholeRules.get(unit.rulesHash) : unit.items ? compileWholeRules(unit.definitionHash, unit.items) : undefined
  if (!plan || plan.definitionHash !== unit.definitionHash) throw failure('冻结的整卷校验规则不可用')
  return plan
}
const ensureWholeRules = async (attemptId: string, principal: Principal, manifest: WholeValidationManifest,
  verifiedParent?: Awaited<ReturnType<typeof loadParent>>) => {
  if (manifest.schemaVersion !== 2 || manifest.units.every(unit => Boolean(unit.items || (unit.rulesHash && wholeRules.has(unit.rulesHash))))) return
  // Redis/local-cache loss is harmless: reconstruct once from the persisted,
  // frozen admissions and validate every rule hash. Never require resubmission.
  const { parent, children } = verifiedParent ?? await loadParent(attemptId, principal)
  assertReportJobIdentity(parent, manifest.binding)
  for (const unit of manifest.units) {
    if (unit.items) continue
    const found = children.find(({ child }) => child.id === unit.assessmentId && child.compositeItemId === unit.itemId)
    if (!found || found.runtime.legacyDefinitionHash !== unit.definitionHash) throw failure('整卷校验规则冻结绑定冲突')
    const sets = new Map(found.runtime.definition.responseSets.map(set => [set.key, set.options.map(option => option.value)]))
    const plan = compileWholeRules(unit.definitionHash, found.runtime.definition.items.map(item => ({
      itemCode: item.itemCode, required: Boolean(item.required), values: sets.get(item.responseSetKey)!,
    })))
    if (plan.hash !== unit.rulesHash) throw failure('整卷校验规则内容哈希冲突')
  }
}

/** Delivery only: freeze each admission once, before collecting any answers. */
export const getWholeQuestionnaireDefinition = async (attemptId: string, principal: Principal) => withSharedControlContext(async () => {
  if (!assessmentReportConfig().wholeSubmitEnabled) throw failure('整份交卷入口暂未开启')
  const { parent, children, frozen } = await loadParent(attemptId, principal)
  if (parent.status !== 'IN_PROGRESS') throw failure('问卷已结束')
  const units = []
  const manifest: WholeValidationManifest = { schemaVersion: process.env.ASSESSMENT_WHOLE_COMPACT_MANIFEST_ENABLED === 'true' ? 2 : 1, binding: { attemptId: parent.id, attemptEpoch: parent.attemptEpoch,
    slotSetHash: parent.frozenActiveSlotSetHash!, contextHash: parent.contextSnapshotHash, userId: parent.userId, recoveryTokenHash: parent.recoveryTokenHash },
    requiredFormSlots: frozen.slots.filter(slot => slot.required && slot.unitType === 'FORM_SECTION').map(slot => slot.slotKey), units: [] }
  for (const { child, runtime } of children) {
    if (child.status !== 'IN_PROGRESS') throw failure('已分量表交卷，不能改为整份交卷')
    const admission = await ensureScaleAdmissionAtDelivery(child.id, parent, child)
    await assertUnifiedScaleDelivery({ assessmentId: child.id, compositeAttemptId: attemptId, submissionId: 'whole-delivery-validation',
      attemptEpoch: parent.attemptEpoch, definitionHash: runtime.legacyDefinitionHash, contextSnapshotHash: parent.contextSnapshotHash, answers: [], ...principal }, child, admission, runtime)
    const sets = new Map(runtime.definition.responseSets.map(set => [set.key, set.options.map(option => option.value)]))
    const ruleItems = runtime.definition.items.map(item => ({ itemCode: item.itemCode, required: Boolean(item.required), values: sets.get(item.responseSetKey)! }))
    const compiled = manifest.schemaVersion === 2 ? compileWholeRules(runtime.legacyDefinitionHash, ruleItems) : null
    const rule = compiled && wholeRules.has(compiled.hash) ? { rulesHash: compiled.hash } : { items: ruleItems }
    manifest.units.push({ itemId: child.compositeItemId!, assessmentId: child.id, definitionHash: runtime.legacyDefinitionHash,
      ...(admission.trainingTiming ? {trainingTiming:admission.trainingTiming} : {}),
      admissionHash: admission.snapshotHash, deadlineMs: admission.schemaVersion === 2 && admission.scalePolicy?.deployment?.completionDeadline
        ? Date.parse(admission.scalePolicy.deployment.completionDeadline) : null,
      ...rule })
    units.push({ itemId: child.compositeItemId!, scaleAssessmentId: child.id, definitionHash: runtime.legacyDefinitionHash,
      presentationMode: runtime.measurementPresentation?.presentationMode ?? 'ONE_BY_ONE',
      ...(admission.trainingTiming ? {trainingTiming:admission.trainingTiming} : {}),
      scale: { id: child.scale.id, name: child.scale.name, instruction: child.scale.instruction, instrumentVersion: child.scale.instrumentVersion,
        definition: runnerDefinition(runtime.definition) } })
  }
  const positions = new Map(parent.compositeAssessment.items.map(item => [item.id, item.position]))
  units.sort((left, right) => (positions.get(left.itemId) ?? 0) - (positions.get(right.itemId) ?? 0))
  await storeWholeQuestionnaireValidation(parent, await storeSharedWholeValidation(manifest), prepareCanonicalSubmission(manifest).hash)
  return { attemptId, attemptEpoch: parent.attemptEpoch, slotSetHash: parent.frozenActiveSlotSetHash,
    contextSnapshotHash: parent.contextSnapshotHash, units }
})

const logicalPayload = (attemptId: string, input: WholeQuestionnaireSubmitInput, timingSnapshotHash?:string) => ({
  ...(timingSnapshotHash ? {trainingTimingSnapshotHash:timingSnapshotHash} : {}),
  attemptId, attemptEpoch: input.attemptEpoch, slotSetHash: input.slotSetHash, contextSnapshotHash: input.contextSnapshotHash,
  units: [...input.units].sort((a, b) => a.itemId.localeCompare(b.itemId)).map(unit => ({ ...unit,
    answers: [...unit.answers].sort((a, b) => a.itemCode.localeCompare(b.itemCode)) })),
})
const childSubmissionId = (submissionId: string, itemId: string) => 'whole-' + createHash('sha256').update(submissionId + '/' + itemId).digest('hex')
const receiptResponse = (attemptId: string, submissionId: string, payloadHash: string, acceptedAt: Date, replayed: boolean, feedbackPollProfile: ReportFeedbackProfile = 'QUEUED') => ({
  attemptId, submissionId, payloadHash, acceptedAt, committedAt: new Date(), replayed,
  status: 'ACCEPTED' as const, hasAcceptedSubmission: true, feedbackPollProfile,
  reportStatus: { state: 'PENDING', retryAfterSeconds: feedbackPollProfile === 'FAST_START' ? 0.25 : 2 },
})

type WholeSubmissionHeader = Prisma.CompositeAssessmentAttemptGetPayload<{
  select: typeof REPORT_PARENT_SELECT & { userId: true; recoveryTokenHash: true };
}> & { consentId: string | null;trainingTimingSnapshot:unknown;hasStandardCombination:boolean;
  trainingVariantAllocationEncrypted: string | null; trainingVariantAllocationHash: string | null;
  compositeAssessment: { trainingVariantDraft: unknown; trainingVariantFrozen: unknown; trainingVariantDigest: string | null } }
/** One fresh read of ownership, product eligibility and the current receipt. */
const loadWholeSubmissionContext = async (attemptId: string) => {
  const rows = await prisma.$queryRaw<Array<Omit<WholeSubmissionHeader, 'compositeAssessment'> & {
    productKind: WholeSubmissionHeader['compositeAssessment']['productKind'];
    reportPackageKey: string | null; analysisProtocolKey: string | null;
    trainingFlowDraft: Prisma.JsonValue;trainingFlowFrozen:Prisma.JsonValue;trainingFlowDigest:string|null;
    trainingVariantDraft: unknown; trainingVariantFrozen: unknown; trainingVariantDigest: string | null;
    jobId: string | null; jobStatus: string | null; leaseToken: string | null;
    wholeSubmissionId: string | null; wholePayloadHash: string | null; wholeAcceptedAt: Date | null;
    wholeValidationEncrypted: string | null; wholeValidationHash: string | null;
  }>>`
    SELECT parent."id" AS "id",
      parent."status" AS "status",
      parent."progress" AS "progress",
      parent."completed_at" AS "completedAt",
      parent."attempt_epoch" AS "attemptEpoch",
      parent."async_report_epoch" AS "asyncReportEpoch",
      parent."delivery_mode" AS "deliveryMode",
      parent."runtime_generation" AS "runtimeGeneration",
      parent."frozen_active_slot_set_hash" AS "frozenActiveSlotSetHash",
      parent."context_snapshot_hash" AS "contextSnapshotHash",
      parent."aggregate_input_hash" AS "aggregateInputHash",
      parent."assignment_ref" AS "assignmentRef", parent."consent_id" AS "consentId",
      parent."delivery_course_id" AS "deliveryCourseId",
      parent."training_timing_snapshot" AS "trainingTimingSnapshot",
      parent."training_flow_snapshot_encrypted" AS "trainingFlowSnapshotEncrypted", parent."training_flow_snapshot_hash" AS "trainingFlowSnapshotHash",
      parent."training_flow_path_encrypted" AS "trainingFlowPathEncrypted", parent."training_flow_path_hash" AS "trainingFlowPathHash",
      parent."training_variant_allocation_encrypted" AS "trainingVariantAllocationEncrypted",
      parent."training_variant_allocation_hash" AS "trainingVariantAllocationHash",
      (EXISTS(SELECT 1 FROM composite_assessment_items i WHERE i.composite_assessment_id=product.id AND i.standard_combination_source IS NOT NULL)
       OR jsonb_path_exists(COALESCE(parent.training_content_binding,'{}'::jsonb),'$.units[*].source.standardCombination')) AS "hasStandardCombination",
      parent."user_id" AS "userId",
      parent."recovery_token_hash" AS "recoveryTokenHash",
      product."product_kind" AS "productKind", product."report_package_key" AS "reportPackageKey",
      product."analysis_protocol_key" AS "analysisProtocolKey",
      product."training_variant_draft" AS "trainingVariantDraft",
      product."training_variant_frozen" AS "trainingVariantFrozen",
      product."training_variant_digest" AS "trainingVariantDigest",
      product."training_flow_draft" AS "trainingFlowDraft", product."training_flow_frozen" AS "trainingFlowFrozen", product."training_flow_digest" AS "trainingFlowDigest",
      job."id" AS "jobId", job."status" AS "jobStatus", job."lease_token" AS "leaseToken",
      job."whole_submission_id" AS "wholeSubmissionId", job."whole_payload_hash" AS "wholePayloadHash",
      job."whole_accepted_at" AS "wholeAcceptedAt",
      job."whole_validation_encrypted" AS "wholeValidationEncrypted", job."whole_validation_hash" AS "wholeValidationHash"
    FROM "composite_assessment_attempts" AS parent
    JOIN "composite_assessments" AS product ON product."id" = parent."composite_assessment_id"
    LEFT JOIN "composite_report_jobs" AS job ON job."attempt_id" = parent."id" AND job."attempt_epoch" = parent."attempt_epoch"
    WHERE parent."id" = ${attemptId}
  `
  const row = rows[0]
  if (!row) return null
  const parent: WholeSubmissionHeader = { ...row, compositeAssessment: {
    productKind: row.productKind, reportPackageKey: row.reportPackageKey, analysisProtocolKey: row.analysisProtocolKey,
    trainingFlowDraft:row.trainingFlowDraft,trainingFlowFrozen:row.trainingFlowFrozen,trainingFlowDigest:row.trainingFlowDigest,
    trainingVariantDraft: row.trainingVariantDraft, trainingVariantFrozen: row.trainingVariantFrozen, trainingVariantDigest: row.trainingVariantDigest,
  } }
  const prior: WholeQuestionnaireReceipt | null = row.jobId ? {
    id: row.jobId, status: row.jobStatus!, leaseToken: row.leaseToken, wholeSubmissionId: row.wholeSubmissionId,
    wholePayloadHash: row.wholePayloadHash, wholeAnswersEncrypted: null, wholeAcceptedAt: row.wholeAcceptedAt,
    wholeValidationEncrypted: row.wholeValidationEncrypted, wholeValidationHash: row.wholeValidationHash,
  } : null
  return { parent, prior }
}

/** One HTTP body, one durable encrypted answer envelope, one transactional job. */
export const submitWholeQuestionnaire = async (attemptId: string, input: WholeQuestionnaireSubmitInput, principal: Principal,
  receivedAtMs = Date.now()) => {
  const admissionStarted = process.hrtime.bigint()
  return withUnitSubmitAdmission(async () => {
  assessmentTimelineSpan('whole.admission_wait', admissionStarted)
  const context = await traceAssessmentPhase('whole.owner_header_query', () => loadWholeSubmissionContext(attemptId))
  const parent = context?.parent
  if (!parent) throw failure('问卷作答不存在', 404)
  const owned = principal.userId ? parent.userId === principal.userId
    : parent.userId === null && Boolean(principal.recoveryTokenHash && parent.recoveryTokenHash === principal.recoveryTokenHash)
  if (!owned) throw failure('无权限操作此问卷', 403)
  if (process.env.ASSESSMENT_WHOLE_REQUEST_CONTEXT_REUSE_ENABLED === 'true' && principal.userId) {
    // The shared fresh header is read INSIDE the existing submit admission.
    // Consent remains live; no middleware preloads heavy receipt data before it.
    const { relationalRuntimeConsentAuthority } = await import('../assessment-relational/runtime-consent')
    await relationalRuntimeConsentAuthority.assertCompositeFinal(attemptId, principal.userId, parent)
  }
  if (input.attemptEpoch !== parent.attemptEpoch || input.slotSetHash !== parent.frozenActiveSlotSetHash
    || input.contextSnapshotHash !== parent.contextSnapshotHash) throw failure('交卷版本与当前问卷不匹配')
  // A cached validation manifest is scientific data, never allocation authority.
  // Check all partial markers before receipt replay or registration; ordinary
  // questionnaires retain their single-header fast path.
  const verifiedParent = hasTrainingVariantMetadata(parent)
    ? await traceAssessmentPhase('whole.variant_scope', () => loadParent(attemptId, principal)) : undefined
  if (verifiedParent) {
    if (!hasTrainingVariantMetadata(verifiedParent.parent)) throw failure('概率分卷冻结来源已改变')
    assertReportJobIdentity(verifiedParent.parent, { attemptEpoch: parent.attemptEpoch,
      slotSetHash: parent.frozenActiveSlotSetHash!, contextHash: parent.contextSnapshotHash })
  }
  const timingSnapshot=readTrainingTimingSnapshot(parent.trainingTimingSnapshot)
  if(timingSnapshot&&timingSnapshot.attemptEpoch!==parent.attemptEpoch)throw failure('计时冻结版本不匹配')
  const timingSnapshotHash=timingSnapshot?.snapshotHash
  const canonical = traceAssessmentPhaseSync('whole.payload_hash', () => prepareCanonicalSubmission(logicalPayload(attemptId, input,timingSnapshotHash)))
  assertCanonicalSubmissionPayloadSize(canonical, 1536 * 1024, '整份问卷')
  const prior = context!.prior
  if (prior?.wholeSubmissionId) {
    if (prior.wholeSubmissionId !== input.submissionId || prior.wholePayloadHash !== canonical.hash) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '已收到不同的整份交卷内容', 409)
    return receiptResponse(attemptId, input.submissionId, canonical.hash, prior.wholeAcceptedAt!, true, readWholeReportFeedbackHint(attemptId, input.submissionId).profile)
  }
  const settings = assessmentReportConfig()
  if (!settings.wholeSubmitEnabled || (!settings.enabled && parent.asyncReportEpoch !== parent.attemptEpoch)) {
    throw new InstrumentFinalSubmitError('INSTRUMENT_NOT_AVAILABLE', '整卷接收暂时暂停，本机封存答案已保留；稍后可用原交卷标识继续确认。', 503)
  }
  if (parent.asyncReportEpoch !== parent.attemptEpoch && !acceptsAsyncCompositeReport(parent)) throw failure('此问卷尚未启用整份交卷')
  if (parent.status !== 'IN_PROGRESS' || !prior?.wholeValidationEncrypted || !prior.wholeValidationHash) throw failure('问卷尚未完整交付或已结束')
  await traceAssessmentPhase('whole.storage_admission', admitWholeReceiptStorage)
  const manifest = await traceAssessmentPhase('whole.manifest_decrypt', () => loadSharedWholeValidation<WholeValidationManifest>(prior.wholeValidationEncrypted!))
  if ((manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) || prepareCanonicalSubmission(manifest).hash !== prior.wholeValidationHash
    || manifest.binding.attemptId !== parent.id || manifest.binding.attemptEpoch !== parent.attemptEpoch
    || manifest.binding.slotSetHash !== parent.frozenActiveSlotSetHash || manifest.binding.contextHash !== parent.contextSnapshotHash
    || manifest.binding.userId !== parent.userId || manifest.binding.recoveryTokenHash !== parent.recoveryTokenHash) throw failure('问卷交付校验与当前作答绑定不匹配')
  if(manifest.units.some(unit=>unit.trainingTiming?.snapshotHash!==timingSnapshotHash))throw failure('计时策略与整卷准入不匹配')
  await traceAssessmentPhase('whole.validation_rules_resolve', () => ensureWholeRules(attemptId, principal, manifest, verifiedParent))
  const prepared = traceAssessmentPhaseSync('whole.integrity_check', () => prepareFromWholeManifest(input, manifest, principal, receivedAtMs))
  const encrypted = traceAssessmentPhaseSync('whole.envelope_encrypt', () => encryptWholeRawPayload({ schemaVersion: 1, binding: { attemptId, attemptEpoch: input.attemptEpoch,
    slotSetHash: input.slotSetHash, contextHash: input.contextSnapshotHash }, payloadHash: canonical.hash,
    ...(timingSnapshotHash?{timingSnapshotHash}:{}),units: prepared }))
  const receipt = await registerWholeQuestionnaireReceipt(parent, {
    submissionId: input.submissionId, payloadHash: canonical.hash, answersEncrypted: encrypted, acceptedAt: new Date(receivedAtMs),
    requiredFormSlots: manifest.requiredFormSlots, validationHash: prior.wholeValidationHash,
  },parent.hasStandardCombination?async tx=>{
    const children=await tx.assessment.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,
      compositeItemId:{in:prepared.map(unit=>unit.itemId)}},select:{scaleId:true,compositeItemId:true}})
    if(children.length!==prepared.length)throw failure('整卷工具来源已变化')
    await assertTrainingScaleCollectionAllowed(tx,children.map(child=>child.scaleId),{compositeAttemptId:parent.id,compositeItemIds:children.map(child=>child.compositeItemId!)})
  }:undefined)
  const feedback = rememberWholeReportFeedbackHint(attemptId, input.submissionId, detachedWholeReceiptsEnabled() && !receipt.replayed ? recordWholeReceiptStored() : receipt.queueDepth)
  return receiptResponse(attemptId, input.submissionId, canonical.hash, receipt.acceptedAt, receipt.replayed, feedback.profile)
})
}

/** Consumes only the committed envelope; a crash replays the same child ids. */
export const processWholeQuestionnaireAnswers = async (job: CompositeReportJob,
  onVerifiedContext?: (context: WholeQuestionnaireReportContext) => void,
): Promise<boolean> => withSharedControlContext(async () => {
  const receipt = job
  if (!receipt.wholeSubmissionId) return false
  if (!job.leaseToken || receipt.status !== 'PROCESSING' || !receipt.wholeAnswersEncrypted || !receipt.wholeAcceptedAt) throw failure('整份交卷处理租约已改变')
  const execution: WholeReceiptExecution = { submissionId: receipt.wholeSubmissionId, payloadHash: receipt.wholePayloadHash!, leaseToken: job.leaseToken, acceptedAtMs: receipt.wholeAcceptedAt.getTime() }
  const envelope = unpackWholeRawEnvelope(decryptUnifiedRuntimePayload<{ schemaVersion: number; binding: { attemptId: string; attemptEpoch: number; slotSetHash: string; contextHash: string | null };
    timingSnapshotHash?:string; payloadHash: string; units: Array<Parameters<typeof submitUnifiedScaleAssessmentFinal>[0] & { itemId: string }> }>(receipt.wholeAnswersEncrypted))
  if (envelope.schemaVersion !== 1 || envelope.binding.attemptId !== job.attemptId || envelope.binding.attemptEpoch !== job.attemptEpoch
    || envelope.binding.slotSetHash !== job.slotSetHash || envelope.binding.contextHash !== job.contextHash
    || envelope.payloadHash !== receipt.wholePayloadHash || prepareCanonicalSubmission(logicalPayload(job.attemptId, { submissionId: receipt.wholeSubmissionId,
      attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextSnapshotHash: job.contextHash,
      units: envelope.units.map(unit => ({ itemId: unit.itemId, definitionHash: unit.definitionHash, answers: unit.answers,
        ...(unit.itemTimings!==undefined ? {itemTimings:unit.itemTimings} : {}),
        ...(unit.deviceInputProvenance ? { deviceInputProvenance: unit.deviceInputProvenance } : {}) })) },envelope.timingSnapshotHash)).hash !== receipt.wholePayloadHash) throw failure('整份答案封存内容无法验证')
  execution.studyReceipt=await acceptedStudyReceipt(job,envelope)
  const principal = envelope.units[0]?.userId ? { userId: envelope.units[0].userId } : { recoveryTokenHash: envelope.units[0]?.recoveryTokenHash }
  const reuseCommitted = process.env.ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED === 'true'
  const { parent, children, frozen, reportParent } = await traceAssessmentPhase('report.frozen_context_load', async () => {
    const reportParent = reuseCommitted ? await prisma.compositeAssessmentAttempt.findUnique({
      where: { id: job.attemptId }, select: wholeReportParentSelect,
    }) : undefined
    const loaded = await loadParent(job.attemptId, principal, reportParent ?? undefined, execution.studyReceipt)
    return { ...loaded, reportParent: reportParent ?? undefined }
  })
  assertReportJobIdentity(parent, { attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash })
  if (children.length !== envelope.units.length) throw failure('整份交卷单元数量不匹配')
  const referenceDb = await traceAssessmentPhase('report.reference_batch', () => preloadFrozenReferenceDb(prisma as any, children.map(({ runtime }) => ({
    instrumentType: 'SCALE' as const, instrumentKey: runtime.instrumentKey, bindings: runtime.referenceBindings,
  }))))
  const childrenById = new Map(children.map(candidate => [candidate.child.id, candidate]))
  const units = envelope.units.map(unit => {
    const bound = childrenById.get(unit.assessmentId)
    if (!bound || bound.child.compositeItemId !== unit.itemId
      || unit.submissionId !== childSubmissionId(receipt.wholeSubmissionId!, unit.itemId)) throw failure('整份交卷单元身份不匹配')
    return { input: unit, child: bound.child }
  })
  let committedScales: Awaited<ReturnType<typeof submitUnifiedScaleCollectionBatch>> = null
  if (process.env.ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED === 'true') {
    committedScales = await traceAssessmentPhase('report.units_batch', () => submitUnifiedScaleCollectionBatch(job, units, execution, referenceDb))
  } else {
    for (const unit of units) await traceAssessmentPhase('report.unit',
      () => submitUnifiedScaleAssessmentFinal(unit.input, unit.child, execution, referenceDb), unit.input.itemId)
  }
  onVerifiedContext?.({ attemptId: job.attemptId, attemptEpoch: job.attemptEpoch,
    slotSetHash: job.slotSetHash, contextHash: job.contextHash,
    // Type-driven, not tied to the eight-scale fixture. Unsupported optional
    // cognitive/situational modules and any replay retain database recovery.
    ...(reportParent && reportParent.status === 'IN_PROGRESS' && committedScales
      && frozen.slots.every(slot => ['SCALE', 'FORM_SECTION'].includes(slot.unitType))
      && parent.compositeAssessment.items.every(item => ['SCALE', 'FORM'].includes(item.type))
      ? { committed: { submissionId: execution.submissionId, leaseToken: execution.leaseToken,
          parent: copyWholeCommittedReportParent(reportParent, committedScales) } } : {}),
    units: new Map(children.map(({ child, runtime }) => [child.id, { attemptEpoch: child.attemptEpoch,
      runtimeSnapshotEncrypted: child.runtimeSnapshotEncrypted!, runtime }])) })
  return true
})

type WholeValidationManifest = {
  schemaVersion: 1 | 2;
  binding: { attemptId: string; attemptEpoch: number; slotSetHash: string; contextHash: string | null;
    userId: string | null; recoveryTokenHash: string | null };
  requiredFormSlots: string[];
  units: Array<{ itemId: string; assessmentId: string; definitionHash: string; admissionHash: string;
    trainingTiming?: TrainingTimingSnapshot; deadlineMs: number | null; rulesHash?: string; items?: WholeRuleItem[] }>;
}
const responseKey = (value: string | number) => typeof value + ':' + String(value)
const prepareFromWholeManifest = (input: WholeQuestionnaireSubmitInput, manifest: WholeValidationManifest, principal: Principal, receivedAtMs: number) => {
  if (input.units.length !== manifest.units.length || new Set(input.units.map(unit => unit.itemId)).size !== input.units.length) throw failure('问卷量表缺失或重复', 400)
  const timingEntries=input.units.flatMap(unit=>Object.entries(unit.itemTimings??{}))
  if(timingEntries.length>3000||Buffer.byteLength(JSON.stringify(timingEntries),'utf8')>400000)throw failure('整卷计时超过3000题或400KB预算',400)
  const prepared = []
  for (const unit of manifest.units) {
    const sent = input.units.find(candidate => candidate.itemId === unit.itemId)
    if (!sent || sent.definitionHash !== unit.definitionHash || (unit.deadlineMs !== null && receivedAtMs > unit.deadlineMs)) throw failure('量表冻结版本或完成期限不匹配')
    const plan = rulesFor(unit)
    const items = plan.byItem
    const answers = new Map<string, typeof sent.answers[number]>()
    for (const answer of sent.answers) {
      const item = items.get(answer.itemCode)
      if (!item || answers.has(answer.itemCode) || !item.values.has(responseKey(answer.responseValue))) {
        throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '问卷答案包含重复题目、未知题目或无效选项', 400)
      }
      answers.set(answer.itemCode, answer)
    }
    if (plan.items.some(item => item.required && !answers.has(item.itemCode))) throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT', '问卷有必答题未完成', 409)
    normalizeTrainingScaleTiming(unit.trainingTiming,plan.items.map(item=>item.itemCode),[...answers.keys()],sent.itemTimings)
    prepared.push({ ...sent, assessmentId: unit.assessmentId, compositeAttemptId: manifest.binding.attemptId,
      submissionId: childSubmissionId(input.submissionId, unit.itemId), attemptEpoch: input.attemptEpoch,
      contextSnapshotHash: input.contextSnapshotHash, ...principal,
      answers: plan.items.flatMap(item => answers.has(item.itemCode) ? [answers.get(item.itemCode)!] : []) })
  }
  return prepared
}
