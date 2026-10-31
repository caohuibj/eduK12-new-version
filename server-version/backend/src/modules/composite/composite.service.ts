import {readEducationCognitiveProfilePin,readEducationCognitiveAssignmentArtifact} from '../assessment-authorization/education-cognitive-profile-binding'
import {readTrainingCognitiveTaskBinding,loadPinnedTrainingCognitiveProfile} from '../assessment-authorization/training-cognitive-profile-use'
import {assertCognitiveAssignmentFreeze} from '../assessment-authorization/cognitive-profile-assignment'
import {readEducationStandardStartSources} from '../education-tools/public-source.standard'
import {freezeExactStandardScaleDefinition} from './training-standard-combination'
import {readVerifiedEducationStart,readVerifiedCompositionStart,readVerifiedLongitudinalEducationAttempt,bindVerifiedEducationAttempt,type VerifiedEducationStart,type VerifiedEducationAttempt} from '../assessment-run/education-start-context'
import {readVerifiedFieldStart,fieldCompositionBinding,type VerifiedFieldStart} from '../huiteacher/fieldComposition.contract'
import {resolveEducationAssessmentSituationalItems} from '../education-tools/assessment-resource.source'
import {readEducationSjtSources} from '../education-tools/native-source.sjt'
import {admitEducationNativeCognitive} from '../education-tools/native-source.cognitive'
import { emptyOptionalReportRelations, OPTIONAL_REPORT_RELATION_COUNTS } from './composite-report-read-plan'
import { lockAuthenticatedAdmission } from './authenticated-admission-lock'
import {publicTrainingFormDefinition} from '../assessment-runtime/typed-form'
import {assertTrainingMaterialsUsable,trainingFormMaterials,inspectTrainingMaterials} from '../assessment-media/training-materials'
import { assertScalePublicationRights } from '../scale/scale-publication-guard'
import { assertTrainingScaleCollectionAllowed } from '../scale/scale-collection-guard'
import { assertScaleLibraryCollectionAllowed } from '../scale-library-governance/collection-guard'
import { assertCompositeCourseScope } from './composite-course-scope'
import {assertTrainingPrivateReferenceAdmissionCurrent} from './training-private-reference-use'
import {attachTrainingReferenceSelection} from './training-reference-selection'
import {freezeTrainingReferenceBinding} from './training-reference-binding'
import {assertCurrentTrainingContentOwner,attachTrainingReportSelection} from './training-report-selection'
import {prepareTrainingContentSnapshot,prepareTrainingContentAttemptBinding} from './training-content-binding'
import {inheritTrainingTrackingSources,freezeTrainingTracking,readTrainingTracking} from './personal-tracking'
import {verifyStoredTrainingStandardItem,freezeTrainingStandardScaleRuntime,trainingStandardCombinationSummary} from './training-standard-combination'
import { evaluateTrainingFeedbackForAttempt, prepareTrainingFeedbackBinding, freezeTrainingFeedbackSnapshot, trainingFeedbackAttemptSelect, trainingFeedbackParentSelect, type TrainingFeedbackBinding } from './training-feedback-binding'
import { isLoadedCompositeParticipantFeedbackDeferred, trainingFeedbackReportReady } from '../assessment-policy/participant-feedback'
import { freezeTrainingPersistenceSnapshot, readTrainingPersistencePolicy, trainingPersistenceMetadata } from './training-persistence.policy'
import { trainingRoundPublicationIdentity, prepareTrainingPublicRound, assertTrainingTokenRound, publicRoundMetadata, trainingRoundSelect, type TrainingRoundInput } from './training-public-round'
import { allocateTrainingMaterial, materialRestartClaim } from './training-material-allocation'
import { canonicalHash } from '../assessment-runtime/canonical'
import { resolveTrainingFlowScopeForMaterialization, trainingFlowMarkerState, trainingFlowProvenance, hasTrainingFlowDefinitionMarkers, type VerifiedTrainingFlowMaterialization } from './training-flow-scope'
import { buildTrainingFlowUnits } from './training-flow-definition'
import { freezeTrainingFlowAssignment } from './training-flow-assignment-snapshot'
import { compileTrainingFlow, trainingFlowUnitKey, trainingFlowItemKey } from '../assessment-core/flow/training'
import { assertTrainingFlowAuthoringScope } from '../questionnaire-product/training-flow-authoring'
import { preloadCompositeReportFacts, type CompositeReportFactsReader } from './composite-report-read-batch'
import { cognitivePresentationAssetReferences } from '../cognitive/v2/presentation'
import { assertAssessmentAssetReferencesReady, type AssessmentAssetIdentityV1 } from '../assessment-media/assessment-asset'
import { loadSituationalExportSlotSets } from './situational-canonical-export'
import { trainingVariantProvenance } from './training-variant-export'
import { encryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { hasTrainingVariantMetadata, buildTrainingVariantUnion, resolveTrainingAttemptScope, applyTrainingAttemptScope } from './training-variant-scope'
import { compileWeightedVariants, parseCompiledWeightedVariants, createWeightedVariantAllocation } from '../assessment-core/weighted-variants'
import { assertTrainingVariantAuthoringScope } from '../questionnaire-product/training-variant-authoring'
import { mapCompositeSection } from '../assessment-runtime/form-section-definition'
import { lockStoredAssetRows } from '../../services/assetStorage'
import { situationalAssetReferences } from '../situational/situation-definition'
import { scaleAssessmentMediaReferences } from '../scale/scale-image-retention'
import { compositeFormSectionMediaReferences } from '../assessment-runtime/form-image.adapter'
import type { SjtCourseGrantScope } from '../situational/authoring/grants'
import {withTrainingTimingReport} from './training-timing-report'
import {readTrainingContentReports} from './training-content-report'
import {decodeTrainingFinalReceipt} from './training-content-final'
import {freezeTrainingTimingSnapshot,readTrainingTimingPolicy} from '../assessment-runtime/training-scale-timing'
import { typedFormPresentation } from '../reporting/typed-form-presentation'
import { sharedControlWritesEnabled } from '../assessment-runtime/shared-control-records'
import { readCommittedScaleFacts } from '../assessment-runtime/scale-fact-records'
import { resolveStoredScaleResult } from '../assessment-runtime/compact-assessment-storage'
import { preloadStoredScaleResults } from '../assessment-runtime/compact-assessment-storage'
import { loadPackageAnalysisForAttempt } from './composite-analysis-snapshot.service'
import { assertTrainingVariantReportScope, canStoreCompactCompositeReport, encryptCompactCompositeReport, decryptCompactCompositeReport, preloadCompactCompositeReportReads, type CompactReportReadDependencies } from './compact-composite-report'
import { loadScaleAnswers } from '../scale/scale-workflow.service'
import { readCompositeReportStatusContext } from './composite-report-read'
import type { WholeQuestionnaireReportContext } from './whole-questionnaire.service'
import { prepareReportReadyNotifications, beginReportReadyWait, reportReadyWaitAvailable, reportReadyNotificationSequence, REPORT_READY_MAX_WAIT_MS } from '../../services/reportReadyNotifications'
import { readWholeReportFeedbackHint } from '../../services/reportFeedbackHints'
import { assertNoAcceptedWholeQuestionnaire } from '../assessment-runtime/report-outbox.service'
import { assessmentReportConfig } from '../../config/assessmentReports'
import { assertReportJobIdentity, compositeReportJobState, readCompositeReportMaterialization, readCompositeReportJobHeader, retryCompositeReport, REPORT_PARENT_SELECT, type ReportJobIdentity } from '../assessment-runtime/report-outbox.service'
import { encryptCompositeCollectionReport, decryptCompositeCollectionReport } from './composite-report-cache'
import { assertCognitiveProductEligible, assertCognitiveNewAdmissionEnabled } from '../cognitive/product-eligibility'
import { loadFrozenCompositeProgress, loadFrozenMeasurementFinalHeaders } from './frozen-progress'
import { frozenSituationalScientificProjection } from '../situational/onboarding/scientific-schema'
import { decryptFrozenSituationalRuntimeSnapshot } from '../assessment-runtime/situational-runtime-snapshot'
import { randomBytes, randomUUID } from 'crypto'
import { nanoid } from 'nanoid'
import { Prisma, UserRole } from '@prisma/client'
import { trainingCreatorAuthoritySql } from '../admin-permissions/training-authority'
import { prisma } from '../../config/database'
const defaultPrisma = prisma
import { config } from '../../config'
import { MAX_TOKEN_USES } from '../../constants'
import { publicAccessExpiryWithinPolicy } from '../../services/publicAccessPolicy'
import { encryptField, safeDecrypt } from '../../utils/encryption'
import { createAccessToken, createRecoveryCredential, hashRecoveryToken } from '../../services/anonymousAccess'
import {
  decryptPublicAccessToken,
  encryptPublicAccessToken,
  hashPublicAccessToken,
} from '../../services/publicAccessTokenCrypto'
import { encryptCognitivePayload, decryptCognitivePayload, getParticipantKey } from '../cognitive/cognitive.security'
import { requireCognitiveRegistryEntry } from '../cognitive/cognitive.registry'
import * as cognitiveSessionService from '../cognitive/session.service'
import { parseCognitiveResultSnapshot, referencesForCognitiveResult } from '../cognitive/v2/result-snapshot'
import { resolveCognitiveReferenceForResult } from '../cognitive/reference'
import { readFrozenReport } from '../cognitive/profile-freeze'
import { buildCognitiveSingleTaskReport } from '../cognitive/single-task-report'
import { isTaskSatisfied } from '../assessment-runtime/form-policy'
import { loadCompositeTypedFormValues } from '../assessment-runtime/typed-form-facts'
import { typedCompositeFormQuestion, validateTypedCompositeSectionDefinition, legacyFormValueProjection } from '../assessment-runtime/typed-form'
import { buildFormBackgroundReport, buildScaleUnitReport, SCALE_REPORT_DEFINITION_VERSION, SCALE_REPORT_DISCLAIMER } from '../reporting/scale-unit-report'
import {
  buildScaleResultForRecord,
  encryptScaleAnswers,
  encryptScaleResult,
  readScaleAnswers,
  loadProjectionPolicyForAssessment,
  resolveProjectionPolicyForAssessment,
  scaleDefinitionFromRecord,
  frozenDatabaseScaleDefinition,
  scaleRunnerFromRecord,
} from '../scale/scale-workflow.service'
import { hashScaleDefinition, validateScaleDefinition } from '../scale/scale-definition'
import { resolveFrozenScaleInstructionForScale } from '../scale/onboarding/instrument-registry'
import { retainFrozenScaleAssessmentImages } from '../scale/scale-image.adapter'
import { assertScaleContextCollectable } from '../scale/policy/context-preflight'
import { ensureScaleAdmissionAtDelivery, loadScaleAdmissionRuntime, UNIFIED_SCALE_CHILD_ADMISSION_SELECT } from '../scale/scale-admission.service'
import { ensureCognitiveAdmissionAtDelivery, UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT } from '../cognitive/cognitive-admission.service'
import { admitCognitiveAttempt, cognitiveQuotaSource, lockCognitiveQuota, readCognitiveQuota } from '../cognitive/attempt-quota'
import { ensureCompositeFormAdmissionAtDelivery } from '../assessment-runtime/form-admission.service'
import { missingRequiredScaleItemCodes, ScaleAnswerValidationError, validateScaleAnswer } from '../scale/scale-scoring'
import type { DeviceInputProvenanceV1 } from '../scale/device-input-provenance'
import { readContextFormAnswers, validateContextAnswer, validateContextFormItem, validateContextFormItems, writeContextFormAnswer } from '../assessment-context'
import {
  freezeCompositeAttemptContext,
  isAssessmentContextServiceError,
  readCompositeAttemptContext,
  assertContextMutable,
} from '../../services/assessmentContextService'
import { logger } from '../../utils/logger'
import { canUseReportPackage, canUseScale, SCALE_USE_AUTHORIZATION_SELECT } from '../../services/materialGrant'
import {
  CompositeServiceError,
  compositeBadRequest,
  compositeConflict,
  compositeForbidden,
  compositeNotFound,
} from './composite.errors'
import {
  createEmbeddedSituationalAttempt,
  loadEmbeddedSituationalAttemptRuntime,
  situationalAttemptForResponse,
} from '../situational/situational-runtime.service'
import { assertSituationalAssetReferencesReady } from '../situational/situational-asset.service'
import { loadSituationalReleaseMetadata, type SituationalReleaseMetadata, inspectSituationalReleases, resolveSituationalReleases, situationalReleaseKey, type ResolvedSituationalRelease } from '../situational/situational-release.service'
import { projectSjtReleaseStatus } from '../situational/authoring/service'
import type {
  AddCompositeItemInput,
  CopyCompositeInput,
  CreateCompositeInput,
  SetCompositeAnalysisProtocolInput,
  SetCompositeReportPackageInput,
  UpdateCompositeInput,
} from './composite.schema'
import { ensureTeacherPublishedAssignment, prepareTeacherPublishedAssignment, persistPreparedTeacherPublishedAssignment } from '../cognitive/assignment.service'
import { assertTaskCanPublish, assertTaskContractValid } from '../cognitive/v2/publication-gate'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'
import { computeSubmissionPayloadHash, isInstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import {
  withFinalOnlyCompletionTransaction,
  withQuestionnaireCompletionTransaction,
} from '../../services/questionnaireProgressService'
import { measureRequestPhase, measureRequestPhaseSync } from '../../services/runtimeObservability'
import {
  buildFrozenAnalysisProtocolSnapshot,
  encryptFrozenAnalysisProtocolSnapshot,
  buildFrozenReportPackageSnapshot,
  encryptFrozenReportPackageSnapshot,
  getReportPackageDefinition,
  readFrozenReportPackageSnapshot,
  validateFrozenReportPackageSnapshot,
  getAnalysisProtocolDefinition,
  readFrozenAnalysisProtocolSnapshot,
  validateFrozenAnalysisProtocolSnapshot,
} from '../cognitive-analysis'
import type {
  AnalysisProtocolDefinition,
  CognitiveAnalysisProfile,
  ReportPackageDefinition,
} from '../cognitive-analysis'
import {
  getFrozenPackageSlotLabels,
  resolveCompositeItemLabel,
  resolveLibraryItemLabel,
} from './report-package-label'
import {
  buildCompletionSnapshotExpectation,
  listPackageAnalysisSnapshotMetadata,
  persistOrGetPackageAnalysisSnapshot,
  readCompletionPackageAnalysisSnapshot,
  readPackageAnalysisSnapshot,
} from './composite-analysis-snapshot.service'
import {
  projectCompositeCollectionReport,
  projectCompositeReport,
} from './composite-report.projector'
import {
  formSectionIdentityHash,
  freezeCompositeActiveSlotSet,
  frozenEducationBlockInstruction,
} from '../assessment-runtime/attempt-runtime'
import {
  loadFrozenScaleRuntimeSnapshot,
  persistFrozenScaleRuntimeSnapshot,
  freezeScaleRuntimeAtAttemptStart,
} from '../assessment-runtime/runtime-snapshot'
import { compiledBundleRuntimeHashForSnapshot, evaluateCompleteness, type AggregateSnapshotHeader } from '../assessment-runtime/unified-aggregate'
import { decryptUnifiedRuntimePayload } from '../assessment-runtime/security'
import { parseCanonicalUnitResultEnvelope } from '../assessment-runtime/unit-result'
import {
  compositeItemSlotKey,
  loadFrozenActiveSlotSet,
  storeFrozenActiveSlotSet,
  formSectionSlotKey,
  type FrozenActiveSlotV1,
} from '../assessment-runtime/slot-set'
import { runnerDefinition } from '../scale/scale-definition'
import type {
  CompositeReportAudience,
  CompositeSnapshotMetadata,
} from './composite-report.types'
import type { CompositeAnalysisExportContext } from './composite-analysis-export.service'

type Db = any

const reportPackageSummary = (row: {
  reportPackageKey?: string | null
  reportPackageVersion?: string | null
  reportPackageProfile?: string | null
  reportPackageSnapshotEncrypted?: string | null
}) => row.reportPackageKey && row.reportPackageVersion
  ? {
      key: row.reportPackageKey,
      version: row.reportPackageVersion,
      profile: row.reportPackageProfile,
      frozen: Boolean(row.reportPackageSnapshotEncrypted),
    }
  : null

const withoutAnalysisProtocolCipher = <T extends Record<string, unknown>>(row: T) => {
  const {
    personalTracking: _ignoredPersonalTracking,
    personalTrackingInheritedUnits: _ignoredInheritedTracking,
    personalChangesSnapshots: _ignoredPersonalChanges,
    trainingReportSelectionDraft: _ignoredTrainingReportSelection,
    trainingReferenceSelectionDraft: _ignoredTrainingReferenceSelection,
    trainingContentSnapshot: _ignoredTrainingContent,
    trainingContentSnapshotHash: _ignoredTrainingContentHash,
    analysisProtocolSnapshotEncrypted: _ignoredProtocol,
    reportPackageSnapshotEncrypted: _ignoredPackage,
    analysisProtocolKey: _ignoredProtocolKey,
    analysisProtocolVersion: _ignoredProtocolVersion,
    reportPackageKey: _ignoredPackageKey,
    reportPackageVersion: _ignoredPackageVersion,
    reportPackageProfile: _ignoredPackageProfile,
    ...safe
  } = row
  const tracking=readTrainingTracking(row.personalTracking)
  return { ...safe, reportPackage: reportPackageSummary(row),...(tracking?{personalTracking:{
    baselineId:row.personalTrackingBaselineId,ordinal:row.personalTrackingOrdinal,
    metrics:tracking.plan?.metrics.map(m=>({itemId:tracking.bindings.find(b=>b.metricId===m.id)?.itemId,scoreKey:m.scoreKey,label:m.label,unit:m.unit}))??[],
  }}:{}) }
}

const isTeacherOrAdmin = (role: UserRole) => role === UserRole.TEACHER || role === UserRole.ADMIN

const assertTeacher = (role: UserRole) => {
  if (!isTeacherOrAdmin(role)) throw compositeForbidden('需要教师权限')
}

const assertOwner = (resource: { createdBy: string | null; productKind?: string }, userId: string, role: UserRole, allowFormTemplate = false) => {
  if (resource.productKind === 'FORM_TEMPLATE' && !allowFormTemplate) throw compositeForbidden('独立表单不直接投放，请在组合问卷中选用')
  if (resource.productKind === 'ORGANIZATION_RESOURCE') throw compositeForbidden('组织资源请通过测量资源管理与组织报告入口操作')
  if (role === UserRole.ADMIN) return
  if (role !== UserRole.TEACHER || resource.createdBy !== userId) {
    throw compositeForbidden()
  }
}

const parseDate = (value: string | null | undefined) => (value ? new Date(value) : null)

const assertNotOrganizationResourceGenericEntry = (resource: {productKind?:string|null}) => {
  if(resource.productKind==='ORGANIZATION_RESOURCE') throw compositeForbidden('组织资源仅可通过对应的组织任务访问')
}

const loadComposite = async (id: string, includeItems = false, db: Db = prisma) => {
  const composite = await db.compositeAssessment.findUnique({
    where: { id },
    include: {
      questionnaireCourses: { include: { course: { select: { id: true, title: true } } } },
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, title: true, courseCode: true, isLibrary: true } },
      ...(includeItems
        ? {
            items: {
              orderBy: { position: 'asc' as const },
              include: {
                scale: {
                  select: {
                    ...SCALE_USE_AUTHORIZATION_SELECT,
                    code: true,
                    name: true,
                    description: true,
                    instruction: true,
                    instrumentClass: true,
                    instrumentVersion: true,
                    libraryEntryId: true,
                    measurementReleaseId: true,
                    definition: true,
                  },
                },
                cognitiveAssignment: { include: { config: true } },
              },
            },
            formSections: {
              orderBy: { position: 'asc' as const },
              include: { items: { orderBy: [{ formSectionPosition: 'asc' as const }, { position: 'asc' as const }] } },
            },
          }
        : {}),
    },
  })
  if (!composite) throw compositeNotFound()
  return includeItems?inheritTrainingTrackingSources(db as Prisma.TransactionClient,composite):composite as any
}

const validateCourse = async (
  courseId: string | null | undefined,
  userId: string,
  role: UserRole,
  options: { allowLibrary?: boolean; requireOwnCourse?: boolean } = {},
) => {
  if (!courseId) return null
  const course = await prisma.course.findUnique({ where: { id: courseId } })
  if (!course) throw compositeNotFound('课程不存在')
  if (course.isLibrary && !options.allowLibrary) {
    throw compositeBadRequest('不能绑定库课程')
  }
  if ((options.requireOwnCourse || role === UserRole.TEACHER) && course.creatorId !== userId) {
    throw compositeForbidden('只能在自己创建的课程中发布综合测评')
  }
  return course
}

const isAdminLibraryTemplate = (composite: {
  copyable?: boolean
  status?: string
  courseId?: string | null
  creator?: { role?: UserRole | string } | null
  course?: { isLibrary?: boolean } | null
}) =>
  Boolean(
    composite.copyable
    && composite.status === 'PUBLISHED'
    && composite.creator?.role === UserRole.ADMIN
    && composite.courseId
    && composite.course?.isLibrary === true,
  )

const canSetCopyableFor = (composite: { status?: string; creator?: { role?: UserRole | string } | null; course?: { isLibrary?: boolean } | null }, role: UserRole) =>
  role === UserRole.ADMIN
  && composite.status === 'PUBLISHED'
  && composite.creator?.role === UserRole.ADMIN
  && composite.course?.isLibrary === true

const assertNotLibraryComposite = (composite: { course?: { isLibrary?: boolean } | null }, message: string) => {
  if (composite.course?.isLibrary) throw compositeBadRequest(message)
}

const assertDraft = (composite: { status: string }) => {
  if (composite.status !== 'DRAFT') throw compositeConflict('只有草稿状态的综合测评可以修改')
}

const assertCollectionOnlyEditing = (composite: {
  productKind?: string
  analysisProtocolKey?: string | null
  reportPackageKey?: string | null
}) => {
  if (composite.productKind === 'ASSESSMENT_BUNDLE' || composite.analysisProtocolKey || composite.reportPackageKey) {
    throw compositeConflict('固定分析协议的模块不能单独添加、移除或排序')
  }
}

const assertCognitiveModuleEnabled = () => {
  assertCognitiveNewAdmissionEnabled()
}

type SituationalCompositeItem = { type?: string; situationalInstrumentKey?: string | null; situationalInstrumentVersion?: string | null }
const situationalItemIdentity = (item: SituationalCompositeItem) => {
  if (!item.situationalInstrumentKey || !item.situationalInstrumentVersion) throw compositeBadRequest('情境化模块必须绑定精确 instrumentKey 和 instrumentVersion')
  return { instrumentKey: item.situationalInstrumentKey, instrumentVersion: item.situationalInstrumentVersion }
}
/** New controlled releases deliberately support one unambiguous server-side
 * Training delivery. Legacy releases ignore this optional scope. Never select
 * the first course from a multi-course questionnaire or trust request host/id. */
export const compositeSjtGrantScope = (composite: {
  createdBy?: string | null; courseId?: string | null; productKind?: string;
  questionnaireType?: string | null; questionnaireCourses?: Array<{ courseId: string }>;
  deliveryCourseId?: string | null;
}, teacherId = composite.createdBy): SjtCourseGrantScope | undefined => {
  if (!teacherId) return undefined
  const courses = composite.productKind === 'QUESTIONNAIRE'
    ? composite.questionnaireType === 'COURSE' ? composite.questionnaireCourses?.map(row => row.courseId) ?? [] : []
    : composite.courseId ? [composite.courseId] : []
  if (courses.length !== 1 || (composite.deliveryCourseId && composite.deliveryCourseId !== courses[0])) return undefined
  return { teacherId, courseId: courses[0], purpose: 'TRAINING_COURSE' }
}
export const resolveCompositeSituationalItems = async (items: SituationalCompositeItem[], db: Db = defaultPrisma, lock = false, scope?: SjtCourseGrantScope) => {
  const resolved = await resolveSituationalReleases(items.filter(item => item.type === 'SITUATIONAL').map(situationalItemIdentity), db, lock, scope)
  for (const situation of resolved.values()) assertSituationalCompositeItem(situation)
  return resolved
}
/** Preflight retains both successful and failed exact identities for all of its
 * checks and per-item diagnostics; no repeated upload fetch/compile on errors. */
export const inspectCompositeSituationalItems = async (items: SituationalCompositeItem[], db: Db = defaultPrisma, scope?: SjtCourseGrantScope) => {
  const outcome = await inspectSituationalReleases(items.filter(item => item.type === 'SITUATIONAL').map(situationalItemIdentity), db, false, scope)
  for (const [key, situation] of outcome.releases) {
    try { assertSituationalCompositeItem(situation) } catch (error) { outcome.errors.set(key, error); outcome.releases.delete(key) }
  }
  return outcome
}
/** Prelock every image/media identity used by this parent, across tool types,
 * before per-child retention. Reentrant retain locks cannot invert item order. */
export const lockCompositeAssetReferences = async (db: Db, items: any[], formSections: any[], releases: Map<string, ResolvedSituationalRelease>, additionalReferences: readonly AssessmentAssetIdentityV1[] = []) => {
  const references = [
    ...additionalReferences,
    ...[...releases.values()].flatMap(release => release.snapshot.definition.scenes.flatMap(scene => situationalAssetReferences(scene.stimulus))),
    ...items.filter(item => item.type === 'SCALE' && item.scale?.definition).flatMap(item => scaleAssessmentMediaReferences(frozenDatabaseScaleDefinition(item.scale))),
    ...formSections.flatMap(section => compositeFormSectionMediaReferences(mapCompositeSection(section))),
  ]
  if (references.length) await lockStoredAssetRows(db, references.map(reference => reference.assetId))
  return references
}
const assertSituationalCompositeItem = (situation: ResolvedSituationalRelease, educationProduct?:'SCHOOL'|'TEACHER') => {
  const { runtime, situationPackage } = situation
  if (!runtime.runtimeCapabilities.supported || !runtime.runtimeCapabilities.embedded || !runtime.runtimeCapabilities.aggregateEligible || runtime.runtimeCapabilities.collectionFacts) throw compositeBadRequest('情境化题包不支持 Unified Bundle 运行时')
  // Composite course delivery and anonymous student entry must not silently
  // administer teacher self-report instruments to students.
  if (situationPackage.definition.respondentType === 'teacher_self_report' && educationProduct!=='TEACHER') throw compositeBadRequest('教师自评题包不能用于学员综合测评')
  return situation
}

const assertSupportedComposite = (composite: { items?: Array<{ type: string; situationalInstrumentKey?: string | null; situationalInstrumentVersion?: string | null }> }, frozenAttempt = false, newAdmission = !frozenAttempt) => {
  if (newAdmission && !config.cognitiveModuleEnabled && composite.items?.some((item) => item.type === 'COGNITIVE')) {
    throw compositeBadRequest('认知模块未启用')
  }
  for (const item of composite.items ?? []) {
    if (item.type === 'SITUATIONAL' && !frozenAttempt) situationalItemIdentity(item)
  }
}

const requirePublishedAnalysisProtocol = (key: string, version: string) => {
  const protocol = getAnalysisProtocolDefinition(key, version)
  if (!protocol || protocol.status !== 'PUBLISHED') {
    throw compositeBadRequest('综合分析协议不存在或尚未发布')
  }
  return protocol
}

const requirePublishedReportPackage = (key: string, version: string) => {
  const definition = getReportPackageDefinition(key, version)
  if (!definition || definition.status !== 'PUBLISHED') {
    throw compositeBadRequest('报告包不存在或尚未发布')
  }
  return definition
}

export const materializeAnalysisProtocol = async (
  db: Db,
  input: {
    compositeId: string
    courseId: string
    userId: string
    profile: CognitiveAnalysisProfile
    protocol: AnalysisProtocolDefinition
  },
) => {
  if (input.protocol.status !== 'PUBLISHED') throw compositeBadRequest('只能使用已发布的综合分析协议')
  if (!input.protocol.profiles.includes(input.profile)) throw compositeBadRequest('综合分析协议不支持该 Profile')

  for (const slot of [...input.protocol.cognitiveSlots].sort((a, b) => a.position - b.position)) {
    const taskConfig = await db.cognitiveTestConfig.findUnique({
      where: { testType_configVersion: { testType: slot.testType, configVersion: slot.configVersion } },
    })
    if (
      !taskConfig ||
      taskConfig.status !== 'PUBLISHED' ||
      taskConfig.engineVersion !== slot.engineVersion ||
      taskConfig.scoringVersion !== slot.scoringVersion
    ) {
      throw compositeBadRequest(`协议任务配置不可用：${slot.label}`)
    }
    const assignment = await ensureTeacherPublishedAssignment(db, {
      userId: input.userId,
      courseId: input.courseId,
      configId: taskConfig.id,
      title: slot.label,
      instruction: taskConfig.instruction ?? null,
      profile: input.profile,
    })
    await db.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: input.compositeId,
        type: 'COGNITIVE',
        position: slot.position,
        required: true,
        cognitiveAssignmentId: assignment.id,
      },
    })
  }

  for (const slot of [...input.protocol.scaleSlots].sort((a, b) => a.position - b.position)) {
    const scale = await db.scale.findUnique({
      where: { code: slot.expectedScaleCode },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        instrumentClass: true,
        instrumentVersion: true,
        definition: true,
      },
    })
    if (!scale || scale.status !== 'PUBLISHED') {
      throw compositeBadRequest(`协议量表不可用：${slot.label}`)
    }
    const validation = validateScaleDefinition(scale.definition, { instrumentClass: scale.instrumentClass })
    if (!validation.definition || validation.issues.some((issue) => issue.severity === 'error')) {
      throw compositeBadRequest(`协议量表 definition 不可用：${slot.label}`)
    }
    if (!validation.definition.scoring.scores.some((score) => score.key === slot.expectedDimensionCode)) {
      throw compositeBadRequest(`协议量表维度不可用：${slot.label}`)
    }
    await db.compositeAssessmentItem.create({
      data: {
        compositeAssessmentId: input.compositeId,
        type: 'SCALE',
        position: slot.position,
        required: true,
        scaleId: scale.id,
      },
    })
  }
}

export const materializeReportPackage = async (
  db: Db,
  input: {
    compositeId: string
    courseId: string
    userId: string
    profile: CognitiveAnalysisProfile
    packageDefinition: ReportPackageDefinition
  },
) => {
  const protocol = requirePublishedAnalysisProtocol(
    input.packageDefinition.analysisProtocolKey,
    input.packageDefinition.analysisProtocolVersion,
  )
  await materializeAnalysisProtocol(db, {
    compositeId: input.compositeId,
    courseId: input.courseId,
    userId: input.userId,
    profile: input.profile,
    protocol,
  })
}

const validateCognitiveConfig = (config: any, requirePublication = false) => {
  try {
    assertCognitiveProductEligible(config.testType)
    const entry = requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
    const parsed = entry.configSchema.safeParse(config.config)
    if (!parsed.success) throw compositeBadRequest('认知任务配置不符合当前版本规范')
    const definition = getCognitiveV2TaskDefinition(
      config.testType,
      config.engineVersion,
      config.scoringVersion,
    )
    if (!definition) throw compositeBadRequest('认知任务缺少 Cognitive v2 definition')
    try {
      if (requirePublication) assertTaskCanPublish(definition)
      else assertTaskContractValid(definition)
    } catch {
      throw compositeBadRequest(requirePublication
        ? '认知任务未通过 Cognitive v2 publication gate'
        : '认知任务不符合 Cognitive v2 contract')
    }
    return parsed.data
  } catch (err) {
    if (err instanceof CompositeServiceError) throw err
    throw compositeBadRequest('认知任务配置版本不可用')
  }
}

const assertCognitiveAssignmentOnCompositeCourse = (
  assignment: { courseId: string | null },
  composite: { courseId: string | null; productKind?: string },
) => {
  if (['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE'].includes(composite.productKind ?? '')) return
  if (!composite.courseId) throw compositeBadRequest('含认知模块的综合测评必须绑定课程')
  if (assignment.courseId !== composite.courseId) {
    throw compositeBadRequest('认知任务必须与综合测评属于同一课程')
  }
}

export const assertValidItem = async (
  input: AddCompositeItemInput,
  userId: string,
  role: UserRole,
  composite: { courseId: string | null; productKind?: string; createdBy?: string | null; questionnaireType?: string | null; questionnaireCourses?: Array<{courseId:string}> },
  prisma: Db = defaultPrisma,
  situationalReleases?: Map<string, ResolvedSituationalRelease>,
) => {
  if(input.standardCombination)throw compositeBadRequest('批准组合请选择 Training 课程问卷的精确来源入口')
  if ((input as any).formPolicy != null && composite.productKind !== 'QUESTIONNAIRE') throw compositeBadRequest('Form V3 只支持新版普通问卷')
  if (input.required === false && input.type !== 'FORM') {
    throw compositeBadRequest('只有表单字段可以设置为选填')
  }
  const supplied = [
    input.scaleId,
    input.cognitiveAssignmentId,
    input.situationalInstrumentKey,
    input.formLabel,
  ].filter(Boolean).length
  if (input.type === 'SCALE') {
    if (!input.scaleId || supplied !== 1) throw compositeBadRequest('量表模块必须提供 scaleId')
    const scale = await prisma.scale.findUnique({ where: { id: input.scaleId } })
    if (!scale) throw compositeNotFound('量表不存在')
    if (!(await canUseScale(userId, role, scale, prisma))) throw compositeForbidden('无权限使用此量表')
    if (scale.status !== 'PUBLISHED') throw compositeBadRequest('只能添加已发布量表')
    if (!scale.definition) throw compositeBadRequest('只能添加已安装 v2 definition 的量表')
    const definitionValidation = validateScaleDefinition(scale.definition)
    if (!definitionValidation.definition || definitionValidation.issues.some((issue) => issue.severity === 'error')) {
      throw compositeBadRequest('量表 definition 不可用')
    }
    return
  }

  if (input.type === 'COGNITIVE') {
    assertCognitiveModuleEnabled()
    if (!input.cognitiveAssignmentId || supplied !== 1) throw compositeBadRequest('认知模块必须提供 cognitiveAssignmentId')
    const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: input.cognitiveAssignmentId }, include: { config: true } })
    if (!assignment) throw compositeNotFound('认知任务不存在')
    if (assignment.status !== 'PUBLISHED' || assignment.config.status !== 'PUBLISHED') {
      throw compositeBadRequest('只能添加已发布认知任务')
    }
    if (assignment.listedStandalone === false) {
      throw compositeForbidden('报告包内部认知任务不能用于仅收集综合测评')
    }
    const pin=readTrainingCognitiveTaskBinding(assignment.courseSnapshot)
    if(pin){
     if(assignment.createdBy!==userId)throw compositeForbidden('不能使用其他接收者的固定认知配置')
     const fixed=await loadPinnedTrainingCognitiveProfile(prisma as Prisma.TransactionClient,pin,{userId,configId:assignment.configId},true)
     assertCognitiveAssignmentFreeze(assignment,fixed.artifact)
    }
    validateCognitiveConfig(assignment.config)
    if (role !== UserRole.ADMIN && assignment.createdBy !== userId) {
      throw compositeForbidden('无权限使用此认知任务')
    }
    assertCognitiveAssignmentOnCompositeCourse(assignment, composite)
    return
  }

  if (input.type === 'SITUATIONAL') {
    if (!input.situationalInstrumentKey || !input.situationalInstrumentVersion || supplied !== 1) {
      throw compositeBadRequest('情境化模块必须提供精确 instrumentKey 和 instrumentVersion')
    }
    const releases = situationalReleases ?? await resolveCompositeSituationalItems([input], prisma, prisma !== defaultPrisma, compositeSjtGrantScope(composite, composite.createdBy ?? userId))
    assertSituationalCompositeItem(releases.get(situationalReleaseKey(situationalItemIdentity(input)))!)
    return
  }

  if (input.type === 'FORM') {
    if (!input.formType || !input.formLabel || supplied !== 1) {
      throw compositeBadRequest('表单模块必须提供 formType 和 formLabel')
    }
    if ((input as any).formDefinition?.materials?.length) {
      const lists=[(input as any).formDefinition.materials]
      if(prisma===defaultPrisma)await inspectTrainingMaterials(composite.createdBy??userId,lists)
      else await assertTrainingMaterialsUsable(prisma as Prisma.TransactionClient,composite.createdBy??userId,lists,false)
    }
    if ((input as any).formDefinition != null) typedCompositeFormQuestion({ ...input, id: 'new', formDefinition: { itemKey: 'q_new', ...(input as any).formDefinition }, placeholder: input.formPlaceholder ?? null, contextKey: input.contextKey ?? null, position: input.position ?? 0, formSectionPosition: null } as any)
    if (input.formType === 'single_choice' || input.formType === 'multiple_choice') {
      const options = input.formOptions ?? []
      const values = options.map((option) => option.value)
      if (values.length === 0) throw compositeBadRequest('选择题必须提供至少一个选项')
      if (new Set(values).size !== values.length) throw compositeBadRequest('表单选项不能重复')
    }
    const contextIssues = validateContextFormItem({
      id: 'new',
      type: input.formType,
      label: input.formLabel,
      required: input.required,
      position: input.position,
      contextKey: input.contextKey,
      options: input.formOptions,
    })
    if (contextIssues.length > 0) throw compositeBadRequest(contextIssues[0].message)
    return
  }

  throw compositeBadRequest('不支持的综合测评模块类型')
}

const mapItemForTeacher = (item: any, packageSlotLabels = new Map<number, string>(), situationalMetadata = new Map<string, SituationalReleaseMetadata>()) => ({
  id: item.id,
  type: item.type,
  position: item.position,
  required: item.required,
  scale: item.scale ? { id: item.scale.id, code: item.scale.code, name: packageSlotLabels.get(item.position) ?? item.scale.name } : null,
  ...(item.standardCombinationSource!=null?{standardCombinationSummary:trainingStandardCombinationSummary(item.standardCombinationSource)}:{}),
  cognitiveAssignment: item.cognitiveAssignment
    ? {
        id: item.cognitiveAssignment.id,
        title: packageSlotLabels.get(item.position) ?? item.cognitiveAssignment.title,
        status: item.cognitiveAssignment.status,
        profile: item.cognitiveAssignment.profile ?? null,
        config: {
          id: item.cognitiveAssignment.config.id,
          testType: item.cognitiveAssignment.config.testType,
          configVersion: item.cognitiveAssignment.config.configVersion,
          name: item.cognitiveAssignment.config.name,
          engineVersion: item.cognitiveAssignment.config.engineVersion,
          scoringVersion: item.cognitiveAssignment.config.scoringVersion,
        },
      }
    : null,
  situational: item.type === 'SITUATIONAL'
    ? {
        key: item.situationalInstrumentKey,
        version: item.situationalInstrumentVersion,
        ...situationalMetadata.get(situationalReleaseKey(situationalItemIdentity(item))),
      }
    : null,
  form: item.type === 'FORM'
    ? {
        type: item.formType,
        label: packageSlotLabels.get(item.position) ?? item.formLabel,
        placeholder: item.formPlaceholder,
        options: item.formOptions,
        ...(item.formDefinition != null ? { formDefinition: item.formDefinition } : {}),
      ...(item.formPolicy != null ? { formPolicy: item.formPolicy } : {}),
        contextKey: item.contextKey ?? null,
      }
    : null,
})

type AttemptCounts = {
  started: number
  inProgress: number
  completed: number
  satisfied: number
  notSatisfied: number
  abandoned: number
}

const emptyAttemptCounts = (): AttemptCounts => ({
  started: 0,
  inProgress: 0,
  completed: 0,
  satisfied: 0,
  notSatisfied: 0,
  abandoned: 0,
})

const relationalTeacherReadableAssignmentIds = async (userId: string): Promise<string[]> => {
  const rows = await prisma.relationalAssessmentAssignment.findMany({
    where: {
      createdByUserId: userId,
      perspective: 'OBSERVER_REPORT',
      analysisMode: 'INDIVIDUAL_ONLY',
      visibilityPolicyKey: 'observer_assigning_teacher_v1',
    },
    select: { id: true },
  })
  return rows.map((row) => row.id)
}

const teacherRelationalAttemptVisibility = async (
  userId: string,
  role: UserRole,
): Promise<Prisma.CompositeAssessmentAttemptWhereInput | null> => {
  if (role !== UserRole.TEACHER) return null
  const readableAssignmentIds = await relationalTeacherReadableAssignmentIds(userId)
  return {
    OR: [
      { assignmentRef: null },
      { assignmentRef: { in: readableAssignmentIds } },
    ],
  }
}

const assertRelationalTeacherAttemptReadAllowed = async (
  attempt: { assignmentRef?: string | null },
  userId: string,
  role: UserRole,
): Promise<void> => {
  if (role === UserRole.ADMIN || !attempt.assignmentRef) return
  const assignment = await prisma.relationalAssessmentAssignment.findUnique({
    where: { id: attempt.assignmentRef },
    select: {
      createdByUserId: true,
      perspective: true,
      analysisMode: true,
      visibilityPolicyKey: true,
    },
  })
  if (
    !assignment
    || assignment.perspective !== 'OBSERVER_REPORT'
    || assignment.analysisMode !== 'INDIVIDUAL_ONLY'
    || assignment.visibilityPolicyKey !== 'observer_assigning_teacher_v1'
    || assignment.createdByUserId !== userId
  ) {
    throw compositeForbidden('关系测评个人结果不能通过通用教师结果接口读取')
  }
}

const loadAttemptCountsByCompositeIds = async (
  ids: string[],
  userId: string,
  role: UserRole,
  courseId?: string,
): Promise<Map<string, AttemptCounts>> => {
  const byId = new Map<string, AttemptCounts>()
  if (ids.length === 0) return byId
  const visibility = await teacherRelationalAttemptVisibility(userId, role)
  const scope = { compositeAssessmentId: { in: ids }, ...(courseId ? { deliveryCourseId: courseId } : {}) }
  const where = visibility ? { AND: [scope, visibility] } : scope
  const grouped = await prisma.compositeAssessmentAttempt.groupBy({
    by: ['compositeAssessmentId', 'status', 'taskSatisfaction'],
    where,
    _count: { _all: true },
  })
  for (const row of grouped) {
    const current = byId.get(row.compositeAssessmentId) ?? emptyAttemptCounts()
    const n = row._count._all
    if (row.status === 'IN_PROGRESS') current.inProgress += n
    else if (row.status === 'COMPLETED') {
      current.completed += n
      if (isTaskSatisfied(row)) current.satisfied += n
      else current.notSatisfied += n
    }
    else if (row.status === 'ABANDONED') current.abandoned += n
    current.started = current.inProgress + current.completed + current.abandoned
    byId.set(row.compositeAssessmentId, current)
  }
  return byId
}

const mapAttemptRowForTeacher = (attempt: {
  id: string
  status: string
  taskSatisfaction?: string | null
  progress: number
  progressUnavailableReason?: string | null
  completedItems: number
  startedAt: Date
  lastSavedAt: Date
  completedAt: Date | null
  totalTime: number | null
  anonymousCode: string | null
  userId: string | null
  user: { id: string; nickname: string | null; username: string } | null
}) => {
  const base = {
    id: attempt.id,
    status: attempt.status,
    taskSatisfaction: attempt.taskSatisfaction ?? null,
    taskSatisfied: isTaskSatisfied(attempt),
    progress: attempt.progress,
    progressUnavailableReason: attempt.progressUnavailableReason ?? null,
    completedItems: attempt.completedItems,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    totalTime: attempt.totalTime,
    userId: attempt.userId,
  }
  if (attempt.anonymousCode) {
    return {
      ...base,
      isAnonymous: true,
      anonymousCode: attempt.anonymousCode,
      nickname: null,
      username: null,
      displayName: attempt.anonymousCode,
    }
  }
  if (!attempt.user) {
    return {
      ...base,
      isAnonymous: false,
      anonymousCode: null,
      nickname: null,
      username: null,
      displayName: '已删除用户',
    }
  }
  return {
    ...base,
    isAnonymous: false,
    anonymousCode: null,
    nickname: attempt.user.nickname,
    username: attempt.user.username,
    displayName: attempt.user.nickname,
    userId: attempt.user.id,
  }
}

export const createComposite = async (userId: string, role: UserRole, input: CreateCompositeInput) => {
  assertTeacher(role)
  // A bare analysis protocol is a legacy persisted-data concept, not a
  // creation mode. The controller schema rejects it; keep this guard here as
  // defense-in-depth for internal callers that might bypass the controller.
  if (Object.prototype.hasOwnProperty.call(input, 'analysisProtocol')) {
    throw compositeBadRequest('固定报告必须从获授权报告包创建')
  }
  await validateCourse(input.courseId, userId, role, { allowLibrary: role === UserRole.ADMIN })
  if (input.publicEnabled && !input.expiresAt) {
    throw compositeBadRequest('公开链接必须设置有效期')
  }
  const existing = await prisma.compositeAssessment.findUnique({ where: { code: input.code } })
  if (existing) throw compositeConflict('综合测评编码已存在')

  const packageSelection = input.reportPackage ?? null
  const packageDefinition = packageSelection
    ? requirePublishedReportPackage(packageSelection.key, packageSelection.version)
    : null
  if (packageDefinition) {
    if (!await canUseReportPackage(userId, role, packageDefinition.key, packageDefinition.version)) {
      throw compositeForbidden('没有该报告包的授权')
    }
    if (!packageSelection || !packageDefinition.profiles.includes(packageSelection.profile)) {
      throw compositeBadRequest('报告包不支持该 Profile')
    }
  }
  const protocol = packageDefinition
    ? requirePublishedAnalysisProtocol(packageDefinition.analysisProtocolKey, packageDefinition.analysisProtocolVersion)
    : null
  if (protocol) {
    assertCognitiveModuleEnabled()
    if (!input.courseId) throw compositeBadRequest('综合分析协议必须绑定课程')
  }

  return prisma.$transaction(async (tx: Db) => {
    const composite = await tx.compositeAssessment.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        instruction: input.instruction ?? null,
        courseId: input.courseId ?? null,
        createdBy: userId,
        opensAt: parseDate(input.opensAt),
        expiresAt: parseDate(input.expiresAt),
        maxAttempts: input.maxAttempts,
        publicEnabled: input.publicEnabled,
        analysisProtocolKey: protocol?.key ?? null,
        analysisProtocolVersion: protocol?.version ?? null,
        analysisProtocolSnapshotEncrypted: null,
        reportPackageKey: packageDefinition?.key ?? null,
        reportPackageVersion: packageDefinition?.version ?? null,
        reportPackageProfile: packageSelection?.profile ?? null,
        reportPackageSnapshotEncrypted: null,
      },
    })
    if (packageDefinition && packageSelection && input.courseId) {
      await materializeReportPackage(tx, {
        compositeId: composite.id,
        courseId: input.courseId,
        userId,
        profile: packageSelection.profile,
        packageDefinition,
      })
    }
    return withoutAnalysisProtocolCipher(composite)
  })
}

export const listComposites = async (userId: string, role: UserRole) => {
  assertTeacher(role)
  const where = { productKind: 'LEGACY_COMPOSITE', ...(role === UserRole.ADMIN ? {} : { createdBy: userId }) }
  const list = await prisma.compositeAssessment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, title: true, courseCode: true, isLibrary: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: { select: { id: true, name: true } },
          cognitiveAssignment: {
            select: {
              id: true,
              title: true,
              status: true,
              profile: true,
              config: {
                select: {
                  id: true,
                  testType: true,
                  configVersion: true,
                  name: true,
                  engineVersion: true,
                  scoringVersion: true,
                },
              },
            },
          },
        },
      },
    },
  })
  // Historical management rows remain visible; the flag controls new authoring/admission.
  const supportedList = list
  const counts = await loadAttemptCountsByCompositeIds(supportedList.map((item: any) => item.id), userId, role)
  const situationalMetadata = await loadSituationalReleaseMetadata(supportedList.flatMap((item: any) => item.items.filter((child: any) => child.type === 'SITUATIONAL').map(situationalItemIdentity)))
  return supportedList.map((item: any) => {
    const {
      _count: _ignoredCount,
      analysisProtocolSnapshotEncrypted: _ignoredProtocolSnapshot,
      analysisProtocolKey: _ignoredProtocolKey,
      analysisProtocolVersion: _ignoredProtocolVersion,
      reportPackageSnapshotEncrypted: _ignoredPackageSnapshot,
      reportPackageKey: _ignoredPackageKey,
      reportPackageVersion: _ignoredPackageVersion,
      reportPackageProfile: _ignoredPackageProfile,
      ...rest
    } = item
    // Parse the package labels once per composite and reuse for every child
    // instead of re-parsing the frozen report package on each mapped item.
    const packageSlotLabels = getFrozenPackageSlotLabels(item)
    return {
      ...rest,
      reportPackage: reportPackageSummary(item),
      copyable: Boolean(item.copyable),
      createdBy: item.createdBy,
      creator: item.creator ? { id: item.creator.id, role: item.creator.role } : null,
      course: item.course
        ? { id: item.course.id, title: item.course.title, courseCode: item.course.courseCode, isLibrary: item.course.isLibrary }
        : null,
      canSetCopyable: canSetCopyableFor(item, role),
      itemCount: item.items.length,
      items: item.items.map((child: any) => mapItemForTeacher(child, packageSlotLabels, situationalMetadata)),
      attemptCounts: counts.get(item.id) ?? emptyAttemptCounts(),
    }
  })
}

export const getCompositeForTeacher = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  const { ensureCompositeFormSections, listCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(id)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role, true)
  const situationalMetadata = await loadSituationalReleaseMetadata(composite.items.filter((item: any) => item.type === 'SITUATIONAL').map(situationalItemIdentity))
  const counts = await loadAttemptCountsByCompositeIds([composite.id], userId, role)
  const [contentUnits, formSections] = await Promise.all([
    listCompositeContentUnits(composite.id),
    listCompositeFormSections(composite.id),
  ])
  return {
    id: composite.id,
    productKind: composite.productKind,
    questionnaireType: composite.questionnaireType,
    ...(composite.personalTracking?{personalTracking:{baselineId:composite.personalTrackingBaselineId,ordinal:composite.personalTrackingOrdinal}}:{}),
    trainingFlowDraft:composite.trainingFlowDraft??null,trainingFlowFrozen:composite.trainingFlowFrozen??null,trainingFlowDigest:composite.trainingFlowDigest??null,
    trainingVariantDraft:composite.trainingVariantDraft??null,trainingVariantFrozen:composite.trainingVariantFrozen??null,trainingVariantDigest:composite.trainingVariantDigest??null,
    trainingFeedbackPolicy:composite.trainingFeedbackPolicy??null,trainingFeedbackPolicyHash:composite.trainingFeedbackPolicyHash??null,
    trainingPersistencePolicy:composite.trainingPersistencePolicy??null,trainingPersistencePolicyHash:composite.trainingPersistencePolicyHash??null,
    trainingTimingPolicy:composite.trainingTimingPolicy??null,timingExportEnabled:composite.timingExportEnabled===true,
    revision: composite.revision,
    questionnaireCourses: composite.questionnaireCourses,
    code: composite.code,
    name: composite.name,
    description: composite.description,
    instruction: composite.instruction,
    status: composite.status,
    courseId: composite.courseId,
    opensAt: composite.opensAt,
    expiresAt: composite.expiresAt,
    maxAttempts: composite.maxAttempts,
    publicEnabled: composite.publicEnabled,
    copyable: Boolean(composite.copyable),
    createdBy: composite.createdBy,
    creator: composite.creator ? { id: composite.creator.id, role: composite.creator.role } : null,
    course: composite.course
      ? { id: composite.course.id, title: composite.course.title, courseCode: composite.course.courseCode, isLibrary: composite.course.isLibrary }
      : null,
    canSetCopyable: canSetCopyableFor(composite, role),
    publishedAt: composite.publishedAt,
    reportPackage: reportPackageSummary(composite),
    // Legacy protocol metadata is retained only for historical composites that
    // predate PR6B; new package instances expose package semantics instead.
    analysisProtocol: !composite.reportPackageKey && composite.analysisProtocolKey
      ? {
          key: composite.analysisProtocolKey,
          version: composite.analysisProtocolVersion,
          profile:
            composite.items.find((item: any) => item.type === 'COGNITIVE')?.cognitiveAssignment?.profile
            ?? null,
          frozen: Boolean(composite.analysisProtocolSnapshotEncrypted),
        }
      : null,
    items: composite.items.map((item: any) => mapItemForTeacher(item, getFrozenPackageSlotLabels(composite), situationalMetadata)),
    deliveryMode: 'FINAL_ONLY' as const,
    formSections,
    units: contentUnits,
    attemptCounts: counts.get(composite.id) ?? emptyAttemptCounts(),
  }
}

export const listLibraryTemplates = async (userId: string, role: UserRole) => {
  assertTeacher(role)
  const list = await prisma.compositeAssessment.findMany({
    where: { copyable: true, status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    include: {
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, isLibrary: true, title: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: { select: { name: true } },
          cognitiveAssignment: { select: { title: true, config: { select: { name: true } } } },
        },
      },
    },
  })
  const templates = list.filter(isAdminLibraryTemplate)
  const supported = config.cognitiveModuleEnabled
    ? templates
    : templates.filter((item) => !item.items.some((child) => child.type === 'COGNITIVE'))
  return supported.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    items: item.items.map((child) => ({
      type: child.type,
      position: child.position,
      label: resolveLibraryItemLabel(child, getFrozenPackageSlotLabels(item)),
    })),
  }))
}

export const copyComposite = async (userId: string, role: UserRole, sourceId: string, input: CopyCompositeInput) => {
  assertTeacher(role)
  const source = await prisma.compositeAssessment.findUnique({
    where: { id: sourceId },
    include: {
      creator: { select: { id: true, role: true } },
      course: { select: { id: true, isLibrary: true, title: true } },
      items: {
        orderBy: { position: 'asc' },
        include: {
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              status: true,
              instrumentClass: true,
              instrumentVersion: true,
              definition: true,
            },
          },
          cognitiveAssignment: { include: { config: true } },
        },
      },
    },
  })
  if (!source) throw compositeNotFound()
  assertNotOrganizationResourceGenericEntry(source)
  if(source.trainingFlowDraft!=null||source.trainingFlowFrozen!=null)throw compositeBadRequest('条件流程请使用问卷专用复制入口')
  if(source.trainingVariantDraft!=null||source.trainingVariantFrozen!=null)throw compositeBadRequest('概率分卷请使用问卷专用复制入口')
  const selfCopy = source.createdBy === userId
  const libraryCopy = isAdminLibraryTemplate(source)
  if (!selfCopy && !libraryCopy) throw compositeForbidden('不能复制此综合测评')
  if (source.productKind === 'ASSESSMENT_BUNDLE') throw compositeConflict('固定测评包不能复制为可编辑问卷，请使用原固定版本创建投放')

  const hasPackageKey = Boolean(source.reportPackageKey)
  const hasPackageVersion = Boolean(source.reportPackageVersion)
  const hasPackageProfile = Boolean(source.reportPackageProfile)
  const hasPackageSnapshot = Boolean(source.reportPackageSnapshotEncrypted)
  if (
    hasPackageKey !== hasPackageVersion
    || hasPackageKey !== hasPackageProfile
    || (hasPackageSnapshot && !hasPackageKey)
    || (source.status === 'PUBLISHED' && hasPackageKey && !hasPackageSnapshot)
  ) {
    throw compositeBadRequest('来源综合测评的报告包冻结信息不完整')
  }
  const packageDefinition = hasPackageKey && hasPackageVersion
    ? requirePublishedReportPackage(source.reportPackageKey as string, source.reportPackageVersion as string)
    : null
  if (packageDefinition && !await canUseReportPackage(userId, role, packageDefinition.key, packageDefinition.version)) {
    throw compositeForbidden('没有该报告包的授权，不能创建新的包实例')
  }
  if (packageDefinition && hasPackageSnapshot) {
    try {
      const protocol = requirePublishedAnalysisProtocol(
        packageDefinition.analysisProtocolKey,
        packageDefinition.analysisProtocolVersion,
      )
      validateFrozenReportPackageSnapshot(
        readFrozenReportPackageSnapshot(source.reportPackageSnapshotEncrypted as string),
        packageDefinition,
        protocol,
        source.items,
      )
      const frozenPackage = readFrozenReportPackageSnapshot(source.reportPackageSnapshotEncrypted as string)
      if (frozenPackage.profile !== source.reportPackageProfile) {
        throw new Error('来源报告包快照 Profile 与实例不匹配')
      }
    } catch (err) {
      throw compositeBadRequest(err instanceof Error ? err.message : '来源报告包快照不可用')
    }
  }

  const hasProtocolKey = Boolean(source.analysisProtocolKey)
  const hasProtocolVersion = Boolean(source.analysisProtocolVersion)
  const hasProtocolSnapshot = Boolean(source.analysisProtocolSnapshotEncrypted)
  if (
    hasProtocolKey !== hasProtocolVersion ||
    (hasProtocolSnapshot && !hasProtocolKey) ||
    (source.status === 'PUBLISHED' && hasProtocolKey && !hasProtocolSnapshot)
  ) {
    throw compositeBadRequest('来源综合测评的分析协议冻结信息不完整')
  }
  if (hasPackageKey && (!hasProtocolKey || !hasProtocolVersion)) {
    throw compositeBadRequest('来源综合测评的报告包内部协议引用不完整')
  }
  if (!hasPackageKey && (hasProtocolKey || hasProtocolVersion || hasProtocolSnapshot)) {
    throw compositeBadRequest('旧版固定协议实例不能复制，请从获授权报告包创建')
  }
  if (hasProtocolSnapshot) {
    try {
      const snapshot = readFrozenAnalysisProtocolSnapshot(source.analysisProtocolSnapshotEncrypted as string)
      validateFrozenAnalysisProtocolSnapshot(
        snapshot,
        source.analysisProtocolKey as string,
        source.analysisProtocolVersion as string,
        source.items,
      )
    } catch (err) {
      throw compositeBadRequest(err instanceof Error ? err.message : '来源综合分析协议快照不可用')
    }
  }

  const hasCognitive = source.items.some((item) => item.type === 'COGNITIVE')
  if (hasCognitive) assertCognitiveModuleEnabled()
  if (libraryCopy && !input.courseId) throw compositeBadRequest('复制管理员模板必须选择自己的授课课')

  const targetCourseId = libraryCopy ? input.courseId : (input.courseId === undefined ? source.courseId : input.courseId)
  if (hasCognitive && !targetCourseId) throw compositeBadRequest('含认知模块的模板必须绑定课程')
  await validateCourse(targetCourseId, userId, role, { allowLibrary: false, requireOwnCourse: true })

  let code = input.code ?? `${source.code}_copy_${nanoid(8)}`
  const name = input.name ?? `${source.name}（副本）`

  return prisma.$transaction(async (tx) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const taken = await tx.compositeAssessment.findUnique({ where: { code } })
      if (!taken) break
      if (input.code || attempt === 3) throw compositeConflict('综合测评编码已存在')
      code = `${source.code}_copy_${nanoid(8)}`
    }

    const situationalReleases = await resolveCompositeSituationalItems(source.items, tx, true, compositeSjtGrantScope({ ...source, courseId: targetCourseId }, userId))
    const itemData: Array<Record<string, unknown>> = []
    for (const item of source.items) {
      if (item.type === 'SCALE') {
        if (!item.scaleId || item.scale?.status !== 'PUBLISHED') throw compositeBadRequest('综合测评包含未发布量表')
        itemData.push({ type: 'SCALE', position: item.position, required: item.required, scaleId: item.scaleId })
      } else if (item.type === 'FORM') {
        if (item.formPolicy != null) throw compositeBadRequest('Form V3 请使用新版问卷复制入口，保持区段和策略')
        if (item.formDefinition != null) typedCompositeFormQuestion({ ...item, formType: item.formType ?? '', formLabel: item.formLabel ?? '', placeholder: item.formPlaceholder ?? null })
        itemData.push({
          type: 'FORM',
          position: item.position,
          required: item.required,
          formType: item.formType,
          formLabel: item.formLabel,
          formPlaceholder: item.formPlaceholder,
          formOptions: item.formOptions ?? undefined,
          formDefinition: item.formDefinition ?? undefined,
          contextKey: item.contextKey ?? undefined,
        })
      } else if (item.type === 'COGNITIVE') {
        const assignment = item.cognitiveAssignment
        if (!assignment?.configId || !targetCourseId) throw compositeBadRequest('认知任务配置不存在')
        const ensured = await ensureTeacherPublishedAssignment(tx, {
          userId,
          courseId: targetCourseId,
          configId: assignment.configId,
          title: assignment.title || assignment.config.name,
          instruction: assignment.instruction ?? assignment.config.instruction ?? null,
          sourceFreeze: {
            ...(readTrainingCognitiveTaskBinding(assignment.courseSnapshot)?{selectedCognitiveProfile:readTrainingCognitiveTaskBinding(assignment.courseSnapshot)!}:{}),
            profile: assignment.profile ?? null,
            profileDefinitionVersion: assignment.profileDefinitionVersion ?? null,
            resolvedConfigSnapshotEncrypted: assignment.resolvedConfigSnapshotEncrypted ?? null,
            resolvedConfigHash: assignment.resolvedConfigHash ?? null,
            resolvedReportSnapshotEncrypted: assignment.resolvedReportSnapshotEncrypted ?? null,
          },
        })
        itemData.push({
          type: 'COGNITIVE',
          position: item.position,
          required: item.required,
          cognitiveAssignmentId: ensured.id,
        })
      } else if (item.type === 'SITUATIONAL') {
        assertSituationalCompositeItem(situationalReleases.get(situationalReleaseKey(situationalItemIdentity(item)))!)
        itemData.push({
          type: 'SITUATIONAL',
          position: item.position,
          required: item.required,
          situationalInstrumentKey: item.situationalInstrumentKey,
          situationalInstrumentVersion: item.situationalInstrumentVersion,
        })
      }
    }

    const copied = await tx.compositeAssessment.create({
      data: {
        code,
        name,
        description: source.description,
        instruction: source.instruction,
        status: 'DRAFT',
        courseId: targetCourseId,
        createdBy: userId,
        maxAttempts: source.maxAttempts,
        publicEnabled: false,
        copyable: false,
        copiedFromId: source.id,
        analysisProtocolKey: source.analysisProtocolKey ?? null,
        analysisProtocolVersion: source.analysisProtocolVersion ?? null,
        analysisProtocolSnapshotEncrypted: source.analysisProtocolSnapshotEncrypted ?? null,
        reportPackageKey: source.reportPackageKey ?? null,
        reportPackageVersion: source.reportPackageVersion ?? null,
        reportPackageProfile: source.reportPackageProfile ?? null,
        reportPackageSnapshotEncrypted: source.reportPackageSnapshotEncrypted ?? null,
        items: { create: itemData as any },
      },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    // Atomic materialize-on-write: copied FORM modules are sectioned inside the
    // same transaction so the copy is never served with orphans on GET/start.
    if (itemData.some((item) => item.type === 'FORM')) {
      const { ensureCompositeFormSections } = await import('./final-submit.service')
      await ensureCompositeFormSections(copied.id, tx)
      // Re-read the durable rows after materialization. Returning the create()
      // snapshot here would expose formSectionId=null even though the copied
      // item is already bound in the same transaction.
      const materialized = await tx.compositeAssessment.findUnique({
        where: { id: copied.id },
        include: { items: { orderBy: { position: 'asc' } } },
      })
      if (!materialized) throw compositeNotFound()
      return withoutAnalysisProtocolCipher(materialized)
    }
    return withoutAnalysisProtocolCipher(copied)
  })
}

export const listAttemptsForTeacher = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  query: {
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'
    courseId?: string
    q?: string
    page: number
    pageSize: number
  },
) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)

  const courseScope = query.courseId ? await assertCompositeCourseScope(userId, role, compositeId, query.courseId) : null
  const filters: Prisma.CompositeAssessmentAttemptWhereInput[] = [{ compositeAssessmentId: compositeId, ...(courseScope ? { deliveryCourseId: courseScope.id } : {}) }]
  const visibility = await teacherRelationalAttemptVisibility(userId, role)
  if (visibility) filters.push(visibility)
  if (query.status) filters.push({ status: query.status })
  const q = query.q?.trim()
  if (q) {
    filters.push({
      OR: [
        { anonymousCode: { contains: q, mode: 'insensitive' } },
        { user: { is: { nickname: { contains: q, mode: 'insensitive' } } } },
        { user: { is: { username: { contains: q, mode: 'insensitive' } } } },
      ],
    })
  }
  const where: Prisma.CompositeAssessmentAttemptWhereInput = filters.length === 1 ? filters[0] : { AND: filters }

  const [attempts, total, counts] = await Promise.all([
    prisma.compositeAssessmentAttempt.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: [
        { completedAt: { sort: 'desc', nulls: 'last' } },
        { startedAt: 'desc' },
      ],
      select: {
        id: true,
        status: true,
        taskSatisfaction: true,
        participantKey:true,trainingVariantAllocationEncrypted:true,trainingFlowSnapshotEncrypted:true,trainingFlowSnapshotHash:true,trainingFlowPathEncrypted:true,trainingFlowPathHash:true,trainingVariantAllocationHash:true,
        progress: true,
        assignmentRef: true,
        completedItems: true,
        runtimeGeneration: true, deliveryMode:true,
        attemptEpoch: true,
        trainingTimingSnapshot: true,
  frozenActiveSlotSetEncrypted: true,
        frozenActiveSlotSetHash: true,
        startedAt: true,
        lastSavedAt: true,
        completedAt: true,
        totalTime: true,
        anonymousCode: true,
        userId: true,
        user: { select: { id: true, nickname: true, username: true } },
      },
    }),
    prisma.compositeAssessmentAttempt.count({ where }),
    loadAttemptCountsByCompositeIds([compositeId], userId, role, query.courseId),
  ])

  const totalPages = Math.ceil(total / query.pageSize)
  const unifiedIds = attempts.filter(attempt => attempt.runtimeGeneration === 'UNIFIED_V1').map(attempt => attempt.id)
  const headers = unifiedIds.length ? await prisma.assessmentUnitSnapshot.findMany({
    where: { compositeAttemptId: { in: unifiedIds } },
    select: { compositeAttemptId: true, slotKey: true, attemptEpoch: true, unitType: true, terminalState: true, payloadKind: true, sourceType: true, sourceAttemptId: true },
  }) : []
  const headersByAttempt = new Map<string, AggregateSnapshotHeader[]>()
  for (const header of headers) {
    if (!header.compositeAttemptId) continue
    const list = headersByAttempt.get(header.compositeAttemptId) ?? []
    list.push(header)
    headersByAttempt.set(header.compositeAttemptId, list)
  }
  const legacyIds = attempts.filter(attempt => attempt.runtimeGeneration !== 'UNIFIED_V1').map(attempt => attempt.id)
  const legacyRows = legacyIds.length ? await prisma.compositeAssessmentAttempt.findMany({
    where: { id: { in: legacyIds } },
    select: { id: true,
      scaleAssessments: { orderBy: [{ startedAt: 'asc' }, { id: 'asc' }], select: { id: true, compositeItemId: true, compositeItem: { select: { type: true } }, status: true, attemptEpoch: true } },
      cognitiveSessions: { orderBy: { createdAt: 'asc' }, select: { id: true, compositeItemId: true, compositeItem: { select: { type: true } }, status: true, attemptNo: true } },
      situationalAttempts: { orderBy: { createdAt: 'asc' }, select: { id: true, compositeItemId: true, compositeItem: { select: { type: true } }, status: true, attemptEpoch: true, attemptNo: true } },
    },
  }) : []
  const legacyById = new Map(legacyRows.map(row => [row.id, row]))
  return {
    assessment: {
      id: composite.id,
      name: composite.name,
      productKind: composite.productKind,
      code: composite.code,
      status: composite.status,
      courseId: composite.courseId,
    },
    ...(courseScope ? { courseScope } : {}),
    attemptCounts: counts.get(compositeId) ?? emptyAttemptCounts(),
    list: await Promise.all(attempts.map(async attempt => {
      const variantScope=await resolveTrainingAttemptScope(attempt,composite)
      const attemptHeaders = headersByAttempt.get(attempt.id) ?? []
      const ordinary = !attempt.assignmentRef && ['QUESTIONNAIRE', 'LEGACY_COMPOSITE'].includes(composite.productKind) && !composite.reportPackageKey && !composite.analysisProtocolKey
      const legacy = legacyById.get(attempt.id)
      const partialReportUnitCount = !ordinary ? 0 : attempt.runtimeGeneration === 'UNIFIED_V1'
        ? new Set((await loadFrozenMeasurementFinalHeaders(attempt, attemptHeaders)).map(header => header.sourceAttemptId)).size
        : legacy ? [
          completedMeasurementChildren(legacy.scaleAssessments, attempt.attemptEpoch).filter(child => child.compositeItem?.type === 'SCALE'),
          completedMeasurementChildren(legacy.cognitiveSessions, attempt.attemptEpoch).filter(child => child.compositeItem?.type === 'COGNITIVE'),
          completedMeasurementChildren(legacy.situationalAttempts, attempt.attemptEpoch).filter(child => child.compositeItem?.type === 'SITUATIONAL'),
        ].reduce((sum, children) => sum + children.length, 0) : 0
      return { ...mapAttemptRowForTeacher({ ...attempt, ...await loadFrozenCompositeProgress(attempt, attemptHeaders) }),
        variant:trainingVariantProvenance(variantScope), partialReportAvailable: partialReportUnitCount > 0, partialReportUnitCount }
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages,
    hasMore: query.page < totalPages,
  }
}

export const updateComposite = async (userId: string, role: UserRole, id: string, input: UpdateCompositeInput) => {
  assertTeacher(role)
  const existing = await loadComposite(id, true)
  assertOwner(existing, userId, role)
  const providedKeys = (Object.keys(input) as Array<keyof UpdateCompositeInput>).filter((key) => input[key] !== undefined)
  if (input.copyable !== undefined) {
    if (role !== UserRole.ADMIN) throw compositeForbidden('只有管理员可以把综合测评标为库模板')
    if (existing.status !== 'PUBLISHED') throw compositeBadRequest('只有已发布的综合测评可以设为库模板')
    if (existing.creator?.role !== UserRole.ADMIN) throw compositeForbidden('只能把管理员创建的综合测评标为库模板')
    if (existing.course?.isLibrary !== true) throw compositeBadRequest('只有绑定库课程的综合测评可以设为模板')
  }
  const publicWindowKeys = role === UserRole.ADMIN
    ? (['expiresAt', 'publicEnabled', 'copyable'] as const)
    : (['expiresAt', 'publicEnabled'] as const)
  const publicWindowOnly = providedKeys.length > 0 && providedKeys.every((key) => (publicWindowKeys as readonly string[]).includes(key))
  if (existing.productKind === 'ASSESSMENT_BUNDLE' && !publicWindowOnly) throw compositeConflict('固定测评包不能通过普通问卷编辑入口修改')
  if (existing.status !== 'DRAFT' && !publicWindowOnly) {
    throw compositeConflict('已发布的综合测评只能调整公开有效期')
  }
  const nextCourseId = input.courseId === undefined ? existing.courseId : input.courseId
  if (existing.status === 'DRAFT') {
    await validateCourse(nextCourseId, userId, role, { allowLibrary: role === UserRole.ADMIN })
    if (
      input.courseId !== undefined &&
      input.courseId !== existing.courseId &&
      existing.items.some((item: { type: string }) => item.type === 'COGNITIVE')
    ) {
      throw compositeBadRequest('请先移除认知模块，或复制到目标课程')
    }
  }
  const nextOpensAt = input.opensAt === undefined ? existing.opensAt : parseDate(input.opensAt)
  const nextExpiresAt = input.expiresAt === undefined ? existing.expiresAt : parseDate(input.expiresAt)
  if (nextOpensAt && nextExpiresAt && nextExpiresAt.getTime() < nextOpensAt.getTime()) {
    throw compositeBadRequest('expiresAt 必须晚于或等于 opensAt')
  }
  if ((input.publicEnabled ?? existing.publicEnabled) && !nextExpiresAt) {
    throw compositeBadRequest('公开链接必须设置有效期')
  }
  const updated = await prisma.compositeAssessment.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(input.opensAt !== undefined ? { opensAt: parseDate(input.opensAt) } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: parseDate(input.expiresAt) } : {}),
      ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
      ...(input.publicEnabled !== undefined ? { publicEnabled: input.publicEnabled } : {}),
      ...(input.copyable !== undefined ? { copyable: input.copyable } : {}),
    },
  })
  return withoutAnalysisProtocolCipher(updated)
}

export const setCompositeAnalysisProtocol = async (
  userId: string,
  role: UserRole,
  id: string,
  input: SetCompositeAnalysisProtocolInput,
) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  if (composite.productKind === 'ASSESSMENT_BUNDLE') throw compositeConflict('固定测评包的分析规则不能修改')
  if (composite.productKind === 'QUESTIONNAIRE') throw compositeBadRequest('问卷只提供独立结果，不能绑定综合报告')
  assertDraft(composite)
  if (composite.reportPackageKey) {
    throw compositeConflict('报告包实例不能通过旧版分析协议接口修改')
  }

  const hasKey = Boolean(composite.analysisProtocolKey)
  const hasVersion = Boolean(composite.analysisProtocolVersion)
  const hasSnapshot = Boolean(composite.analysisProtocolSnapshotEncrypted)
  if (hasKey !== hasVersion || (hasSnapshot && !hasKey)) {
    throw compositeBadRequest('综合测评的分析协议冻结信息不完整')
  }

  const selection = input.analysisProtocol
  if (!selection) {
    const updated = await prisma.compositeAssessment.update({
      where: { id },
      data: {
        analysisProtocolKey: null,
        analysisProtocolVersion: null,
        analysisProtocolSnapshotEncrypted: null,
      },
    })
    return withoutAnalysisProtocolCipher(updated)
  }

  assertCognitiveModuleEnabled()
  if (!composite.courseId) throw compositeBadRequest('综合分析协议必须绑定课程')
  const protocol = requirePublishedAnalysisProtocol(selection.key, selection.version)
  if (!hasKey && composite.items.length > 0) {
    throw compositeConflict('请选择空白草稿启用固定分析协议，或先移除现有模块')
  }

  return prisma.$transaction(async (tx: Db) => {
    if (hasKey) {
      await tx.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: id } })
    }
    const updated = await tx.compositeAssessment.update({
      where: { id },
      data: {
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotEncrypted: null,
      },
    })
    await materializeAnalysisProtocol(tx, {
      compositeId: id,
      courseId: composite.courseId,
      userId,
      profile: selection.profile,
      protocol,
    })
    return withoutAnalysisProtocolCipher(updated)
  })
}

export const setCompositeReportPackage = async (
  userId: string,
  role: UserRole,
  id: string,
  input: SetCompositeReportPackageInput,
) => {
  assertTeacher(role)
  const composite = await loadComposite(id, true)
  assertOwner(composite, userId, role)
  if (composite.productKind === 'ASSESSMENT_BUNDLE') throw compositeConflict('固定测评包的综合报告定义不能修改')
  if (composite.productKind === 'QUESTIONNAIRE') throw compositeBadRequest('问卷只提供独立结果，不能绑定综合报告')
  assertDraft(composite)

  const selection = input.reportPackage
  if (!selection) {
    if (composite.reportPackageKey) {
      throw compositeConflict('已配置的报告包只能通过复制创建新的 collection-only 草稿')
    }
    return withoutAnalysisProtocolCipher(composite)
  }

  assertCognitiveModuleEnabled()
  if (!composite.courseId) throw compositeBadRequest('报告包必须绑定课程')
  const definition = requirePublishedReportPackage(selection.key, selection.version)
  if (!definition.profiles.includes(selection.profile)) throw compositeBadRequest('报告包不支持该 Profile')
  if (!await canUseReportPackage(userId, role, definition.key, definition.version)) {
    throw compositeForbidden('没有该报告包的授权')
  }
  if (!composite.reportPackageKey && composite.items.length > 0) {
    throw compositeConflict('请选择空白草稿启用报告包，或先移除现有模块')
  }

  const protocol = requirePublishedAnalysisProtocol(
    definition.analysisProtocolKey,
    definition.analysisProtocolVersion,
  )
  return prisma.$transaction(async (tx: Db) => {
    if (composite.reportPackageKey) {
      await tx.compositeAssessmentItem.deleteMany({ where: { compositeAssessmentId: id } })
    }
    const updated = await tx.compositeAssessment.update({
      where: { id },
      data: {
        reportPackageKey: definition.key,
        reportPackageVersion: definition.version,
        reportPackageProfile: selection.profile,
        reportPackageSnapshotEncrypted: null,
        // Keep the internal protocol reference for the existing frozen task
        // machinery; it is never exposed as the teacher-facing mode.
        analysisProtocolKey: protocol.key,
        analysisProtocolVersion: protocol.version,
        analysisProtocolSnapshotEncrypted: null,
      },
    })
    await materializeReportPackage(tx, {
      compositeId: id,
      courseId: composite.courseId as string,
      userId,
      profile: selection.profile,
      packageDefinition: definition,
    })
    return withoutAnalysisProtocolCipher(updated)
  })
}

export const addItem = async (userId: string, role: UserRole, compositeId: string, input: AddCompositeItemInput) => {
  assertTeacher(role)
  if (input.required !== true && !(input.type === 'FORM' && input.formDefinition)) throw compositeBadRequest('新增加的综合测评模块必须为必答模块')
  // Atomic materialize-on-write: the item create and its section assignment
  // share one transaction so a crash can never leave an orphan FORM module
  // that GET/start/publish would otherwise have to lazily repair.
  const item = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${compositeId} FOR UPDATE`
    const composite = await loadComposite(compositeId, true, tx)
    assertOwner(composite, userId, role)
    assertDraft(composite)
    assertCollectionOnlyEditing(composite)
    await assertValidItem(input, userId, role, composite, tx)
    const position = input.position ?? Math.max(-1, ...composite.items.map((item: any) => item.position), ...(composite.formSections ?? []).map((section: any) => section.position)) + 1
    if (composite.items.some((item: any) => item.position === position)) throw compositeConflict('模块排序位置已存在')
    const itemId = randomUUID()
    const created = await tx.compositeAssessmentItem.create({
      data: {
        id: itemId,
        compositeAssessmentId: compositeId,
        type: input.type,
        position,
        required: input.required,
        scaleId: input.type === 'SCALE' ? input.scaleId : null,
        cognitiveAssignmentId: input.type === 'COGNITIVE' ? input.cognitiveAssignmentId : null,
        situationalInstrumentKey: input.type === 'SITUATIONAL' ? input.situationalInstrumentKey : null,
        situationalInstrumentVersion: input.type === 'SITUATIONAL' ? input.situationalInstrumentVersion : null,
        formType: input.type === 'FORM' ? input.formType : null,
        ...(input.type === 'FORM' && input.formPolicy ? {formPolicy:input.formPolicy}: {}),
        ...(input.type === 'FORM' && input.formDefinition ? { formDefinition: { ...input.formDefinition, itemKey: 'q_' + itemId } as Prisma.InputJsonValue } : {}),
        formLabel: input.type === 'FORM' ? input.formLabel : null,
        formPlaceholder: input.type === 'FORM' ? input.formPlaceholder ?? null : null,
        formOptions: input.type === 'FORM' ? (input.formOptions as any) ?? null : null,
        contextKey: input.type === 'FORM' ? input.contextKey ?? null : null,
      },
    })
    if (created.type === 'FORM') {
      const { ensureCompositeFormSections } = await import('./final-submit.service')
      await ensureCompositeFormSections(compositeId, tx)
    }
    await tx.compositeAssessment.update({ where: { id: compositeId }, data: { revision: { increment: 1 } } })
    return created
  })
  return item
}

export const removeItem = async (userId: string, role: UserRole, compositeId: string, itemId: string) => {
  assertTeacher(role)
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${compositeId} FOR UPDATE`
    const composite = await loadComposite(compositeId, false, tx)
    assertOwner(composite, userId, role)
    assertDraft(composite)
    assertCollectionOnlyEditing(composite)
    const item = await tx.compositeAssessmentItem.findUnique({ where: { id: itemId } })
    if (!item || item.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评模块不存在')
    await tx.compositeAssessmentItem.delete({ where: { id: itemId } })
    if (item.formSectionId && !await tx.compositeAssessmentItem.count({ where: { formSectionId: item.formSectionId } })) {
      await tx.compositeFormSection.delete({ where: { id: item.formSectionId } })
    }
    await tx.compositeAssessment.update({ where: { id: compositeId }, data: { revision: { increment: 1 } } })
  })
}

type CompositeContentUnitInput = {
  type: 'scale' | 'cognitive' | 'situational' | 'form-section' | 'SCALE' | 'COGNITIVE' | 'SITUATIONAL' | 'FORM_SECTION'
  id: string
  position: number
}

export const removeEmptyFormSection = async (userId: string, role: UserRole, compositeId: string, sectionId: string) => {
  assertTeacher(role)
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${compositeId} FOR UPDATE`
    const composite = await loadComposite(compositeId, false, tx)
    assertOwner(composite, userId, role)
    assertDraft(composite)
    assertCollectionOnlyEditing(composite)
    const section = await tx.compositeFormSection.findFirst({ where: { id: sectionId, compositeAssessmentId: compositeId }, include: { _count: { select: { items: true } } } })
    if (!section) throw compositeNotFound('表单区段不存在')
    if (section._count.items) throw compositeConflict('区段中还有字段，请先移除或移动字段')
    await tx.compositeFormSection.delete({ where: { id: sectionId } })
    await tx.compositeAssessment.update({ where: { id: compositeId }, data: { revision: { increment: 1 } } })
  })
}

const canonicalCompositeContentUnitType = (type: CompositeContentUnitInput['type']) => {
  if (type === 'scale' || type === 'SCALE') return 'scale' as const
  if (type === 'cognitive' || type === 'COGNITIVE') return 'cognitive' as const
  if (type === 'situational' || type === 'SITUATIONAL') return 'situational' as const
  return 'form-section' as const
}

const compositeSectionHasContext = (section: any) => (
  Boolean(section.contextSection) || Boolean(section.items?.some((item: any) => item.contextKey))
)

export const compositeFormSectionRuntimeDefinition = (section: any) => {
  const items = [...(section.items ?? [])]
    .sort((left: any, right: any) => (left.formSectionPosition ?? left.position) - (right.formSectionPosition ?? right.position))
    .map((item: any) => ({
      id: item.id,
      formType: item.formType,
      formLabel: item.formLabel,
      placeholder: item.formPlaceholder ?? null,
      required: item.required !== false,
      formOptions: item.formOptions,
      ...(item.formDefinition != null ? { formDefinition: item.formDefinition } : {}),
      ...(item.formPolicy != null ? { formPolicy: item.formPolicy } : {}),
      contextKey: item.contextKey ?? null,
      position: item.position,
      formSectionPosition: item.formSectionPosition ?? null,
    }))
  return {
    id: section.id,
    title: section.title,
    description: section.description ?? null,
    position: section.position,
    contextSection: compositeSectionHasContext(section),
    items,
  }
}

const assertCompositeContentUnitOrder = (units: Array<{ type: string; id: string }>, sections: any[]) => {
  const contextSections = sections.filter(compositeSectionHasContext)
  if (contextSections.length > 1) throw compositeBadRequest('同一综合测评只能有一个上下文区段')
  if (contextSections[0] && (units[0]?.type !== 'form-section' || units[0].id !== contextSections[0].id)) {
    throw compositeBadRequest('人口学上下文区段必须是第一个内容单元')
  }
}

export const listCompositeContentUnits = async (compositeId: string) => {
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(compositeId)
  const composite = await loadComposite(compositeId, true)
  const packageSlotLabels = getFrozenPackageSlotLabels(composite)
  return [
    ...composite.items
      .filter((item: any) => item.type !== 'FORM')
      .map((item: any) => ({
        type: item.type === 'SCALE' ? 'scale' as const : item.type === 'COGNITIVE' ? 'cognitive' as const : 'situational' as const,
        id: item.id,
        position: item.position,
        label: resolveCompositeItemLabel(item, packageSlotLabels),
        itemCount: 1,
        contextSection: false,
      })),
    ...(composite.formSections ?? []).map((section: any) => ({
      type: 'form-section' as const,
      id: section.id,
      position: section.position,
      label: section.title,
      itemCount: section.items.length,
      contextSection: compositeSectionHasContext(section),
    })),
  ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
}

export const reorderCompositeContentUnits = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  input: CompositeContentUnitInput[],
) => {
  assertTeacher(role)
  await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${compositeId} FOR UPDATE`
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(compositeId, tx)
  const composite = await loadComposite(compositeId, true, tx)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  assertCollectionOnlyEditing(composite)

  const sections = composite.formSections ?? []
  const childItems = composite.items.filter((item: any) => item.type !== 'FORM')
  const expected = new Map<string, string>([
    ...childItems.map((item: any) => [
      `${item.type === 'SCALE' ? 'scale' : item.type === 'COGNITIVE' ? 'cognitive' : 'situational'}:${item.id}`,
      item.type === 'SCALE' ? 'scale' : item.type === 'COGNITIVE' ? 'cognitive' : 'situational',
    ] as const),
    ...sections.map((section: any) => [`form-section:${section.id}`, 'form-section'] as const),
  ])
  if (input.length !== expected.size) throw compositeBadRequest('必须同时提交全部内容单元的排序')
  if (input.some((item) => !Number.isInteger(item.position) || item.position < 0)) {
    throw compositeBadRequest('内容排序位置必须是非负整数')
  }
  const ordered = [...input].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  if (new Set(ordered.map((item) => item.position)).size !== ordered.length) throw compositeBadRequest('内容排序位置不能重复')
  const seen = new Set<string>()
  const normalized = ordered.map((item) => {
    const type = canonicalCompositeContentUnitType(item.type)
    const key = `${type}:${item.id}`
    if (seen.has(key) || expected.get(key) !== type) throw compositeBadRequest('内容单元排序数据无效')
    seen.add(key)
    return { type, id: item.id }
  })
  if (seen.size !== expected.size || [...expected.keys()].some((key) => !seen.has(key))) {
    throw compositeBadRequest('内容单元排序列表与综合测评内容不一致')
  }
  assertCompositeContentUnitOrder(normalized, sections)

  // Form item positions remain frozen for legacy report/package label reads.
  // New free-composition units use an isolated position range shared by child
  // modules and sections, so a section can move across a Scale/Cognitive item
  // without colliding with the physical FORM rows.
  const unitBase = Math.max(
    1000,
    ...composite.items.map((item: any) => item.position),
    ...sections.map((section: any) => section.position),
    ...input.map((item) => item.position),
  ) + expected.size + 1
  const itemTemporaryBase = unitBase + expected.size + composite.items.length + 1
  const sectionTemporaryBase = unitBase + expected.size + sections.length + 1
    for (const [index, item] of childItems.entries()) {
      await tx.compositeAssessmentItem.update({ where: { id: item.id }, data: { position: itemTemporaryBase + index } })
    }
    for (const [index, section] of sections.entries()) {
      await tx.compositeFormSection.update({ where: { id: section.id }, data: { position: sectionTemporaryBase + index } })
    }
    for (const [index, unit] of normalized.entries()) {
      const position = unitBase + index
      if (unit.type === 'form-section') {
        await tx.compositeFormSection.update({ where: { id: unit.id }, data: { position } })
      } else {
        await tx.compositeAssessmentItem.update({ where: { id: unit.id }, data: { position } })
      }
    }
    await tx.compositeAssessment.update({ where: { id: compositeId }, data: { revision: { increment: 1 } } })
  })
  return listCompositeContentUnits(compositeId)
}

export const reorderItems = async (userId: string, role: UserRole, compositeId: string, items: Array<{ id: string; position: number }>) => {
  assertTeacher(role)
  const { ensureCompositeFormSections } = await import('./final-submit.service')
  await ensureCompositeFormSections(compositeId)
  const composite = await loadComposite(compositeId, true)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  assertCollectionOnlyEditing(composite)
  if (items.length !== composite.items.length) throw compositeBadRequest('必须同时提交全部模块的排序')
  const known = new Map(composite.items.map((item: any) => [item.id, item]))
  const itemIds = new Set<string>()
  const positions = new Set<number>()
  for (const item of items) {
    if (!known.has(item.id) || itemIds.has(item.id) || positions.has(item.position) || item.position < 0) {
      throw compositeBadRequest('模块排序数据无效')
    }
    itemIds.add(item.id)
    positions.add(item.position)
  }
  if (itemIds.size !== known.size) throw compositeBadRequest('模块排序数据无效')

  const ordered = [...items].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  const sectionIds = new Set<string>()
  const seenSections = new Set<string>()
  const unitInputs: CompositeContentUnitInput[] = []
  let activeSectionId: string | null = null
  for (const entry of ordered) {
    const item = known.get(entry.id) as any
    if (item.type === 'FORM') {
      if (!item.formSectionId) throw compositeBadRequest('表单字段尚未分配到区段')
      if (activeSectionId !== item.formSectionId) {
        if (seenSections.has(item.formSectionId)) throw compositeBadRequest('同一区段的字段必须连续排列')
        activeSectionId = item.formSectionId
        seenSections.add(item.formSectionId)
        sectionIds.add(item.formSectionId)
        unitInputs.push({ type: 'form-section', id: item.formSectionId, position: entry.position })
      }
      continue
    }
    activeSectionId = null
    unitInputs.push({ type: item.type === 'SCALE' ? 'scale' : item.type === 'COGNITIVE' ? 'cognitive' : 'situational', id: item.id, position: entry.position })
  }
  for (const section of composite.formSections ?? []) {
    if (!sectionIds.has(section.id)) unitInputs.push({ type: 'form-section', id: section.id, position: section.position })
  }
  return reorderCompositeContentUnits(userId, role, compositeId, unitInputs)
}

export const prepareCompositePublication = async (userId: string, role: UserRole, id: string, prisma: Db = defaultPrisma, resolvedSituational?: Map<string, ResolvedSituationalRelease>,standardMode:'PREVIEW'|'PUBLISH'='PREVIEW') => {
  assertTeacher(role)
  // Publish validates, it never repairs. The write-time invariant guarantees
  // every FORM module is sectioned on create/copy/import, so a published
  // composite must never carry an orphan that the participant read path would
  // otherwise have to lazily materialize. loadComposite already includes
  // formSections + items, so the orphan gate below is a pure in-memory assert.
  const composite = await loadComposite(id, true, prisma)
  assertOwner(composite, userId, role)
  assertDraft(composite)
  const feedbackFields = composite.trainingFeedbackPolicy == null && composite.trainingFeedbackPolicyHash == null ? {} : await (await import('../questionnaire-product/service')).validateTrainingFeedbackAuthoring(prisma as Prisma.TransactionClient, composite, composite.trainingFeedbackPolicy)
  const persistenceFields = composite.trainingPersistencePolicy == null ? {} : await (await import('../questionnaire-product/service')).validateTrainingPersistenceAuthoring(prisma as Prisma.TransactionClient, composite, composite.trainingPersistencePolicy)
  if(composite.trainingVariantDraft!=null)await assertTrainingVariantAuthoringScope(prisma as any,composite)
  if (composite.items.length === 0) throw compositeBadRequest(composite.productKind === 'QUESTIONNAIRE'
    ? '问卷内容为空，请先添加表单题或测评项再发布。' : '综合测评至少需要一个模块')
  // Publish gate (Work C): fail closed when any FORM module is not bound to a
  // section. The write-time invariant guarantees every FORM item is sectioned
  // on create/copy/import, so a published composite must never carry an orphan
  // that the participant read path would otherwise have to lazily materialize.
  const orphanFormItems = composite.items.filter((item: any) => item.type === 'FORM' && !item.formSectionId)
  if (orphanFormItems.length > 0) throw compositeBadRequest('综合测评包含未归属区段的表单模块，发布失败')
  const emptySections = (composite.formSections ?? []).filter((section: any) => !section.items.length)
  if (emptySections.length > 0) throw compositeBadRequest(`区段“${emptySections[0].title}”没有字段，请添加字段或移除空区段后发布`)
  await validateCourse(composite.courseId, userId, role, { allowLibrary: role === UserRole.ADMIN })
  if (composite.publicEnabled && !composite.expiresAt) throw compositeBadRequest('公开链接必须设置有效期')

  const contextSections = (composite.formSections ?? []).filter(compositeSectionHasContext)
  if (contextSections.length > 1) throw compositeBadRequest('同一综合测评只能有一个上下文区段')
  const contentUnits = [
    ...composite.items
      .filter((item: any) => item.type !== 'FORM')
      .map((item: any) => ({ type: item.type === 'SCALE' ? 'scale' : item.type === 'COGNITIVE' ? 'cognitive' : 'situational', id: item.id, position: item.position })),
    ...(composite.formSections ?? []).map((section: any) => ({ type: 'form-section', id: section.id, position: section.position })),
  ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  if (contextSections[0] && (
    contentUnits[0]?.type !== 'form-section' || contentUnits[0].id !== contextSections[0].id
  )) {
    throw compositeBadRequest('人口学上下文区段必须是第一个内容单元')
  }
  const sectionByItem = new Map<string, any>(
    (composite.formSections ?? []).flatMap((section: any) => section.items.map((item: any) => [item.id, section] as const)),
  )
  const situationalReleases = resolvedSituational ?? await resolveCompositeSituationalItems(composite.items, prisma, prisma !== defaultPrisma, compositeSjtGrantScope(composite))
  if (prisma !== defaultPrisma) await lockCompositeAssetReferences(prisma, composite.items, composite.formSections ?? [], situationalReleases)
  const contextIssues = validateContextFormItems(
    composite.items.filter((item: any) => item.type === 'FORM').map((item: any) => ({
      id: item.id,
      type: item.formType,
      label: item.formLabel,
      required: item.required,
      position: sectionByItem.get(item.id)?.position ?? item.position,
      contextKey: item.contextKey,
      options: item.formOptions,
    })),
    contentUnits
      .filter((unit) => !(contextSections[0]?.id === unit.id && unit.type === 'form-section'))
      .map((unit) => unit.position),
  )
  if (contextIssues.length > 0) throw compositeBadRequest(contextIssues[0].message)

  for (const item of composite.items) {
    if (item.type === 'COGNITIVE') assertCognitiveModuleEnabled()
    if (item.type === 'SCALE' && (!item.scale || item.scale.status !== 'PUBLISHED')) {
      throw compositeBadRequest('综合测评包含未发布量表')
    }
    if (item.type === 'COGNITIVE' && (!item.cognitiveAssignment || item.cognitiveAssignment.status !== 'PUBLISHED' || item.cognitiveAssignment.config.status !== 'PUBLISHED')) {
      throw compositeBadRequest('综合测评包含未发布认知任务')
    }
    if (item.type === 'COGNITIVE') {
      assertCognitiveAssignmentOnCompositeCourse(item.cognitiveAssignment, composite)
      if (!['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE'].includes(composite.productKind) && !composite.reportPackageKey && item.cognitiveAssignment.listedStandalone === false) {
        throw compositeBadRequest('报告包内部认知任务不能用于仅收集综合测评')
      }
      const pin=readTrainingCognitiveTaskBinding(item.cognitiveAssignment.courseSnapshot)
      if(pin){
       if(item.cognitiveAssignment.createdBy!==userId)throw compositeForbidden('不能发布其他接收者的固定认知配置')
       const fixed=await loadPinnedTrainingCognitiveProfile(prisma as Prisma.TransactionClient,pin,{userId,configId:item.cognitiveAssignment.configId},true)
       assertCognitiveAssignmentFreeze(item.cognitiveAssignment,fixed.artifact)
      }
      validateCognitiveConfig(item.cognitiveAssignment.config, true)
    }
    if (item.type === 'SITUATIONAL') {
      const situation = assertSituationalCompositeItem(situationalReleases.get(situationalReleaseKey(situationalItemIdentity(item)))!)
      await assertSituationalAssetReferencesReady(situation.situationPackage.definition, prisma)
    }
    if (item.type === 'FORM') {
      if (item.formPolicy != null && (composite.productKind !== 'QUESTIONNAIRE' || composite.deliveryMode==='LEGACY' || composite.reportPackageKey || composite.analysisProtocolKey)) throw compositeBadRequest('Form V3 只支持新版普通问卷')
      if (item.formDefinition != null) typedCompositeFormQuestion({ ...item, formType: item.formType ?? '', formLabel: item.formLabel ?? '', placeholder: item.formPlaceholder ?? null })
      if (!item.formType || !item.formLabel) {
        throw compositeBadRequest('综合测评包含未配置完成的表单')
      }
      if (item.formType === 'single_choice' || item.formType === 'multiple_choice') {
        const options = Array.isArray(item.formOptions) ? item.formOptions as Array<{ value: string }> : []
        const values = options.map((option) => option.value)
        if (values.length === 0 || new Set(values).size !== values.length) {
          throw compositeBadRequest('综合测评包含无效的表单选项')
        }
      }
    }
  }

  // New policy sections must remain contiguous after authoring/reorder/import.
  const orderedPolicyItems = [...composite.items].sort((a,b)=>a.position-b.position)
  for (const section of composite.formSections ?? []) {
    if (!section.items.some((item:any)=>item.formPolicy != null)) continue
    const indices = orderedPolicyItems.flatMap((item,index)=>item.formSectionId===section.id?[index]:[])
    if (indices.length && indices[indices.length-1]-indices[0]+1!==indices.length) throw compositeBadRequest('同一 V3 表单区段的字段必须连续，不能跨越其他内容')
  }
  for (const section of composite.formSections ?? []) validateTypedCompositeSectionDefinition(compositeFormSectionRuntimeDefinition(section).items)

  const hasPackageKey = Boolean(composite.reportPackageKey)
  const hasPackageVersion = Boolean(composite.reportPackageVersion)
  const hasPackageProfile = Boolean(composite.reportPackageProfile)
  const hasPackageSnapshot = Boolean(composite.reportPackageSnapshotEncrypted)
  if (
    hasPackageKey !== hasPackageVersion
    || hasPackageKey !== hasPackageProfile
    || (hasPackageSnapshot && !hasPackageKey)
    || (hasPackageKey && !composite.analysisProtocolKey)
  ) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }

  let reportPackageSnapshotEncrypted: string | null = null
  let packageAnalysisProtocolSnapshotEncrypted: string | null = null
  if (hasPackageKey && hasPackageVersion && hasPackageProfile) {
    try {
      const definition = requirePublishedReportPackage(
        composite.reportPackageKey as string,
        composite.reportPackageVersion as string,
      )
      if (!definition.profiles.includes(composite.reportPackageProfile as CognitiveAnalysisProfile)) {
        throw compositeBadRequest('报告包 Profile 不匹配')
      }
      const protocol = requirePublishedAnalysisProtocol(
        definition.analysisProtocolKey,
        definition.analysisProtocolVersion,
      )
      const packageSnapshot = hasPackageSnapshot
        ? readFrozenReportPackageSnapshot(composite.reportPackageSnapshotEncrypted as string)
        : buildFrozenReportPackageSnapshot(definition, protocol, composite.items)
      validateFrozenReportPackageSnapshot(packageSnapshot, definition, protocol, composite.items)
      if (packageSnapshot.profile !== composite.reportPackageProfile) {
        throw compositeBadRequest('报告包快照 Profile 与实例不匹配')
      }
      reportPackageSnapshotEncrypted = hasPackageSnapshot
        ? composite.reportPackageSnapshotEncrypted as string
        : encryptFrozenReportPackageSnapshot(packageSnapshot)
      packageAnalysisProtocolSnapshotEncrypted = encryptFrozenAnalysisProtocolSnapshot(
        packageSnapshot.analysisProtocolSnapshot,
      )
    } catch (err) {
      if (err instanceof CompositeServiceError) throw err
      throw compositeBadRequest(err instanceof Error ? err.message : '报告包冻结校验失败')
    }
  }

  const hasProtocolKey = Boolean(composite.analysisProtocolKey)
  const hasProtocolVersion = Boolean(composite.analysisProtocolVersion)
  const hasProtocolSnapshot = Boolean(composite.analysisProtocolSnapshotEncrypted)
  if (hasProtocolKey !== hasProtocolVersion || (hasProtocolSnapshot && !hasProtocolKey)) {
    throw compositeBadRequest('综合测评的分析协议冻结信息不完整')
  }

  let analysisProtocolSnapshotEncrypted: string | null = packageAnalysisProtocolSnapshotEncrypted
  if (hasProtocolKey && hasProtocolVersion) {
    try {
      if (hasPackageKey && packageAnalysisProtocolSnapshotEncrypted) {
        // The package snapshot above is authoritative; this internal copy is
        // retained solely for the existing task-freeze machinery.
        analysisProtocolSnapshotEncrypted = packageAnalysisProtocolSnapshotEncrypted
      } else if (hasProtocolSnapshot) {
        const snapshot = readFrozenAnalysisProtocolSnapshot(
          composite.analysisProtocolSnapshotEncrypted as string,
        )
        validateFrozenAnalysisProtocolSnapshot(
          snapshot,
          composite.analysisProtocolKey as string,
          composite.analysisProtocolVersion as string,
          composite.items,
        )
        analysisProtocolSnapshotEncrypted = composite.analysisProtocolSnapshotEncrypted
      } else {
        const protocol = requirePublishedAnalysisProtocol(
          composite.analysisProtocolKey as string,
          composite.analysisProtocolVersion as string,
        )
        const snapshot = buildFrozenAnalysisProtocolSnapshot(protocol, composite.items)
        analysisProtocolSnapshotEncrypted = encryptFrozenAnalysisProtocolSnapshot(snapshot)
      }
    } catch (err) {
      if (err instanceof CompositeServiceError) throw err
      throw compositeBadRequest(err instanceof Error ? err.message : '综合分析协议校验失败')
    }
  }

  let flowFields = {}
  if(composite.trainingFlowDraft!=null){
    await assertTrainingFlowAuthoringScope(prisma as any,composite)
    const flow=compileTrainingFlow(composite.trainingFlowDraft,buildTrainingFlowUnits(composite))
    flowFields={trainingFlowFrozen:flow as any,trainingFlowDigest:flow.flowDigest}
  }else if(composite.trainingFlowFrozen!=null||composite.trainingFlowDigest!=null)throw compositeBadRequest('流程草稿与冻结配置不一致')
  let variantFields = {}
  if (composite.trainingVariantDraft != null) {
    const frozen = compileWeightedVariants(composite.trainingVariantDraft, buildTrainingVariantUnion(composite))
    variantFields = { trainingVariantFrozen: frozen as any, trainingVariantDigest: frozen.configDigest }
  } else if (composite.trainingVariantFrozen != null || composite.trainingVariantDigest != null) throw compositeBadRequest('概率分卷草稿与冻结配置不一致')
  let content = composite.items.some((item:any)=>item.type!=='FORM')
    ? await prepareTrainingContentSnapshot(prisma as Prisma.TransactionClient,composite,situationalReleases,'NEW_ADMINISTRATION',standardMode) : null
  if(composite.trainingReportSelectionDraft!=null||composite.trainingReferenceSelectionDraft!=null){
    if(!content||!composite.createdBy)throw compositeBadRequest('报告选择缺少测量来源')
    const expiry=await assertCurrentTrainingContentOwner(prisma as Prisma.TransactionClient,{userId},composite)
    content={...content,...await attachTrainingReportSelection(prisma as Prisma.TransactionClient,{...content,ownerId:composite.createdBy,selection:composite.trainingReportSelectionDraft})}
    content={...content,...await attachTrainingReferenceSelection(prisma as Prisma.TransactionClient,{...content,ownerId:composite.createdBy,selection:composite.trainingReferenceSelectionDraft})}
    if(expiry){
      const [clock]=await (prisma as Prisma.TransactionClient).$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
      if(!clock||expiry<=clock.now)throw compositeForbidden('报告选择作者账号已到期')
    }
  }
  await content?.recheckSourceLicenses()
  return { analysisProtocolSnapshotEncrypted, reportPackageSnapshotEncrypted, ...variantFields, ...flowFields, ...persistenceFields, ...feedbackFields,
    ...(content?{trainingContentSnapshot:content.snapshot as Prisma.InputJsonValue,trainingContentSnapshotHash:content.snapshotHash}:{}) }
}

const publishCompositeInTransaction = async (userId: string, role: UserRole, id: string, db: Db, resolvedSituational?: Map<string, ResolvedSituationalRelease>,trackingSelection?:unknown) => {
  await db.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${id} FOR UPDATE`
  const prepared = await prepareCompositePublication(userId, role, id, db, resolvedSituational,'PUBLISH')
  const publicationSource=await loadComposite(id,true,db)
  const tracking=await freezeTrainingTracking(db as Prisma.TransactionClient,publicationSource,prepared.trainingContentSnapshot,trackingSelection)
  await assertScalePublicationRights(db as Prisma.TransactionClient,userId,role,publicationSource.items.filter((item:any)=>item.type==='SCALE'&&item.standardCombinationSource==null).map((item:any)=>item.scaleId))
  await assertTrainingMaterialsUsable(db as Prisma.TransactionClient,publicationSource.createdBy,trainingFormMaterials(publicationSource.formSections??[]))
  // Shared P/R insertion or material locks may have waited past expiry. Repeat
  // CURRENT exact use/deployment rights after those waits, immediately before
  // publication; only immutable source bodies can be reused in this transaction.
  for(const item of publicationSource.items)if(item.standardCombinationSource!=null)
    await verifyStoredTrainingStandardItem(db as Prisma.TransactionClient,publicationSource,item)
  const published = await db.compositeAssessment.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      ...prepared,
      ...tracking,
    },
  })
  return withoutAnalysisProtocolCipher(published)
}

export const publishComposite = async (userId: string, role: UserRole, id: string, db: Db = defaultPrisma, resolvedSituational?: Map<string, ResolvedSituationalRelease>,trackingSelection?:unknown): Promise<any> =>
  db === defaultPrisma ? defaultPrisma.$transaction(tx => publishCompositeInTransaction(userId, role, id, tx, resolvedSituational,trackingSelection))
    : publishCompositeInTransaction(userId, role, id, db, resolvedSituational,trackingSelection)

const assertTokenWindow = (token: { isActive: boolean; expiresAt: Date; maxUses: number; usedCount: number }) => {
  if (!token.isActive) throw compositeForbidden('公开链接已停用')
  if (token.expiresAt.getTime() < Date.now()) throw compositeForbidden('公开链接已过期')
  if (token.maxUses > 0 && token.usedCount >= token.maxUses) throw compositeConflict('公开链接已达到最大参与次数')
}

const assertCompositeWindow = (composite: { opensAt: Date | null; expiresAt: Date | null }) => {
  if (composite.opensAt && composite.opensAt.getTime() > Date.now()) throw compositeBadRequest('综合测评尚未开始')
  if (composite.expiresAt && composite.expiresAt.getTime() < Date.now()) throw compositeBadRequest('综合测评已过期')
}

export const createAccessTokenForComposite = async (userId: string, role: UserRole, compositeId: string, expiresAt: string, maxUses: number, db: Db = prisma, roundInput:TrainingRoundInput = {}):Promise<any> => {
  assertTeacher(role)
  if((roundInput.groupIpPolicy!==undefined||roundInput.roundId)&&db===defaultPrisma)
    return defaultPrisma.$transaction(tx=>createAccessTokenForComposite(userId,role,compositeId,expiresAt,maxUses,tx,roundInput))
  if(roundInput.groupIpPolicy!==undefined||roundInput.roundId)
    await db.$queryRaw`SELECT id FROM composite_assessments WHERE id=${compositeId} FOR UPDATE`
  if (!Number.isSafeInteger(maxUses) || maxUses < 0 || maxUses > MAX_TOKEN_USES) throw compositeBadRequest('最大参与次数无效')
  const composite = await loadComposite(compositeId, true, db)
  assertOwner(composite, userId, role)
  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('只有已发布综合测评可以生成公开链接')
  assertSupportedComposite(composite)
  assertNotLibraryComposite(composite, '库课程上的综合测评不能公开作答')
  const expiry = new Date(expiresAt)
  if (!publicAccessExpiryWithinPolicy(expiry, { upperBound: composite.expiresAt })) {
    throw compositeBadRequest('公开链接有效期必须在未来一年内，且不能晚于综合测评有效期')
  }
  const round=await prepareTrainingPublicRound(db as Prisma.TransactionClient,composite,userId,roundInput,expiry)
  const rawToken = createAccessToken()
  const record = await db.compositeAssessmentAccessToken.create({
    data: {
      compositeAssessmentId: compositeId,
      ...(round?{trainingRoundId:round.id}:{}),
      token: null,
      tokenHash: hashPublicAccessToken(rawToken),
      tokenEncrypted: encryptPublicAccessToken(rawToken),
      createdBy: userId,
      expiresAt: expiry,
      maxUses,
    },
  })
  return { id: record.id, token: rawToken, expiresAt: record.expiresAt, maxUses: record.maxUses, usedCount: record.usedCount, ...publicRoundMetadata({...record,trainingRound:round}) }
}

export const listAccessTokens = async (userId: string, role: UserRole, compositeId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const records = await prisma.compositeAssessmentAccessToken.findMany({
    where: { compositeAssessmentId: compositeId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, expiresAt: true, maxUses: true, usedCount: true, isActive: true, createdAt: true, trainingRoundId:true,trainingRound:{select:trainingRoundSelect} },
  })
  return records.map(({trainingRound,trainingRoundId,...record}) => ({ ...record, token: null, ...publicRoundMetadata({trainingRound,trainingRoundId}) }))
}

export const revealAccessToken = async (userId: string, role: UserRole, compositeId: string, tokenId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const record = await prisma.compositeAssessmentAccessToken.findFirst({
    where: { id: tokenId, compositeAssessmentId: compositeId },
    select: { id: true, token: true, tokenEncrypted: true, expiresAt: true, maxUses: true, usedCount: true, isActive: true, createdAt: true,trainingRoundId:true,trainingRound:{select:trainingRoundSelect} },
  })
  if (!record) throw compositeNotFound('公开链接不存在')
  const token = record.token || (record.tokenEncrypted ? decryptPublicAccessToken(record.tokenEncrypted) : null)
  if (!token) throw compositeNotFound('公开链接凭证不可恢复')
  logger.info('Public composite link bearer revealed', { compositeId, tokenId, actorUserId: userId })
  return {
    id: record.id,
    ...publicRoundMetadata(record),
    token,
    expiresAt: record.expiresAt,
    maxUses: record.maxUses,
    usedCount: record.usedCount,
    isActive: record.isActive,
    createdAt: record.createdAt,
  }
}

export const disableAccessToken = async (userId: string, role: UserRole, compositeId: string, tokenId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const token = await prisma.compositeAssessmentAccessToken.findUnique({ where: { id: tokenId } })
  if (!token || token.compositeAssessmentId !== compositeId) throw compositeNotFound('公开链接不存在')
  await prisma.compositeAssessmentAccessToken.update({ where: { id: tokenId }, data: { isActive: false } })
}

export const listAvailableForStudent = async (userId: string, now = Date.now(), courseId?: string) => {
  const memberships = await prisma.courseStudent.findMany({ where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] }, ...(courseId ? { courseId } : {}) }, select: { courseId: true } })
  const courseIds = memberships.map((item) => item.courseId)
  if (!courseIds.length) return []
  const list = await prisma.compositeAssessment.findMany({
    // Publication governs new starts. Archived deliveries remain discoverable
    // only for this student's existing work, within their current course scope.
    where: { AND: [{ OR: [
      { status: 'PUBLISHED' },
      { status: 'ARCHIVED', attempts: { some: { userId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } } } },
    ] }], OR: [
      { productKind: { in: ['LEGACY_COMPOSITE', 'ASSESSMENT_BUNDLE'] }, courseId: { in: courseIds }, course: { isLibrary: false } },
      { productKind: 'QUESTIONNAIRE', questionnaireType: 'COURSE', questionnaireCourses: { some: { courseId: { in: courseIds }, course: { isLibrary: false } } } },
    ] },
    orderBy: { publishedAt: 'desc' },
    include: {
      course: { select: { id: true, title: true, courseCode: true, isLibrary: true } },
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          type: true,
          position: true,
          scale: { select: { name: true } },
          cognitiveAssignment: { select: { title: true } },
          formLabel: true,
        },
      },
      formSections: {
        orderBy: { position: 'asc' },
        include: { items: { select: { id: true, contextKey: true } } },
      },
    },
  })
  const attemptRows = await prisma.compositeAssessmentAttempt.findMany({ where: { userId, compositeAssessmentId: { in: list.map((item) => item.id) } }, orderBy: { startedAt: 'desc' }, select: { id: true, compositeAssessmentId: true, status: true, taskSatisfaction: true, progress: true, completedAt: true, cognitiveSessions: { select: { status: true, frozenAdmissionSnapshotHash: true } } } })
  const attempts = attemptRows.map(({ cognitiveSessions, ...attempt }) => ({ ...attempt,
    admissionPaused: !config.cognitiveModuleEnabled && cognitiveSessions?.some(session => session.status === 'IN_PROGRESS' && !session.frozenAdmissionSnapshotHash),
  }))
  const historicalIds = new Set(attempts.map(attempt => attempt.compositeAssessmentId))
  const supportedList = config.cognitiveModuleEnabled ? list : list.filter(item =>
    !item.items.some(child => child.type === 'COGNITIVE') || historicalIds.has(item.id))
  const latest = new Map<string, any>()
  for (const attempt of attempts) {
    // 查询已按 startedAt 倒序，最新的进行中记录必须优先于更早的已完成记录，保证可继续作答。
    if (!latest.has(attempt.compositeAssessmentId)) latest.set(attempt.compositeAssessmentId, attempt)
  }
  const attemptsByCompositeId = new Map<string, any[]>()
  for (const attempt of attempts) {
    const compositeAttempts = attemptsByCompositeId.get(attempt.compositeAssessmentId) || []
    compositeAttempts.push(attempt)
    attemptsByCompositeId.set(attempt.compositeAssessmentId, compositeAttempts)
  }
  const availabilityFor = (item: any): 'UPCOMING' | 'OPEN' | 'EXPIRED' => {
    if (item.opensAt && item.opensAt.getTime() > now) return 'UPCOMING'
    if (item.expiresAt && item.expiresAt.getTime() < now) return 'EXPIRED'
    return 'OPEN'
  }
  return supportedList.map((item: any) => {
    const compositeAttempts = attemptsByCompositeId.get(item.id) || []
    const attemptsUsed = compositeAttempts.length
    const availability = availabilityFor(item)
    const latestAttempt = latest.get(item.id) ?? null
    const admissionPaused = latestAttempt?.status === 'IN_PROGRESS' && latestAttempt.admissionPaused
    const canContinue = latestAttempt?.status === 'IN_PROGRESS' && !admissionPaused
    // `attempts` is ordered newest-first, so this is the most recent completed
    // attempt even when a newer attempt is currently in progress.
    const latestCompletedAttempt = compositeAttempts.find((attempt) => attempt.status === 'COMPLETED') ?? null
    // Historical satisfaction is independent of the newest submitted report.
    const latestSatisfiedAttempt = compositeAttempts.find(isTaskSatisfied) ?? null
    const sections = item.formSections ?? []
    const units = [
      ...item.items
        .filter((child: any) => child.type !== 'FORM')
        .map((child: any) => ({
          type: child.type === 'SCALE' ? 'scale' as const : child.type === 'COGNITIVE' ? 'cognitive' as const : 'situational' as const,
          id: child.id,
          position: child.position,
          label: resolveCompositeItemLabel(child, getFrozenPackageSlotLabels(item)),
          itemCount: 1,
          contextSection: false,
        })),
      ...sections.map((section: any) => ({
        type: 'form-section' as const,
        id: section.id,
        position: section.position,
        label: section.title,
        itemCount: section.items.length,
        contextSection: compositeSectionHasContext(section),
      })),
    ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    return {
      id: item.id,
      productKind: item.productKind,
      code: item.code,
      name: item.name,
      description: item.description,
      instruction: item.instruction,
      deliveryMode: 'FINAL_ONLY' as const,
      estimatedModules: hasTrainingFlowDefinitionMarkers(item) ? null : units.length,
      course: item.course,
      opensAt: item.opensAt,
      expiresAt: item.expiresAt,
      maxAttempts: item.maxAttempts,
      attemptsUsed,
      availability,
      canStartNewAttempt: item.status === 'PUBLISHED' && (config.cognitiveModuleEnabled || !item.items.some((child: any) => child.type === 'COGNITIVE')) && availability === 'OPEN' && !canContinue && attemptsUsed < item.maxAttempts,
      canContinue,
      admissionPaused: Boolean(admissionPaused),
      weightedVariants: item.trainingVariantFrozen != null,
      items: (item.trainingVariantFrozen != null || hasTrainingFlowDefinitionMarkers(item)) ? [] : item.items.map((child: any) => ({ type: child.type, position: child.position, label: resolveCompositeItemLabel(child, getFrozenPackageSlotLabels(item)) })),
      units: (item.trainingVariantFrozen != null || hasTrainingFlowDefinitionMarkers(item)) ? [] : units,
      formSections: (item.trainingVariantFrozen != null || hasTrainingFlowDefinitionMarkers(item)) ? [] : sections,
      attempt: latestAttempt,
      latestCompletedAttempt: latestCompletedAttempt ? { ...latestCompletedAttempt, taskSatisfied: isTaskSatisfied(latestCompletedAttempt) } : null,
      latestSatisfiedAttempt,
      hasSatisfiedAttempt: Boolean(latestSatisfiedAttempt),
    }
  })
}

const assertStudentEligibility = async (composite: any, userId: string) => {
  assertNotOrganizationResourceGenericEntry(composite)
  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('综合测评尚未发布')
  if (composite.productKind === 'QUESTIONNAIRE') {
    if (composite.questionnaireType !== 'COURSE') throw compositeForbidden('此问卷请通过公开链接访问')
    const eligible = await prisma.courseStudent.findFirst({
      where: { studentId: userId, status: { in: ['ACTIVE', 'APPROVED'] }, course: { isLibrary: false },
        courseId: { in: (composite.questionnaireCourses ?? []).map((row: any) => row.courseId) } },
      orderBy: { courseId: 'asc' },
    })
    if (!eligible) throw compositeForbidden('不是问卷投放课程的有效学生')
    if (composite.opensAt && composite.opensAt.getTime() > Date.now()) throw compositeBadRequest('问卷尚未开始')
    if (composite.expiresAt && composite.expiresAt.getTime() < Date.now()) throw compositeBadRequest('问卷已过期')
    composite.deliveryCourseId = eligible.courseId
    return
  }
  if (!composite.courseId) throw compositeForbidden('该综合测评仅允许通过公开链接访问')
  if (composite.course?.isLibrary) throw compositeBadRequest('库课程上的综合测评不能作答')
  const membership = await prisma.courseStudent.findUnique({ where: { courseId_studentId: { courseId: composite.courseId, studentId: userId } } })
  if (!membership || !['ACTIVE', 'APPROVED'].includes(membership.status)) throw compositeForbidden('不是该课程的有效学生')
  if (composite.opensAt && composite.opensAt.getTime() > Date.now()) throw compositeBadRequest('综合测评尚未开始')
  if (composite.expiresAt && composite.expiresAt.getTime() < Date.now()) throw compositeBadRequest('综合测评已过期')
}

type PreparedCognitiveVariantRuntime = Awaited<ReturnType<typeof cognitiveSessionService.prepareUnifiedCognitiveSessionConfigSnapshot>>
type PreparedVariantRuntimes = { references?:Map<string,string>; scales: Map<string, Awaited<ReturnType<typeof freezeScaleRuntimeAtAttemptStart>>>; cognitive: Map<string, PreparedCognitiveVariantRuntime>; assignments: Map<string, Awaited<ReturnType<typeof prepareTeacherPublishedAssignment>>> }

const resolvedCompositeCognitiveConfig = (assignment: any) => {
  const config = assignment?.config
  if (!assignment || !config) throw compositeBadRequest('认知任务配置不存在')
  const parsed = validateCognitiveConfig(config)
  if (!assignment.resolvedConfigSnapshotEncrypted) return parsed
  try {
    return requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion).configSchema.parse(
      decryptCognitivePayload<unknown>(assignment.resolvedConfigSnapshotEncrypted))
  } catch { throw compositeBadRequest('认知任务冻结的 Profile 配置不可用') }
}

const createCognitiveChild = async (db: Db, attempt: any, item: any, userId: string | null, prepared?: PreparedCognitiveVariantRuntime, preparedAssignment?: Awaited<ReturnType<typeof prepareTeacherPublishedAssignment>>, runtimeReference?:string,educationAttempt?:VerifiedEducationAttempt) => {
  assertCognitiveModuleEnabled()
  let assignment = item.cognitiveAssignment
  if (attempt.deliveryCourseId && assignment) {
    const copied = preparedAssignment ? await persistPreparedTeacherPublishedAssignment(db, preparedAssignment) : await ensureTeacherPublishedAssignment(db, {
      userId: assignment.createdBy,
      courseId: attempt.deliveryCourseId,
      configId: assignment.configId,
      title: assignment.title,
      instruction: assignment.instruction ?? null,
      quotaSourceAssignmentId: assignment.quotaSourceAssignmentId ?? assignment.id,
      maxAttempts: assignment.maxAttempts,
      sourceFreeze: {
        profile: assignment.profile,
        profileDefinitionVersion: assignment.profileDefinitionVersion,
        resolvedConfigSnapshotEncrypted: assignment.resolvedConfigSnapshotEncrypted,
        resolvedConfigHash: assignment.resolvedConfigHash,
        resolvedReportSnapshotEncrypted: assignment.resolvedReportSnapshotEncrypted,
      },
    })
    assignment = { ...copied, config: assignment.config }
  }
  const config = assignment?.config
  if (!assignment || !config) throw compositeBadRequest('认知任务配置不存在')
  const anonymous = !userId
  const sessionConfig = prepared ? prepared.snapshot.config : resolvedCompositeCognitiveConfig(assignment)
  const pin=readTrainingCognitiveTaskBinding(assignment.courseSnapshot)
  const fixed=!prepared?(pin?await loadPinnedTrainingCognitiveProfile(db as Prisma.TransactionClient,pin,{userId:assignment.createdBy,configId:config.id},false):await readEducationCognitiveAssignmentArtifact(assignment)):null
  if(fixed)assertCognitiveAssignmentFreeze(assignment,fixed.artifact)
  const unifiedSnapshot = runtimeReference && prepared ? {encrypted:runtimeReference,compiledRuntime:prepared.compiledRuntime} : prepared
    ? await cognitiveSessionService.persistPreparedUnifiedCognitiveSessionConfigSnapshot(prepared, db)
    : attempt.runtimeGeneration === 'UNIFIED_V1'
      ? await cognitiveSessionService.createUnifiedCognitiveSessionConfigSnapshot({db, testType:config.testType,
          configVersion:config.configVersion,engineVersion:config.engineVersion,scoringVersion:config.scoringVersion,config:sessionConfig,...(fixed?{frozenProfile:fixed.artifact}:{})})
      : null
  const configSnapshotEncrypted = unifiedSnapshot?.encrypted ?? cognitiveSessionService.createCognitiveSessionConfigSnapshot({
    testType: config.testType,
    configVersion: config.configVersion,
    engineVersion: config.engineVersion,
    scoringVersion: config.scoringVersion,
    config: sessionConfig,
  })
  if(userId){
    const native=attempt.trainingContentBinding?.units?.some((unit:any)=>unit.itemId===item.id&&unit.source.educationNative?.provider==='COGNITIVE_CONFIG')
    if(native||readVerifiedLongitudinalEducationAttempt(educationAttempt,db,attempt,userId))await admitEducationNativeCognitive(db as Prisma.TransactionClient,{proof:educationAttempt,parent:attempt,actorUserId:userId,itemId:item.id,assignmentId:assignment.id,configId:config.id})
    else await admitCognitiveAttempt(db,userId,assignment.id,{compositeAttemptId:attempt.id,compositeItemId:item.id})
  }
  return db.cognitiveSession.create({
    data: {
      userId,
      participantKey: userId ? `${getParticipantKey(userId)}:${attempt.id}:${item.id}` : `anonymous:${attempt.id}:${item.id}`,
      participantSnapshotEncrypted: encryptCognitivePayload({ anonymousCode: attempt.anonymousCode ?? null }),
      assignmentId: assignment.id,
      compositeAttemptId: attempt.id,
      compositeItemId: item.id,
      configId: config.id,
      testType: config.testType,
      attemptNo: attempt.attemptEpoch ?? 1,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      configVersion: config.configVersion,
      configSnapshotEncrypted,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      randomSeed: randomBytes(16).toString('hex'),
      anonymousCode: anonymous ? attempt.anonymousCode : null,
      ...(unifiedSnapshot ? {
        runtimeGeneration: 'UNIFIED_V1' as const,
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
      } : {}),
    },
  })
}

const createChildRecords = async (db: Db, attempt: any, composite: {productKind:string}, items: any[], userId: string | null, formSections: any[], situationalReleases: Map<string, ResolvedSituationalRelease>, prepared?: PreparedVariantRuntimes, verifiedFlowMaterialization?:VerifiedTrainingFlowMaterialization,educationProduct?:'SCHOOL'|'TEACHER',educationAttempt?:VerifiedEducationAttempt) => {
  // Prisma create/findUnique parent rows contain scalar fields only. Product
  // policy comes from the caller's already-loaded server-owned composite.
  // A composition may reference several sources in different orders. Always
  // acquire their locks in the same order to avoid cross-composition deadlocks.
  if (userId && !prepared) {
    const longitudinal=readVerifiedLongitudinalEducationAttempt(educationAttempt,db,attempt,userId)
    const nativeIds=new Set(attempt.trainingContentBinding?.units?.filter((unit:any)=>unit.source.educationNative?.provider==='COGNITIVE_CONFIG'||longitudinal&&unit.family==='COGNITIVE').map((unit:any)=>unit.itemId)??[])
    const sources = await Promise.all(items.filter(item => item.type === 'COGNITIVE'&&!nativeIds.has(item.id)).map(item => cognitiveQuotaSource(db, item.cognitiveAssignmentId)))
    for (const id of [...new Set(sources.map(source => source.id))].sort()) await lockCognitiveQuota(db, userId, id)
  }
  const runtime = {
    scales: [] as Array<{ compositeItemId: string; code: string; instrumentVersion: string; sourceDefinitionHash: string; compiledRuntimeHash: string }>,
    cognitive: [] as Array<{ compositeItemId: string; testType: string; instrumentVersion: string; sourceDefinitionHash: string; compiledRuntimeHash: string }>,
    situational: [] as Array<{
      compositeItemId: string
      instrumentKey: string
      instrumentVersion: string
      definitionHash: string
      compiledRuntimeHash: string
      scorerKey: string
      scoringVersion: string
      runtimeGeneration: 'UNIFIED_V1'
      deliveryMode: 'FINAL_ONLY'
      frozenAt: string
    }>,
  }
  for (const item of items) {
    if (!item.required) continue
    if (item.type === 'SCALE') {
      const frozenScale = attempt.runtimeGeneration === 'UNIFIED_V1'
        ? prepared?.scales.get(item.id) ?? await freezeScaleRuntimeAtAttemptStart(db, {
            instrumentKey: item.scale.code,
            instrumentVersion: item.scale.instrumentVersion,
            definition: frozenDatabaseScaleDefinition(item.scale),
            requestedMode: 'COMPOSITE',
            instruction: resolveFrozenScaleInstructionForScale(item.scale),
          })
        : null
      if (frozenScale?.schemaVersion === 2) assertScaleContextCollectable({ policy: frozenScale.compiledPolicy.applicability, scalePosition: item.position, sections: formSections })
      // Match the existing parent START boundary for education organization resources.
      if(composite.productKind==='ORGANIZATION_RESOURCE')await assertScaleLibraryCollectionAllowed(db as Prisma.TransactionClient,[],[item.scaleId!])
      else await assertTrainingScaleCollectionAllowed(db as Prisma.TransactionClient, [item.scaleId!],{compositeAttemptId:attempt.id,compositeItemIds:[item.id],
        ...(verifiedFlowMaterialization?{verifiedFlowMaterialization,compositeAttemptEpoch:attempt.attemptEpoch}:{})})
      const child = await db.assessment.create({
        data: {
          scaleId: item.scaleId,
          userId,
          status: 'IN_PROGRESS',
          deliveryMode: 'FINAL_ONLY',
          attemptEpoch: attempt.attemptEpoch ?? 1,
          progress: 0,
          answers: encryptScaleAnswers([]),
          compositeAttemptId: attempt.id,
          compositeItemId: item.id,
          subjectUserId: attempt.subjectUserId ?? userId,
          respondentUserId: attempt.respondentUserId ?? userId,
          respondentType: attempt.respondentType ?? 'SELF',
          ...(frozenScale ? {
            runtimeGeneration: 'UNIFIED_V1' as const,
            runtimeSnapshotEncrypted: prepared?.references?.get(item.id) ?? (await persistFrozenScaleRuntimeSnapshot(frozenScale, db)),
            compiledRuntimeHash: frozenScale.compiledRuntime.compiledRuntimeHash,
          } : {}),
        },
      })
      if (frozenScale) {
        await retainFrozenScaleAssessmentImages({ assessmentId: child.id, snapshot: frozenScale, db })
        runtime.scales.push({
          compositeItemId: item.id,
          code: item.scale.code,
          instrumentVersion: item.scale.instrumentVersion,
          sourceDefinitionHash: frozenScale.sourceDefinitionHash,
          compiledRuntimeHash: frozenScale.compiledRuntime.compiledRuntimeHash,
        })
      }
    } else if (item.type === 'COGNITIVE') {
      const session = await createCognitiveChild(db, attempt, item, userId, prepared?.cognitive.get(item.id), prepared?.assignments.get(item.id), prepared?.references?.get(item.id),educationAttempt)
      if (attempt.runtimeGeneration === 'UNIFIED_V1') {
        const snapshot = prepared?.cognitive.get(item.id)?.snapshot ?? (await cognitiveSessionService.loadCognitiveSessionConfig(session.configSnapshotEncrypted,db as any)).snapshot
        if (!snapshot?.compiledRuntime) throw new Error('Unified Cognitive session runtime snapshot is missing')
        runtime.cognitive.push({
          compositeItemId: item.id,
          testType: item.cognitiveAssignment.config.testType,
          instrumentVersion: snapshot.compiledRuntime.instrumentVersion,
          sourceDefinitionHash: snapshot.compiledRuntime.sourceDefinitionHash,
          compiledRuntimeHash: snapshot.compiledRuntime.compiledRuntimeHash,
        })
      }
    } else if (item.type === 'SITUATIONAL') {
      if (attempt.runtimeGeneration !== 'UNIFIED_V1') throw compositeBadRequest('情境化模块必须使用 Unified FINAL_ONLY 运行时')
      const situation = assertSituationalCompositeItem(situationalReleases.get(situationalReleaseKey(situationalItemIdentity(item)))!,educationProduct)
      const embedded = await createEmbeddedSituationalAttempt(db, {
        userId,
        // Composite parent rows retain their historical participant key
        // format. Embedded Situational children use the shared pseudonym
        // contract so owner admission is identical to standalone runtime.
        participantKey: userId ? getParticipantKey(userId) : attempt.participantKey,
        compositeAttemptId: attempt.id,
        compositeItemId: item.id,
        compositeSlotKey: compositeItemSlotKey(item.id, 'SITUATIONAL'),
        instrumentKey: situation.situationPackage.key,
        instrumentVersion: situation.situationPackage.instrumentVersion,
        attemptEpoch: attempt.attemptEpoch ?? 1,
      }, situation,educationAttempt)
      runtime.situational.push({
        compositeItemId: item.id,
        instrumentKey: embedded.snapshot.instrumentKey,
        instrumentVersion: embedded.snapshot.instrumentVersion,
        definitionHash: embedded.snapshot.definitionHash,
        compiledRuntimeHash: embedded.snapshot.compiledRuntimeHash,
        scorerKey: embedded.snapshot.scorerKey,
        scoringVersion: embedded.snapshot.scoringVersion,
        runtimeGeneration: embedded.snapshot.runtimeGeneration,
        deliveryMode: 'FINAL_ONLY',
        frozenAt: embedded.snapshot.frozenAt,
      })
    }
  }
  return runtime
}

/** Freeze candidates without creating children, sessions, jobs or quota claims.
 * Existing shared-runtime stores remain the only full Scale/Cognitive bodies. */
const freezeTrainingFlowCandidates = async (db:Db, attempt:any, composite:any, prepared:PreparedVariantRuntimes, releases:Map<string,ResolvedSituationalRelease>) => {
  const references:Record<string,string>={}, assignments:Record<string,unknown>={}, situational:Record<string,unknown>={}
  const runtime={scales:[] as any[],cognitive:[] as any[],situational:[] as any[]}
  for(const item of composite.items){
    if(item.type==='SCALE'){
      const snapshot=prepared.scales.get(item.id)!
      references[item.id]=await persistFrozenScaleRuntimeSnapshot(snapshot,db)
      await retainFrozenScaleAssessmentImages({assessmentId:`flow:${attempt.id}:${item.id}`,snapshot,db})
      runtime.scales.push({compositeItemId:item.id,code:snapshot.instrumentKey,instrumentVersion:snapshot.instrumentVersion,sourceDefinitionHash:snapshot.sourceDefinitionHash,compiledRuntimeHash:snapshot.compiledRuntime.compiledRuntimeHash})
    }else if(item.type==='COGNITIVE'){
      const frozen=prepared.cognitive.get(item.id)!
      references[item.id]=(await cognitiveSessionService.persistPreparedUnifiedCognitiveSessionConfigSnapshot(frozen,db)).encrypted
      if(prepared.assignments.has(item.id))assignments[item.id]=freezeTrainingFlowAssignment(prepared.assignments.get(item.id)!)
      runtime.cognitive.push({compositeItemId:item.id,testType:item.cognitiveAssignment.config.testType,instrumentVersion:frozen.compiledRuntime.instrumentVersion,sourceDefinitionHash:frozen.compiledRuntime.sourceDefinitionHash,compiledRuntimeHash:frozen.compiledRuntime.compiledRuntimeHash})
    }else if(item.type==='SITUATIONAL'){
      const snapshot=releases.get(situationalReleaseKey(situationalItemIdentity(item)))!.snapshot
      situational[item.id]=snapshot
      runtime.situational.push({compositeItemId:item.id,instrumentKey:snapshot.instrumentKey,instrumentVersion:snapshot.instrumentVersion,definitionHash:snapshot.definitionHash,compiledRuntimeHash:snapshot.compiledRuntimeHash,scorerKey:snapshot.scorerKey,scoringVersion:snapshot.scoringVersion,runtimeGeneration:snapshot.runtimeGeneration,deliveryMode:'FINAL_ONLY',frozenAt:snapshot.frozenAt})
    }
  }
  const snapshot={schemaVersion:1,compositeId:composite.id,publishedAt:new Date(composite.publishedAt).toISOString(),attemptId:attempt.id,attemptEpoch:attempt.attemptEpoch,flowDigest:composite.trainingFlowDigest,references,assignments,situational}
  return {runtime,snapshot}
}

/** Called only after ownership is checked. Parent lock serializes FINAL, END,
 * two tabs and child creation. No current-template recompilation supplies a
 * candidate body, and a denied admission never reroutes to another branch. */
const ensureTrainingFlowCurrentChildInTransaction = async (tx:Prisma.TransactionClient,attemptId:string, context:{userId?:string;recoveryTokenHash?:string}) => {
  await tx.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id=${attemptId} FOR UPDATE`
  const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:attemptId}})
  if(!parent)throw compositeNotFound('作答不存在')
  if(context.userId?parent.userId!==context.userId:!(context.recoveryTokenHash&&parent.userId===null&&parent.recoveryTokenHash===context.recoveryTokenHash))throw compositeForbidden('无权限查看此作答')
  const composite=await loadComposite(parent.compositeAssessmentId,true,tx)
  const verified=await resolveTrainingFlowScopeForMaterialization({...parent,compositeAssessment:composite},composite,{db:tx})
  const flow=verified?.scope
  if(!flow||parent.status!=='IN_PROGRESS'||!flow.path.currentInstrumentKey)return
  const key=flow.path.currentInstrumentKey
  const section=composite.formSections.find((s:any)=>trainingFlowUnitKey(s.id)===key)
  if(section){
    await tx.compositeFormSectionAttempt.upsert({where:{attemptId_sectionId:{attemptId,sectionId:section.id}},create:{attemptId,sectionId:section.id,attemptEpoch:parent.attemptEpoch},update:{}})
    return
  }
  const item=composite.items.find((i:any)=>i.type!=='FORM'&&trainingFlowItemKey(i.id)===key)
  if(!item)throw compositeForbidden('当前流程工具不存在')
  const existing=item.type==='SCALE'?await tx.assessment.findFirst({where:{compositeAttemptId:attemptId,compositeItemId:item.id}}):item.type==='COGNITIVE'?await tx.cognitiveSession.findFirst({where:{compositeAttemptId:attemptId,compositeItemId:item.id}}):await tx.situationalAttempt.findFirst({where:{compositeAttemptId:attemptId,compositeItemId:item.id}})
  if(existing)return
  const candidate=verified!.candidate
  const prepared:PreparedVariantRuntimes={scales:new Map(),cognitive:new Map(),assignments:new Map(),references:new Map()}
  const releases=new Map<string,ResolvedSituationalRelease>()
  if(item.type==='SCALE'){
    const snapshot=await loadFrozenScaleRuntimeSnapshot(candidate.references[item.id],tx)
    prepared.scales.set(item.id,snapshot);prepared.references!.set(item.id,candidate.references[item.id])
  }else if(item.type==='COGNITIVE'){
    assertCognitiveModuleEnabled()
    const loaded=await cognitiveSessionService.loadCognitiveSessionConfig(candidate.references[item.id],tx as any)
    if(!loaded.snapshot?.compiledRuntime)throw compositeForbidden('冻结认知运行时缺失')
    prepared.cognitive.set(item.id,{snapshot:loaded.snapshot,compiledRuntime:loaded.snapshot.compiledRuntime})
    prepared.references!.set(item.id,candidate.references[item.id])
    if(candidate.assignments[item.id])prepared.assignments.set(item.id,candidate.assignments[item.id])
    if(parent.userId){const source=await cognitiveQuotaSource(tx,item.cognitiveAssignmentId);await lockCognitiveQuota(tx,parent.userId,source.id)}
  }else{
    const current=await resolveCompositeSituationalItems([item],tx,true,compositeSjtGrantScope({...composite,deliveryCourseId:parent.deliveryCourseId}))
    const release=current.get(situationalReleaseKey(situationalItemIdentity(item)))!
    const snapshot=candidate.situational[item.id]
    if(!snapshot||snapshot.definitionHash!==release.snapshot.definitionHash||snapshot.compiledRuntimeHash!==release.snapshot.compiledRuntimeHash)throw compositeForbidden('情境工具冻结身份不匹配')
    releases.set(situationalReleaseKey(situationalItemIdentity(item)),{...release,snapshot})
  }
  const runtime=await createChildRecords(tx,parent,composite,[item],parent.userId,composite.formSections,releases,prepared,item.type==='SCALE'?verified!:undefined)
  const created=freezeCompositeActiveSlotSet({...runtime,attemptEpoch:parent.attemptEpoch,formSections:[]})
  const expected=flow.frozenSlots.slots.find(s=>s.sourceBinding.compositeItemId===item.id)
  if(created.slots.length!==1||canonicalHash(created.slots[0])!==canonicalHash(expected))throw compositeForbidden('实际准入与冻结候选不一致')
}
const ensureTrainingFlowCurrentChild = async (attemptId:string, context:{userId?:string;recoveryTokenHash?:string}) => prisma.$transaction(tx=>ensureTrainingFlowCurrentChildInTransaction(tx,attemptId,context))

export interface RelationalCompositeAttemptIdentityV1 {
  subjectUserId: string
  respondentUserId: string
  respondentType: 'SELF' | 'PARENT' | 'TEACHER' | 'OBSERVER' | null
  episodeId: string
  assignmentRef: string
  consentId: string | null
}

const createAttempt = async (
  db: Db,
  composite: any,
  userId: string | null,
  accessTokenId: string | null,
  credential?: ReturnType<typeof createRecoveryCredential>,
  attemptNo = 1,
  attemptEpoch = 1,
  relationalIdentity?: RelationalCompositeAttemptIdentityV1,
  restartMaterialClaimId?: string,
  educationStart?: VerifiedEducationStart,
  fieldStart?: VerifiedFieldStart,
) => {
  assertSupportedComposite(composite)
  const field=fieldStart?readVerifiedFieldStart(fieldStart,{tx:db,compositeId:composite.id,respondentUserId:userId??''}):undefined
  if(field&&(relationalIdentity||educationStart||accessTokenId||credential||composite.productKind!=='ORGANIZATION_RESOURCE'))throw compositeForbidden('现场观察准入上下文不匹配')
  const educationProduct=field?'TEACHER':educationStart?readVerifiedEducationStart(educationStart,{tx:db,compositeId:composite.id,assignmentRef:relationalIdentity?.assignmentRef??'',subjectUserId:relationalIdentity?.subjectUserId??'',respondentUserId:userId??''}):undefined
  const educationComposition=field?fieldCompositionBinding(field.assessmentRef):readVerifiedCompositionStart(educationStart,{tx:db,compositeId:composite.id,
    assignmentRef:relationalIdentity?.assignmentRef??'',subjectUserId:relationalIdentity?.subjectUserId??'',respondentUserId:userId??''})
  if(educationProduct&&!field&&(composite.productKind!=='ORGANIZATION_RESOURCE'||!relationalIdentity
    ||(!educationComposition&&relationalIdentity.subjectUserId!==userId)||relationalIdentity.respondentUserId!==userId))throw compositeForbidden('教育测评准入上下文不匹配')
  // Parent START and publication stop/archive serialize on the same row. Child
  // progression later consumes the already-admitted immutable runtime plan.
  await db.$queryRawUnsafe('SELECT "id" FROM "composite_assessments" WHERE "id" = $1 FOR SHARE', composite.id)
  if (!['QUESTIONNAIRE','ASSESSMENT_BUNDLE'].includes(composite.productKind)) {
    const current=await db.compositeAssessment.findUnique({where:{id:composite.id},
      select:{status:true,trainingContentSnapshot:true,trainingContentSnapshotHash:true}})
    if(!current||current.status!=='PUBLISHED')throw compositeForbidden('测评已停止接收新作答')
    composite={...composite,trainingContentSnapshot:current.trainingContentSnapshot,trainingContentSnapshotHash:current.trainingContentSnapshotHash}
  }
  let feedbackBinding: TrainingFeedbackBinding | null = null
  let persistenceBinding: { publicationIdentity: Record<string, unknown>; courseId: string; roundId: string | null; cutoffs: Array<Date | null> } | null = null
  if(composite.items.some((item:any)=>item.formPolicy!=null) && (composite.productKind!=='QUESTIONNAIRE' || composite.deliveryMode==='LEGACY' || relationalIdentity || composite.reportPackageKey || composite.analysisProtocolKey)) {
    if(composite.productKind!=='ORGANIZATION_RESOURCE'||!(educationComposition||composite.creationKey?.startsWith('private-form:'))||(!relationalIdentity&&!field)||!userId
      ||composite.deliveryMode==='LEGACY'||composite.reportPackageKey||composite.analysisProtocolKey)
      throw compositeBadRequest('Form V3 只支持普通问卷的统一 FINAL 运行时')
    if(!educationComposition){
      if(!relationalIdentity)throw compositeForbidden('表单缺少已验证的任务身份')
      const {readPrivateFormExecutionSource}=await import('../assessment-run/educationPrivateFormExecution')
      await readPrivateFormExecutionSource(db as Prisma.TransactionClient,{assignmentRef:relationalIdentity.assignmentRef,compositeId:composite.id,actorUserId:userId})
    }
  }
  if (['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE'].includes(composite.productKind)) {
    // A shared publication lock still fences archive, while independent
    // authenticated admissions keep their own participant lock. Other entry
    // paths retain their outer exclusive publication/token locks.
    const current = await db.compositeAssessment.findUnique({ where: { id: composite.id },
      select: { status: true, publicEnabled: true, opensAt: true, expiresAt: true,
        personalTracking:true,personalTrackingBaselineId:true,personalTrackingOrdinal:true,
        trainingPersistencePolicy: true, trainingPersistencePolicyHash: true,
        trainingContentSnapshot:true,trainingContentSnapshotHash:true,
        trainingFeedbackPolicy: true, trainingFeedbackPolicyHash: true } })
    if (!current || current.status !== 'PUBLISHED' || (!userId && !current.publicEnabled)) throw compositeForbidden('问卷已停止接收新作答')
    if (current.opensAt && current.opensAt.getTime() > Date.now()) throw compositeBadRequest('问卷尚未开始')
    if (current.expiresAt && current.expiresAt.getTime() <= Date.now()) throw compositeBadRequest('问卷已过期')
    // Read the publication-owned policy under the same admission lock as status.
    composite = { ...composite, trainingContentSnapshot:current.trainingContentSnapshot,trainingContentSnapshotHash:current.trainingContentSnapshotHash,
      personalTracking:current.personalTracking,personalTrackingBaselineId:current.personalTrackingBaselineId,personalTrackingOrdinal:current.personalTrackingOrdinal,
      trainingPersistencePolicy: current.trainingPersistencePolicy,
      trainingPersistencePolicyHash: current.trainingPersistencePolicyHash,
      trainingFeedbackPolicy: current.trainingFeedbackPolicy, trainingFeedbackPolicyHash: current.trainingFeedbackPolicyHash }
    const persistence = readTrainingPersistencePolicy(current.trainingPersistencePolicy)
    const feedbackConfigured = current.trainingFeedbackPolicy != null || current.trainingFeedbackPolicyHash != null
    if (persistence?.checkpoint || persistence?.localCognitive || feedbackConfigured) {
      // The same publication lock protects this configured-policy projection.
      // Legacy/off admissions never load course relations or definition blobs.
      const configuredPolicySelect = {
        id: true, status: true, productKind: true, questionnaireType: true,
        reportPackageKey: true, analysisProtocolKey: true, publishedAt: true, createdBy: true,
        trainingFlowDigest: true, trainingVariantDigest: true, expiresAt: true,
        trainingFeedbackPolicy: true, trainingFeedbackPolicyHash: true,
        questionnaireCourses: { select: { courseId: true } },
      } satisfies Prisma.CompositeAssessmentSelect
      const publicationReader: Pick<Prisma.TransactionClient, 'compositeAssessment'> = db
      const current = await publicationReader.compositeAssessment.findUnique({ where: { id: composite.id }, select: configuredPolicySelect })
      if (!current) throw compositeForbidden('问卷已停止接收新作答')
      // deliveryMode belongs to the attempt/runtime context, not the publication.
      // An absent override keeps the existing default FINAL_ONLY admission.
      if (current.productKind !== 'QUESTIONNAIRE' || current.questionnaireType !== 'COURSE' || composite.deliveryMode === 'LEGACY' || relationalIdentity || current.reportPackageKey || current.analysisProtocolKey || !current.publishedAt)
        throw compositeBadRequest('此投放不支持 Training 冻结策略')
      const courseIds = current.questionnaireCourses.map((entry: { courseId: string }) => entry.courseId)
      const courseId = userId ? composite.deliveryCourseId : (courseIds.length === 1 ? courseIds[0] : null)
      if (!courseId || !courseIds.includes(courseId) || (!userId && composite.deliveryCourseId && composite.deliveryCourseId !== courseId))
        throw compositeBadRequest('冻结策略缺少明确授权的 Training 投放课程')
      const facts = await (db as Prisma.TransactionClient).$queryRaw<Array<{ id: string; endedAt: Date | null }>>`SELECT c.id,c.ended_at AS "endedAt"
        FROM courses c JOIN users u ON u.id=${current.createdBy}
        WHERE c.id=${courseId} AND c.course_type='TRAINING_COURSE' AND NOT c.is_library AND c.status::text='PUBLISHED'
        AND ${trainingCreatorAuthoritySql} FOR SHARE OF c,u`
      if (facts.length !== 1 || (facts[0].endedAt && new Date(facts[0].endedAt).getTime() <= Date.now()))
        throw compositeForbidden('Training 课程已关闭或投放权限无效')
      const publicationIdentity = trainingRoundPublicationIdentity(current, courseId)
      let roundId: string | null = null
      let roundCutoff: Date | null = null
      let feedbackRound: any = null
      if (accessTokenId) {
        const token = await db.compositeAssessmentAccessToken.findUnique({ where: { id: accessTokenId }, include: { trainingRound: true } })
        if (!token || token.compositeAssessmentId !== current.id) throw compositeForbidden('冻结策略公开链接绑定无效')
        if (token.trainingRoundId) {
          const round = token.trainingRound
          if (!round || round.compositeId !== current.id || round.courseId !== courseId || round.publicationHash !== canonicalHash(publicationIdentity) || canonicalHash(round.publicationIdentity) !== round.publicationHash)
            throw compositeForbidden('冻结策略轮次发布绑定无效')
          await assertTrainingTokenRound(db as Prisma.TransactionClient, token)
          roundId = round.id
          roundCutoff = round.closesAt
          feedbackRound = round
        }
      }
      composite = { ...composite, deliveryCourseId: courseId }
      if (persistence?.checkpoint || persistence?.localCognitive) persistenceBinding = { publicationIdentity, courseId, roundId, cutoffs: [facts[0].endedAt, current.expiresAt, roundCutoff] }
      if (feedbackConfigured) feedbackBinding = prepareTrainingFeedbackBinding({ composite: current, courseId, accessTokenId, round: feedbackRound })
    }

    if (userId && !await db.courseStudent.findFirst({ where: {
      studentId: userId, courseId: composite.productKind === 'QUESTIONNAIRE' ? composite.deliveryCourseId : composite.courseId, status: { in: ['ACTIVE', 'APPROVED'] }, course: { isLibrary: false,...(composite.trainingTimingPolicy?{courseType:'TRAINING_COURSE'}:{}) },
    } })) throw compositeForbidden('不是问卷投放课程的有效学生')
  }
  if(composite.personalTracking&&!composite.personalTrackingInheritedUnits)composite=await inheritTrainingTrackingSources(db as Prisma.TransactionClient,composite)
  const nativeBundleInstance = composite.productKind === 'ASSESSMENT_BUNDLE'
    ? await db.bundleInstance.findUniqueOrThrow({where:{compositeId:composite.id}})
    : composite.productKind === 'ORGANIZATION_RESOURCE' && composite.creationKey?.startsWith('education-assessment:')
    ? await db.bundleInstance.findUnique({where:{compositeId:composite.id}}) : null
  if(nativeBundleInstance){
    const {readInstance}=await import('../bundle-product/service')
    const frozen=readInstance(nativeBundleInstance).frozen
    if(frozen.declarativePackage)await (await import('../bundle-product/package-release')).assertPackageAdmission(db,frozen.declarativePackage)
  }
  const finalOnly = composite.deliveryMode !== 'LEGACY'
  let formSections = finalOnly ? (composite.formSections ?? []) : []
  const packageFields = finalOnly
    ? [composite.reportPackageKey, composite.reportPackageVersion, composite.reportPackageProfile, composite.reportPackageSnapshotEncrypted]
    : []
  if (packageFields.some((value: unknown) => value !== null && value !== undefined) && packageFields.some((value: unknown) => value === null || value === undefined)) {
    throw compositeBadRequest('综合测评报告包冻结信息不完整')
  }
  const packageSnapshot = finalOnly && composite.reportPackageSnapshotEncrypted
    ? readFrozenReportPackageSnapshot(composite.reportPackageSnapshotEncrypted)
    : null
  if (packageSnapshot && (
    packageSnapshot.packageKey !== composite.reportPackageKey
    || packageSnapshot.packageVersion !== composite.reportPackageVersion
    || packageSnapshot.profile !== composite.reportPackageProfile
  )) throw compositeBadRequest('综合测评报告包实例与冻结快照不匹配')
  const bundleRuntimeHash = nativeBundleInstance
    ? await (await import('../bundle-product/runtime')).compiledHashForInstance(db, composite.id)
    : null
  const flowEnabled = composite.trainingFlowFrozen!=null||composite.trainingFlowDraft!=null||composite.trainingFlowDigest!=null
  if(flowEnabled){
    if(relationalIdentity||!finalOnly)throw compositeBadRequest('条件流程不支持关系或旧投放')
    await assertTrainingFlowAuthoringScope(db as any,composite)
    const compiled=compileTrainingFlow(composite.trainingFlowDraft,buildTrainingFlowUnits(composite))
    if(compiled.flowDigest!==composite.trainingFlowDigest||canonicalHash(compiled)!==canonicalHash(composite.trainingFlowFrozen))throw compositeBadRequest('流程冻结配置不一致')
    if(!userId)composite={...composite,deliveryCourseId:composite.questionnaireCourses[0].courseId}
  }
  const variantEnabled = composite.trainingVariantFrozen != null || composite.trainingVariantDraft != null || composite.trainingVariantDigest != null
  const hasStandardCombinations=composite.items.some((item:any)=>item.standardCombinationSource!=null)
  const hasPreciseCognitiveProfiles=composite.items.some((item:any)=>item.type==='COGNITIVE'&&(readTrainingCognitiveTaskBinding(item.cognitiveAssignment?.courseSnapshot)!==null||readEducationCognitiveProfilePin(item.cognitiveAssignment?.courseSnapshot)!==null))
  const educationStandardUnits=educationComposition?(composite.trainingContentSnapshot as import('./training-content-binding').TrainingContentSnapshot).units.filter(unit=>unit.source.educationStandard):[]
  const educationLibraryUnits=educationComposition?(composite.trainingContentSnapshot as import('./training-content-binding').TrainingContentSnapshot).units.filter(unit=>unit.source.educationLibrary):[]
  const educationStandards=await readEducationStandardStartSources(db as Prisma.TransactionClient,educationStandardUnits,composite.items.filter((item:any)=>item.type==='SCALE').map((item:any)=>item.scale))
  const educationFrozenScales=new Map<string,Awaited<ReturnType<typeof freezeExactStandardScaleDefinition>>>()
  const prepared: PreparedVariantRuntimes | undefined = (variantEnabled||flowEnabled||hasStandardCombinations||hasPreciseCognitiveProfiles||educationStandardUnits.length>0||educationLibraryUnits.length>0) ? { scales:new Map(), cognitive:new Map(), assignments:new Map() } : undefined
  if (variantEnabled && relationalIdentity) throw compositeBadRequest('概率分卷不支持关系测评投放')
  if (variantEnabled || flowEnabled) {
    if(variantEnabled)await assertTrainingVariantAuthoringScope(db as any, composite)
    if(!userId)composite={...composite,deliveryCourseId:composite.questionnaireCourses[0].courseId}
    // Frozen published deliveries retain ordinary use rights. Broken identities still fail admission;
    // never redraw or silently renormalize the remaining probabilities.
    const scaleIds=composite.items.filter((i:any)=>i.type==='SCALE').map((i:any)=>i.scaleId)
    const scales=await db.scale.findMany({where:{id:{in:scaleIds}}})
    const scaleMap=new Map(scales.map((x:any)=>[x.id,x]))
    for(const id of scaleIds){const scale:any=scaleMap.get(id);if(!scale||scale.status!=='PUBLISHED'||!scale.definition)throw compositeForbidden('候选分卷的量表已不可用')}
    const cognitiveIds=composite.items.filter((i:any)=>i.type==='COGNITIVE').map((i:any)=>i.cognitiveAssignmentId)
    const cognitive=await db.cognitiveAssignment.findMany({where:{id:{in:cognitiveIds}},include:{config:true}})
    if(cognitive.length!==new Set(cognitiveIds).size)throw compositeForbidden('候选分卷的认知配置不存在')
    for(const assignment of cognitive){if(assignment.status!=='PUBLISHED'||assignment.config.status!=='PUBLISHED')throw compositeForbidden('候选分卷的认知配置已不可用');assertCognitiveProductEligible(assignment.config.testType);validateCognitiveConfig(assignment.config)}

  }
  const nativeSjtUnits=educationComposition?(composite.trainingContentSnapshot as import('./training-content-binding').TrainingContentSnapshot).units.filter(unit=>unit.source.educationNative?.provider==='SJT_RELEASE'):[]
  const nativeSjt=nativeSjtUnits.length?await readEducationSjtSources(db as Prisma.TransactionClient,nativeSjtUnits.map(unit=>({provider:'SJT_RELEASE',kind:'SJT',versionId:unit.source.educationNative!.sourceId,contentHash:unit.source.educationNative!.contentHash})),educationProduct!):null
  const situationalReleases = nativeSjt?new Map([...nativeSjt.values()].map(source=>[situationalReleaseKey(source),source.resolved])):educationProduct
    ? await resolveEducationAssessmentSituationalItems(db as Prisma.TransactionClient,composite.items.filter((item:any)=>item.type==='SITUATIONAL').map(situationalItemIdentity),educationProduct)
    : await resolveCompositeSituationalItems(composite.items, db, true, compositeSjtGrantScope(composite))
  if ([...situationalReleases.values()].some(release => release.snapshot.authorizationReceipt)) {
    // Anonymous entry obtains the same unique persisted delivery, never a client hint.
    composite.deliveryCourseId = compositeSjtGrantScope(composite)!.courseId
  }
  if (prepared) {
    try {
    for (const item of composite.items) {
      const educationUnit=educationStandardUnits.find(unit=>unit.itemId===item.id)
      const libraryUnit=educationLibraryUnits.find(unit=>unit.itemId===item.id)
      if(educationUnit){
        const source=educationStandards.get(educationUnit.source.educationStandard!.releaseId)
        if(!source)throw compositeForbidden('教育标准量表固定版本不一致')
        const sourceId=educationUnit.source.educationStandard!.releaseId
        let runtime=educationFrozenScales.get(sourceId)
        if(!runtime){runtime=await freezeExactStandardScaleDefinition(db as Prisma.TransactionClient,source);educationFrozenScales.set(sourceId,runtime)}
        if(runtime.sourceDefinitionHash!==educationUnit.source.educationStandard!.nativeDefinitionHash)throw compositeForbidden('教育标准量表冻结内容不一致')
        prepared.scales.set(item.id,runtime)
      }
      else if(libraryUnit){
        const source=libraryUnit.source.educationLibrary!,key='library:'+source.entryId
        if(item.type!=='SCALE'||item.scaleId!==libraryUnit.source.id||item.scale.libraryEntryId!==source.entryId||item.scale.creatorId!==libraryUnit.source.ownerId
          ||item.scale.measurementReleaseId!==libraryUnit.measurement.releaseId)
          throw compositeForbidden('教育共用量表固定身份不一致')
        let runtime=educationFrozenScales.get(key)
        if(!runtime){
          runtime=await freezeScaleRuntimeAtAttemptStart(db,{instrumentKey:item.scale.code,instrumentVersion:item.scale.instrumentVersion,
            definition:frozenDatabaseScaleDefinition(item.scale),requestedMode:'COMPOSITE',instruction:resolveFrozenScaleInstructionForScale(item.scale),
            sealedLibraryPresentation:{entryId:source.entryId,sourceDefinitionHash:source.nativeDefinitionHash,
              presentation:{releaseId:libraryUnit.measurement.releaseId,contentHash:libraryUnit.measurement.contentHash,
                presentationMode:source.presentationMode==='ALL_AT_ONCE'?'ALL_AT_ONCE':'ONE_BY_ONE'}}})
          educationFrozenScales.set(key,runtime)
        }
        if(runtime.sourceDefinitionHash!==source.nativeDefinitionHash)throw compositeForbidden('教育共用量表冻结内容不一致')
        prepared.scales.set(item.id,runtime)
      }
      else if (item.type === 'SCALE'&&item.standardCombinationSource!=null)prepared.scales.set(item.id,await freezeTrainingStandardScaleRuntime(db as Prisma.TransactionClient,
        await verifyStoredTrainingStandardItem(db as Prisma.TransactionClient,composite,item,'COLLECTION')))
      else if (item.type === 'SCALE') prepared.scales.set(item.id, await freezeScaleRuntimeAtAttemptStart(db, {
        instrumentKey:item.scale.code,instrumentVersion:item.scale.instrumentVersion,
        definition:frozenDatabaseScaleDefinition(item.scale),requestedMode:'COMPOSITE',
        instruction:resolveFrozenScaleInstructionForScale(item.scale),
      }))
      if (item.type === 'COGNITIVE') {
        assertCognitiveModuleEnabled()
        const assignment=item.cognitiveAssignment
        const config=assignment.config
        const pin=readTrainingCognitiveTaskBinding(assignment.courseSnapshot)
        const fixed=pin?await loadPinnedTrainingCognitiveProfile(db as Prisma.TransactionClient,pin,{userId:assignment.createdBy,configId:config.id},true):await readEducationCognitiveAssignmentArtifact(assignment)
        if(fixed)assertCognitiveAssignmentFreeze(assignment,fixed.artifact)
        if (composite.deliveryCourseId) prepared.assignments.set(item.id, await prepareTeacherPublishedAssignment(db, {
          userId:assignment.createdBy,courseId:composite.deliveryCourseId,configId:assignment.configId,
          title:assignment.title,instruction:assignment.instruction??null,
          quotaSourceAssignmentId:assignment.quotaSourceAssignmentId??assignment.id,maxAttempts:assignment.maxAttempts,
          sourceFreeze:{profile:assignment.profile,profileDefinitionVersion:assignment.profileDefinitionVersion,
            resolvedConfigSnapshotEncrypted:assignment.resolvedConfigSnapshotEncrypted,resolvedConfigHash:assignment.resolvedConfigHash,
            resolvedReportSnapshotEncrypted:assignment.resolvedReportSnapshotEncrypted},
        }))
        prepared.cognitive.set(item.id, await cognitiveSessionService.prepareUnifiedCognitiveSessionConfigSnapshot({
          db,testType:config.testType,configVersion:config.configVersion,engineVersion:config.engineVersion,
          scoringVersion:config.scoringVersion,config:resolvedCompositeCognitiveConfig(item.cognitiveAssignment),...(fixed?{frozenProfile:fixed.artifact}:{}),
        }))
      }
    }
    for (const group of (variantEnabled?parseCompiledWeightedVariants(composite.trainingVariantFrozen).groups:[{selectedSectionIds:formSections.map((s:any)=>s.id),selectedItemIds:composite.items.map((i:any)=>i.id)}])) {
      const selectedSections=formSections.filter((section:any)=>group.selectedSectionIds.includes(section.id))
      for(const item of composite.items) {
        const scale=prepared.scales.get(item.id)
        if(group.selectedItemIds.includes(item.id)&&scale?.schemaVersion===2) assertScaleContextCollectable({policy:scale.compiledPolicy.applicability,scalePosition:item.position,sections:selectedSections})
      }
    }
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error
      throw compositeBadRequest('候选分卷存在不可运行的量表或认知冻结配置')
    }
  }
  const cognitiveMedia = prepared ? [...prepared.cognitive.values()].flatMap(value=>cognitivePresentationAssetReferences(value.snapshot.presentation)) : []
  const candidateMedia = await lockCompositeAssetReferences(db, composite.items, formSections, situationalReleases, cognitiveMedia)
  if (prepared) {
    try { await assertAssessmentAssetReferencesReady(candidateMedia, db) }
    catch { throw compositeBadRequest('候选分卷包含不可用或不匹配的冻结媒体') }
    if (userId && variantEnabled) {
      const cognitiveItems=composite.items.filter((i:any)=>i.type==='COGNITIVE')
      const sources = await Promise.all(cognitiveItems.map((i:any)=>cognitiveQuotaSource(db as any,i.cognitiveAssignmentId)))
      const byItem=new Map<string,string>(cognitiveItems.map((item:any,index:number)=>[item.id,sources[index].id]))
      const sourceIds=[...new Set<string>(sources.map(source=>source.id))].sort()
      for (const id of sourceIds) await lockCognitiveQuota(db as any,userId,id)
      const quotas=new Map<string,number>()
      for(const id of sourceIds){
        // Read-only preflight uses the published leaf; START still verifies its
        // actual parent binding. An untracked copy retains the global quota.
        const items=cognitiveItems.filter((item:any)=>byItem.get(item.id)===id)
        const remaining=await Promise.all(items.map((item:any)=>readCognitiveQuota(db as any,userId,item.cognitiveAssignmentId,{compositeAssessmentId:composite.id,compositeItemId:item.id})))
        quotas.set(id,Math.min(...remaining.map(quota=>quota.remainingAttempts)))
      }
      for(const group of parseCompiledWeightedVariants(composite.trainingVariantFrozen).groups){
        const needed=new Map<string,number>()
        for(const id of group.selectedItemIds){const source=byItem.get(id);if(source)needed.set(source,(needed.get(source)??0)+1)}
        for(const [source,count] of needed)if((quotas.get(source)??0)<count)throw compositeConflict('至少一个候选分卷的认知任务次数不足，不能改变原分配概率')
      }
    }
  }

  const newAttemptId = randomUUID()
  // Validate the whole frozen candidate set before any random draw. Execution
  // sources must match the frozen release; never choose the latest pointer here.
  const contentCandidate=await prepareTrainingContentAttemptBinding(db as Prisma.TransactionClient,{
    compositeId:composite.id,attemptId:newAttemptId,epoch:attemptEpoch,
    snapshot:composite.trainingContentSnapshot,snapshotHash:composite.trainingContentSnapshotHash,
    composite,resolvedSituational:situationalReleases,educationComposition,
  })
  let variantAllocation: ReturnType<typeof createWeightedVariantAllocation> | null = null
  if (variantEnabled) {
    const frozen = parseCompiledWeightedVariants(composite.trainingVariantFrozen)
    const recompiled = compileWeightedVariants(composite.trainingVariantDraft,buildTrainingVariantUnion(composite))
    if (frozen.configDigest!==composite.trainingVariantDigest || recompiled.configDigest!==frozen.configDigest) throw compositeBadRequest('概率分卷冻结配置不一致')
    variantAllocation = createWeightedVariantAllocation(frozen, {compositeId:composite.id,attemptId:newAttemptId,
      participantKey:credential?.participantKey??`user:${userId}`,attemptEpoch,publishedAt:new Date(composite.publishedAt).toISOString()})
    const selectedItems=new Set(variantAllocation.selectedItemIds),selectedSections=new Set(variantAllocation.selectedSectionIds)
    composite={...composite,items:composite.items.filter((i:any)=>selectedItems.has(i.id)),formSections:formSections.filter((x:any)=>selectedSections.has(x.id))}
    formSections=composite.formSections
  }
  const totalUnits = finalOnly
    ? composite.items.filter((item: any) => item.type !== 'FORM' && item.required).length + formSections.length
    : composite.items.length
  const completedItems = finalOnly
    ? 0
    : composite.items.filter((item: any) => !item.required && !item.contextKey).length
  const progress = totalUnits === 0
    ? 100
    : Math.round((completedItems / totalUnits) * 100)
  if(composite.trainingTimingPolicy && (composite.productKind!=='QUESTIONNAIRE'||composite.questionnaireType!=='COURSE'||!finalOnly||relationalIdentity||composite.reportPackageKey||composite.analysisProtocolKey)) throw compositeBadRequest('此投放不支持可选计时')
  const trainingTimingSnapshot=freezeTrainingTimingSnapshot(composite.trainingTimingPolicy,composite.deliveryCourseId??null,attemptEpoch,!userId)
  if(trainingTimingSnapshot&&!userId){const course=await db.course.findUnique({where:{id:trainingTimingSnapshot.course.courseId},select:{courseType:true,isLibrary:true}});if(!course||course.courseType!=='TRAINING_COURSE'||course.isLibrary)throw compositeBadRequest('新匿名计时准入的 Training 课程来源已不可用')}
  const trainingPersistenceSnapshot = persistenceBinding ? freezeTrainingPersistenceSnapshot({
    policy: composite.trainingPersistencePolicy, policyHash: composite.trainingPersistencePolicyHash,
    attemptId: newAttemptId, attemptEpoch, compositeId: composite.id, ...persistenceBinding,
  }) : null
  const trainingFeedbackSnapshot = feedbackBinding ? freezeTrainingFeedbackSnapshot({ ...feedbackBinding, attemptId: newAttemptId, attemptEpoch }) : null
  const selectedContentItems=new Set<string>(composite.items.map((item:any)=>item.id))
  // Include conditional/unselected slots before admitting the parent; otherwise
  // a stop could first be discovered halfway through an accepted attempt.
  // Education organization resources admit through their own education run
  // boundary (education use grant checked at publication); for them only the
  // shared emergency-stop/identity lock applies, never Training entry policies.
  const collectionScaleIds=composite.items.filter((item:any)=>item.type==='SCALE').map((item:any)=>item.scaleId)
  if(composite.productKind==='ORGANIZATION_RESOURCE')await assertScaleLibraryCollectionAllowed(db as Prisma.TransactionClient,[],collectionScaleIds)
  else {
    // Explicit product decision: exact C/P/R combinations carry their own
    // Training entry approval. contentCandidate already revalidated each such
    // item, its current use, source/deployment identity and shared stop locks.
    // Filter at item level so a native item sharing the Scale cannot borrow it.
    const nativeScaleIds=composite.items.filter((item:any)=>item.type==='SCALE'&&item.standardCombinationSource==null).map((item:any)=>item.scaleId)
    await assertTrainingScaleCollectionAllowed(db as Prisma.TransactionClient,nativeScaleIds,{sourceOwnerId:composite.createdBy})
  }
  const trainingContentBinding=contentCandidate?{...contentCandidate.binding,
    units:contentCandidate.binding.units.filter(unit=>selectedContentItems.has(unit.itemId))}:null
  const attempt = await db.compositeAssessmentAttempt.create({
    data: {
      id: newAttemptId,
      ...(trainingContentBinding?{trainingContentBinding:trainingContentBinding as Prisma.InputJsonValue,
        trainingContentBindingHash:canonicalHash(trainingContentBinding)}:{}),
      ...(trainingFeedbackSnapshot ? { trainingFeedbackSnapshot: trainingFeedbackSnapshot as Prisma.InputJsonValue,
        trainingFeedbackSnapshotHash: canonicalHash(trainingFeedbackSnapshot) } : {}),
      ...(trainingPersistenceSnapshot ? { trainingPersistenceSnapshot: trainingPersistenceSnapshot as Prisma.InputJsonValue,
        trainingPersistenceSnapshotHash: canonicalHash(trainingPersistenceSnapshot) } : {}),
      ...(variantAllocation ? {trainingVariantAllocationEncrypted:encryptUnifiedRuntimePayload(variantAllocation),trainingVariantAllocationHash:variantAllocation.allocationHash} : {}),
      compositeAssessmentId: composite.id,
      ...(trainingTimingSnapshot ? {trainingTimingSnapshot} : {}),
      ...(composite.productKind === 'QUESTIONNAIRE'
        ? { deliveryCourseId: composite.deliveryCourseId ?? null }
        : composite.productKind === 'ASSESSMENT_BUNDLE'
          ? { deliveryCourseId: composite.courseId ?? null }
          : {}),
      userId,
      accessTokenId,
      recoveryTokenHash: credential?.hash ?? null,
      participantKey: field?.participantKey ?? credential?.participantKey ?? `user:${userId}`,
      anonymousCode: credential?.anonymousCode ?? null,
      attemptNo,
      deliveryMode: finalOnly ? 'FINAL_ONLY' : 'LEGACY',
      runtimeGeneration: finalOnly ? 'UNIFIED_V1' : null,
      compiledBundleRuntimeHash: bundleRuntimeHash ?? (packageSnapshot ? compiledBundleRuntimeHashForSnapshot(packageSnapshot) : null),
      attemptEpoch,
      ...(relationalIdentity ? {
        subjectUserId: relationalIdentity.subjectUserId,
        respondentUserId: relationalIdentity.respondentUserId,
        respondentType: relationalIdentity.respondentType,
        episodeId: relationalIdentity.episodeId,
        assignmentRef: relationalIdentity.assignmentRef,
        consentId: relationalIdentity.consentId,
      } : {}),
      ...(field?{subjectUserId:field.subjectUserId,respondentUserId:field.respondentUserId,respondentType:'OBSERVER',assignmentRef:null,episodeId:null,consentId:null}:{}),
      completedItems,
      progress,
    },
  })
  // With no demographic section there are no participant fields to collect.
  // Freeze the explicit policy with the truthful empty context before creating
  // or exposing any measurement child. Context-bearing tasks bind atomically
  // when their context section is submitted, before the next runner is delivered.
  if(trainingContentBinding&&!formSections.some((section:any)=>section.contextSection||section.items?.some((item:any)=>item.contextKey))
    &&!composite.items.some((item:any)=>item.type==='FORM'&&item.contextKey)){
    await freezeTrainingReferenceBinding(db as Prisma.TransactionClient,{...attempt,compositeAssessment:composite})
  }
  if (finalOnly && formSections.length > 0 && !flowEnabled) {
    await db.compositeFormSectionAttempt.createMany({
      data: formSections.map((section: any) => ({
        attemptId: attempt.id,
        sectionId: section.id,
        attemptEpoch,
      })),
    })
  }
  const materialAssignment = await allocateTrainingMaterial(db,attempt,composite,restartMaterialClaimId)
  const flowCandidate = flowEnabled ? await freezeTrainingFlowCandidates(db,attempt,composite,prepared!,situationalReleases) : null
  const runtime = flowCandidate?.runtime ?? await createChildRecords(db, attempt, composite, composite.items, userId, formSections, situationalReleases, prepared,undefined,educationProduct,educationStart?bindVerifiedEducationAttempt(educationStart,db,attempt):undefined)
  if (finalOnly) {
    const frozenActiveSlotSet = freezeCompositeActiveSlotSet({
      attemptEpoch,
      unitOrder:contentCandidate&&'educationUnitOrder' in contentCandidate?contentCandidate.educationUnitOrder:undefined,
      unitPresentation:contentCandidate&&'educationUnitPresentation' in contentCandidate?contentCandidate.educationUnitPresentation:undefined,
      scales: runtime.scales,
      cognitive: runtime.cognitive,
      situational: runtime.situational,
      formSections: formSections.map((section: any) => ({
        sectionId: section.id,
        definitionHash: formSectionIdentityHash(compositeFormSectionRuntimeDefinition(section)),
      })),
    })
    await db.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        ...(flowCandidate ? (()=>{const snapshot={...flowCandidate.snapshot,...(materialAssignment?{schemaVersion:2,materialAssignment}:{}),slotSetHash:frozenActiveSlotSet.snapshotHash};return {trainingFlowSnapshotEncrypted:encryptUnifiedRuntimePayload(snapshot),trainingFlowSnapshotHash:canonicalHash(snapshot)}})():{}),
        frozenActiveSlotSetEncrypted: await storeFrozenActiveSlotSet(frozenActiveSlotSet, db),
        frozenActiveSlotSetHash: frozenActiveSlotSet.snapshotHash,
      },
    })
  }
  if(materialAssignment){
    await ensureTrainingFlowCurrentChildInTransaction(db as Prisma.TransactionClient,attempt.id,userId?{userId}:{recoveryTokenHash:credential!.hash})
    await db.$executeRawUnsafe('SET CONSTRAINTS training_material_claim_scope, training_material_quota_claim_scope, training_material_binding_scope, training_material_claim_attempt_fk, training_material_binding_initial_claim_fk IMMEDIATE')
  }
  await contentCandidate?.recheckSourceLicenses()
  await assertTrainingPrivateReferenceAdmissionCurrent(db as Prisma.TransactionClient)
  return attempt
}

export const startRelationalCompositeAttemptInTransaction = async (
  db: Db,
  input: {
    compositeAssessmentId: string
    respondentUserId: string
    attemptIdentity: RelationalCompositeAttemptIdentityV1
    educationStart?: VerifiedEducationStart
  },
) => {
  if (input.attemptIdentity.respondentUserId !== input.respondentUserId) {
    throw compositeForbidden('关系测评 respondent identity 不匹配')
  }
  await db.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${input.compositeAssessmentId} FOR UPDATE`
  const composite = await loadComposite(input.compositeAssessmentId, true, db)
  assertSupportedComposite(composite, false, false)
  if (composite.status !== 'PUBLISHED') throw compositeBadRequest('关系测评运行目标尚未发布')
  if (composite.deliveryMode === 'LEGACY') throw compositeBadRequest('关系测评必须使用 Unified FINAL_ONLY 运行时')
  if (composite.course?.isLibrary) throw compositeBadRequest('库课程综合测评不能作为关系测评运行目标')

  const existing = await db.compositeAssessmentAttempt.findFirst({
    where: { assignmentRef: input.attemptIdentity.assignmentRef },
    orderBy: { startedAt: 'desc' },
  })
  if (existing) {
    if (existing.userId !== input.respondentUserId || existing.compositeAssessmentId !== input.compositeAssessmentId) {
      throw compositeConflict('关系测评 assignmentRef 已绑定到其他运行记录')
    }
    return existing
  }

  const participantKey = `user:${input.respondentUserId}`
  const latest = await db.compositeAssessmentAttempt.findFirst({
    where: { compositeAssessmentId: input.compositeAssessmentId, participantKey },
    orderBy: { attemptNo: 'desc' },
    select: { attemptNo: true },
  })
  return createAttempt(
    db,
    composite,
    input.respondentUserId,
    null,
    undefined,
    (latest?.attemptNo ?? 0) + 1,
    1,
    input.attemptIdentity,
    undefined,
    input.educationStart,
  )
}

/** Field authority is verified by the product adapter in this same transaction.
 * This wrapper shares the canonical builder and never creates a relational Run. */
export async function startFieldCompositeAttemptInTransaction(db:Db,input:{compositeId:string;respondentUserId:string;proof:VerifiedFieldStart;beforeCreate:()=>Promise<void>}){
 const scope=readVerifiedFieldStart(input.proof,{tx:db,compositeId:input.compositeId,respondentUserId:input.respondentUserId})
 await db.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${scope.participantKey}))`)
 const prior=await db.compositeAssessmentAttempt.findFirst({where:{compositeAssessmentId:input.compositeId,participantKey:scope.participantKey},orderBy:{attemptNo:'desc'}})
 if(prior){
  if(prior.userId!==scope.respondentUserId||prior.subjectUserId!==scope.subjectUserId||prior.respondentUserId!==scope.respondentUserId||prior.assignmentRef!==null)
   throw compositeForbidden('现场观察作答身份不匹配')
  return {attempt:prior,replayed:true}
 }
 await input.beforeCreate()
 const composite=await loadComposite(input.compositeId,true,db)
 if(composite.status!=='PUBLISHED'||composite.deliveryMode==='LEGACY'||composite.productKind!=='ORGANIZATION_RESOURCE'
  ||composite.items.some((item:any)=>!['SCALE','FORM'].includes(item.type))||scope.subjectUserId===null&&composite.items.some((item:any)=>item.type==='SCALE'))
  throw compositeForbidden('现场观察只允许对应目标的量表与表单')
 const attempt=await createAttempt(db,composite,input.respondentUserId,null,undefined,1,1,undefined,undefined,undefined,input.proof)
 return {attempt,replayed:false}
}

export const startUserAttempt = async (userId: string, compositeId: string) => {
  // Pure-read (write-time invariant): the student start path never lazily
  // repairs sections on a published composite. loadComposite already includes
  // formSections + items, so no separate section read is needed.
  const composite = await loadComposite(compositeId, true)
  assertSupportedComposite(composite, false, false)
  await assertStudentEligibility(composite, userId)

  const isUniqueConstraintError = (err: unknown) =>
    typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === 'P2002'

  for (let retry = 0; retry < 2; retry += 1) {
    try {
      const attempt = await prisma.$transaction(async (tx: Db) => {
        if (composite.productKind === 'QUESTIONNAIRE' && composite.deliveryMode !== 'LEGACY') {
          await lockAuthenticatedAdmission(tx, compositeId, userId)
        } else {
          await tx.$queryRaw`SELECT "id" FROM "composite_assessments" WHERE "id" = ${compositeId} FOR UPDATE`
        }
        const existing = await tx.compositeAssessmentAttempt.findFirst({
          where: { compositeAssessmentId: compositeId, userId, status: 'IN_PROGRESS' },
          orderBy: { startedAt: 'desc' },
        })
        if (existing) return existing

        const used = await tx.compositeAssessmentAttempt.count({ where: { compositeAssessmentId: compositeId, userId } })
        if (used >= composite.maxAttempts) throw compositeConflict('已达到综合测评最大次数')
        const latest = await tx.compositeAssessmentAttempt.findFirst({
          where: { compositeAssessmentId: compositeId, userId },
          orderBy: { attemptNo: 'desc' },
          select: { attemptNo: true },
        })
        return createAttempt(tx, composite, userId, null, undefined, (latest?.attemptNo ?? 0) + 1)
      })
      return { attempt: await getAttemptState(attempt.id, { userId }), recoveryToken: null }
    } catch (err) {
      if (!isUniqueConstraintError(err) || retry === 1) throw err
    }
  }

  throw compositeConflict('无法创建综合测评记录，请稍后重试')
}

/**
 * Replace an in-progress Composite attempt with a clean final-only attempt.
 * The retired attempt remains available to reporting/audit code; its child
 * rows are never deleted.
 */
/** An acknowledged unit is FINAL even while its asynchronous snapshot is pending. */
const assertNoAcceptedTrainingVariantUnit = async (db: Db, attemptId: string, epoch: number) => {
  const rows = await db.$queryRaw<Array<{ accepted: boolean }>>`SELECT (
    EXISTS(SELECT 1 FROM assessment_unit_snapshots WHERE composite_attempt_id=${attemptId} AND attempt_epoch=${epoch})
    OR EXISTS(SELECT 1 FROM composite_form_section_attempts WHERE attempt_id=${attemptId} AND attempt_epoch=${epoch} AND (submission_id IS NOT NULL OR submission_payload_hash IS NOT NULL OR submitted_at IS NOT NULL OR status='COMPLETED'))
    OR EXISTS(SELECT 1 FROM assessments WHERE composite_attempt_id=${attemptId} AND attempt_epoch=${epoch} AND (submission_id IS NOT NULL OR submission_payload_hash IS NOT NULL OR status='COMPLETED'))
    OR EXISTS(SELECT 1 FROM cognitive_sessions WHERE composite_attempt_id=${attemptId} AND attempt_no=${epoch} AND (submission_id IS NOT NULL OR submission_payload_hash IS NOT NULL OR submitted_at IS NOT NULL OR status='COMPLETED'))
    OR EXISTS(SELECT 1 FROM situational_attempts WHERE composite_attempt_id=${attemptId} AND attempt_epoch=${epoch} AND (submission_id IS NOT NULL OR submission_payload_hash IS NOT NULL OR submitted_at IS NOT NULL OR status='COMPLETED'))
    OR EXISTS(SELECT 1 FROM composite_report_jobs WHERE attempt_id=${attemptId} AND attempt_epoch=${epoch} AND (whole_submission_id IS NOT NULL OR whole_payload_hash IS NOT NULL OR whole_accepted_at IS NOT NULL OR whole_answers_encrypted IS NOT NULL))
  ) AS accepted`
  if (rows[0]?.accepted) throw compositeConflict('此概率分卷已接收 FINAL 作答，请继续原作答；不能重启重新抽签')
}

export const restartUserAttempt = async (userId: string, attemptId: string) => {
  const existing = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, userId: true, compositeAssessmentId: true },
  })
  if (!existing) throw compositeNotFound('综合测评记录不存在')
  if (existing.userId !== userId) throw compositeForbidden('无权限重启此综合测评')

  // Already accepted whole answers are final; avoid loading new-start eligibility.
  await assertNoAcceptedWholeQuestionnaire(prisma, attemptId)

  // Pure-read (write-time invariant): the student restart path never lazily
  // repairs sections on a published composite. loadComposite already includes
  // formSections + items, so no separate section read is needed.
  const composite = await loadComposite(existing.compositeAssessmentId, true)
  assertSupportedComposite(composite)
  await assertStudentEligibility(composite, userId)

  const next = await prisma.$transaction(async (tx: Db) => {
    await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${composite.id} FOR UPDATE`
    await lockCompositeAttempt(tx, attemptId)
    if(composite.trainingVariantFrozen != null || composite.trainingFlowFrozen?.schemaVersion===2){
      const used=await tx.compositeAssessmentAttempt.count({where:{compositeAssessmentId:composite.id,...(existing.userId?{userId:existing.userId}:{participantKey:(existing as any).participantKey})}})
      if(!Number.isInteger(composite.maxAttempts)||composite.maxAttempts<1||composite.maxAttempts>100||used>=composite.maxAttempts)throw compositeConflict('概率分卷次数已用完；取消和重启也计入次数')
    }
    await assertNoAcceptedWholeQuestionnaire(tx as Prisma.TransactionClient, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        compositeAssessmentId: true,
        status: true,
        attemptNo: true,
        attemptEpoch: true, participantKey:true, trainingFlowSnapshotEncrypted:true, trainingFlowSnapshotHash:true,
      },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.userId !== userId) throw compositeForbidden('无权限重启此综合测评')
    if (current.status !== 'IN_PROGRESS') throw compositeConflict('只有进行中的综合测评可以重启')
    if (composite.trainingVariantFrozen != null || composite.trainingFlowFrozen?.schemaVersion===2) await assertNoAcceptedTrainingVariantUnit(tx, current.id, current.attemptEpoch)
    await tx.compositeAssessmentAttempt.update({
      where: { id: current.id },
      data: { status: 'ABANDONED', completedAt: new Date(), recoveryTokenHash: null },
    })
    return createAttempt(
      tx,
      composite,
      userId,
      null,
      undefined,
      current.attemptNo + 1,
      current.attemptEpoch + 1,
      undefined,
      materialRestartClaim(current,composite),
    )
  })
  return { attempt: await getAttemptState(next.id, { userId }), recoveryToken: null }
}

const findPublicToken = async (tokenValue: string, db: Db = prisma) => {
  const tokenHash = hashPublicAccessToken(tokenValue)
  // Token/content layering (Work C): the token lookup reads only the token
  // metadata plus the minimal composite fields required for validation. The
  // full composite content graph is loaded separately (loadComposite) by the
  // callers that actually render it, so a public read never loads the content
  // twice.
  let token = await db.compositeAssessmentAccessToken.findUnique({
    where: { tokenHash },
    include: {
      trainingRound:{select:trainingRoundSelect},
      compositeAssessment: {
        select: {
          id: true,
          productKind: true,
          publicEnabled: true,
          status: true,
          opensAt: true,
          expiresAt: true,
          course: { select: { isLibrary: true } },
          items: { select: { type: true, situationalInstrumentKey: true, situationalInstrumentVersion: true } },
        },
      },
    },
  })
  if (!token) {
    // Keep a bounded compatibility window for rows not yet processed by the
    // explicit backfill. New rows never use this plaintext lookup path.
    token = await db.compositeAssessmentAccessToken.findUnique({
      where: { token: tokenValue },
      include: {
        trainingRound:{select:trainingRoundSelect},
        compositeAssessment: {
          select: {
            id: true,
            productKind: true,
          publicEnabled: true,
            status: true,
            opensAt: true,
            expiresAt: true,
            course: { select: { isLibrary: true } },
            items: { select: { type: true, situationalInstrumentKey: true, situationalInstrumentVersion: true } },
          },
        },
      },
    })
    if (token?.tokenHash && token.tokenHash !== tokenHash) token = null
  }
  if (!token) throw compositeNotFound('公开链接不存在')
  assertNotOrganizationResourceGenericEntry(token.compositeAssessment)
  if (!token.compositeAssessment.publicEnabled || token.compositeAssessment.status !== 'PUBLISHED') throw compositeForbidden('综合测评未开放公开参与')
  assertNotLibraryComposite(token.compositeAssessment, '库课程上的综合测评不能公开作答')
  assertSupportedComposite(token.compositeAssessment, false, false)
  return token as any
}

export const getPublicCompositeInfo = async (tokenValue: string, db: Db = prisma) => {
  const token = await findPublicToken(tokenValue, db)
  assertSupportedComposite(token.compositeAssessment)
  assertTokenWindow(token)
  await assertTrainingTokenRound(db as Prisma.TransactionClient,token)
  const composite = token.compositeAssessment
  assertCompositeWindow(composite)
  // Pure-read (write-time invariant): the public info path never lazily
  // repairs sections on a published composite. loadComposite already includes
  // formSections + items, so no separate section read is needed.
  const current = await loadComposite(composite.id, true, db)
  const packageSlotLabels = getFrozenPackageSlotLabels(current)
  const units = [
    ...current.items
      .filter((item: any) => item.type !== 'FORM')
      .map((item: any) => ({
        type: item.type === 'SCALE' ? 'scale' as const : item.type === 'COGNITIVE' ? 'cognitive' as const : 'situational' as const,
        id: item.id,
        position: item.position,
        label: resolveCompositeItemLabel(item, packageSlotLabels),
        itemCount: 1,
        contextSection: false,
      })),
    ...(current.formSections ?? []).map((section: any) => ({
      type: 'form-section' as const,
      id: section.id,
      position: section.position,
      label: section.title,
      itemCount: section.items.length,
      contextSection: compositeSectionHasContext(section),
    })),
  ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
  const waves = await db.$queryRaw`SELECT w.id FROM anonymous_study_waves w JOIN anonymous_studies s ON s.id=w.study_id WHERE w.access_token_id=${token.id} AND s.status='ACTIVE' LIMIT 1`
  return {
    id: current.id,
    name: current.name,
    description: current.description,
    instruction: current.instruction,
    ...publicRoundMetadata(token),
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    usedCount: token.usedCount,
    studyEntryPath: waves[0] ? `/public/studies/waves/${waves[0].id}/${encodeURIComponent(tokenValue)}` : null,
    deliveryMode: 'FINAL_ONLY' as const,
    attemptEpoch: 1,
    weightedVariants:current.trainingVariantFrozen!=null,
    maxAttempts:current.maxAttempts,
    items: (current.trainingVariantFrozen!=null||hasTrainingFlowDefinitionMarkers(current))?[]:current.items.map((item: any) => ({ type: item.type, position: item.position, label: resolveCompositeItemLabel(item, packageSlotLabels) })),
    units:(current.trainingVariantFrozen!=null||hasTrainingFlowDefinitionMarkers(current))?[]:units,
    formSections: (current.trainingVariantFrozen!=null||hasTrainingFlowDefinitionMarkers(current))?[]:(current.formSections ?? []).map((section: any) => ({
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: compositeSectionHasContext(section),
      items: section.items ?? [],
    })),
  }
}

// Internal study orchestration joins the same admission transaction. It cannot
// alter scoring, respondent role, content, or final submission semantics.
export type PublicStudyAdmission = {
  credential: ReturnType<typeof createRecoveryCredential>
  beforeAdmission: (tx: Prisma.TransactionClient) => Promise<string | null>
  afterAdmission: (tx: Prisma.TransactionClient, attemptId: string) => Promise<void>
}
export const startPublicAttempt = async (tokenValue: string, recoveryToken?: string, study?: PublicStudyAdmission) => {
  const token = await findPublicToken(tokenValue)
  // Pure-read (write-time invariant): the public start path never lazily
  // repairs sections on a published composite. loadComposite already includes
  // formSections + items, so no separate section read is needed.
  const composite = await loadComposite(token.compositeAssessment.id, true)
  if (study && (composite.trainingVariantFrozen != null || composite.trainingFlowFrozen != null)) throw compositeBadRequest('概率分卷暂不支持匿名研究组合')
  if (recoveryToken) {
    const recoveryTokenHash = hashRecoveryToken(recoveryToken)
    const existing = await prisma.compositeAssessmentAttempt.findFirst({ where: { accessTokenId: token.id, recoveryTokenHash } })
    if (existing) return { attempt: await getAttemptState(existing.id, { recoveryTokenHash }), recoveryToken: null }
    throw compositeForbidden('恢复凭证无效')
  }
  if (!study) assertTokenWindow(token)
  assertCompositeWindow(token.compositeAssessment)
  const credential = study?.credential ?? createRecoveryCredential()
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${composite.id} FOR UPDATE`
    const existingId = study ? await study.beforeAdmission(tx) : null
    if (existingId) {
      const existing = await tx.compositeAssessmentAttempt.findUnique({where:{id:existingId}})
      if (!existing || existing.userId !== null || existing.accessTokenId !== token.id || existing.recoveryTokenHash !== credential.hash) throw compositeForbidden('研究作答记录不可恢复')
      return existing
    }
    assertTokenWindow(token)
    const roundCourseId=await assertTrainingTokenRound(tx,token)
    const claimed = await tx.compositeAssessmentAccessToken.updateMany({
      where: { id: token.id, isActive: true, expiresAt: { gt: new Date() }, OR: [{ maxUses: 0 }, { usedCount: { lt: token.maxUses } }] },
      data: { usedCount: { increment: 1 } },
    })
    if (claimed.count !== 1) throw compositeConflict('公开链接已达到最大参与次数')
    const admitted = await createAttempt(tx, roundCourseId?{...composite,deliveryCourseId:roundCourseId}:composite, null, token.id, credential)
    if (study) await study.afterAdmission(tx, admitted.id)
    await assertTrainingPrivateReferenceAdmissionCurrent(tx as Prisma.TransactionClient)
    return admitted
  })
  return { attempt: await getAttemptState(attempt.id, { recoveryTokenHash: credential.hash }), recoveryToken: credential.token }
}

/** Restart an anonymous attempt using only the server-issued recovery hash. */
export const restartPublicAttempt = async (attemptId: string, recoveryTokenHash: string) => {
  const existing = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      recoveryTokenHash: true,
      accessTokenId: true,
      participantKey:true, anonymousCode:true,
      compositeAssessmentId: true,
    },
  })
  if (!existing) throw compositeNotFound('综合测评记录不存在')
  if (existing.userId !== null || existing.recoveryTokenHash !== recoveryTokenHash) {
    throw compositeForbidden('恢复凭证无权重启此综合测评')
  }
  const studyBinding = await prisma.$queryRaw<Array<{id:string}>>`SELECT attempt_id AS id FROM anonymous_study_attempts WHERE attempt_id=${attemptId} LIMIT 1`
  if(studyBinding.length) throw compositeConflict('研究作答请从研究任务入口恢复；该波次不创建重复作答。')
  const accessToken = existing.accessTokenId
    ? await prisma.compositeAssessmentAccessToken.findUnique({
        where: { id: existing.accessTokenId },
        select: { isActive: true, expiresAt: true },
      })
    : null
  if (!accessToken || !accessToken.isActive || accessToken.expiresAt.getTime() <= Date.now()) {
    throw compositeForbidden('公开链接已失效')
  }

  // Already accepted whole answers are final; avoid loading new-start eligibility.
  await assertNoAcceptedWholeQuestionnaire(prisma, attemptId)

  // Pure-read (write-time invariant): the public restart path never lazily
  // repairs sections on a published composite. loadComposite already includes
  // formSections + items, so no separate section read is needed.
  const composite = await loadComposite(existing.compositeAssessmentId, true)
  assertSupportedComposite(composite)
  if (!composite.publicEnabled || composite.status !== 'PUBLISHED') throw compositeForbidden('综合测评未开放公开参与')
  const credential = { ...createRecoveryCredential(), participantKey:existing.participantKey, anonymousCode:existing.anonymousCode! }

  const next = await prisma.$transaction(async (tx: Db) => {
    await tx.$queryRaw`SELECT id FROM composite_assessments WHERE id=${composite.id} FOR UPDATE`
    const tokens=await tx.$queryRaw<Array<{isActive:boolean;expiresAt:Date;trainingRoundId:string|null}>>`SELECT is_active AS "isActive",expires_at AS "expiresAt",training_round_id AS "trainingRoundId" FROM composite_assessment_access_tokens WHERE id=${existing.accessTokenId} AND composite_assessment_id=${composite.id} FOR UPDATE`
    if(tokens.length!==1||!tokens[0].isActive||new Date(tokens[0].expiresAt).getTime()<=Date.now())throw compositeForbidden('公开链接已失效')
    const roundCourseId=await assertTrainingTokenRound(tx as Prisma.TransactionClient,{...tokens[0],compositeAssessmentId:composite.id})
    await lockCompositeAttempt(tx, attemptId)
    if(composite.trainingVariantFrozen != null || composite.trainingFlowFrozen?.schemaVersion===2){
      const used=await tx.compositeAssessmentAttempt.count({where:{compositeAssessmentId:composite.id,...(existing.userId?{userId:existing.userId}:{participantKey:(existing as any).participantKey})}})
      if(!Number.isInteger(composite.maxAttempts)||composite.maxAttempts<1||composite.maxAttempts>100||used>=composite.maxAttempts)throw compositeConflict('概率分卷次数已用完；取消和重启也计入次数')
    }
    await assertNoAcceptedWholeQuestionnaire(tx as Prisma.TransactionClient, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        recoveryTokenHash: true,
        accessTokenId: true,
        status: true,
        attemptNo: true,
        attemptEpoch: true,
        compositeAssessmentId: true, participantKey:true, trainingFlowSnapshotEncrypted:true, trainingFlowSnapshotHash:true,
      },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.userId !== null || current.recoveryTokenHash !== recoveryTokenHash || current.participantKey !== existing.participantKey) {
      throw compositeForbidden('恢复凭证无权重启此综合测评')
    }
    if (current.status !== 'IN_PROGRESS') throw compositeConflict('只有进行中的综合测评可以重启')
    if (composite.trainingVariantFrozen != null || composite.trainingFlowFrozen?.schemaVersion===2) await assertNoAcceptedTrainingVariantUnit(tx, current.id, current.attemptEpoch)
    await tx.compositeAssessmentAttempt.update({
      where: { id: current.id },
      data: { status: 'ABANDONED', completedAt: new Date(), recoveryTokenHash: null },
    })
    return createAttempt(
      tx,
      roundCourseId?{...composite,deliveryCourseId:roundCourseId}:composite,
      null,
      current.accessTokenId,
      credential,
      current.attemptNo + 1,
      current.attemptEpoch + 1,
      undefined,
      materialRestartClaim(current,composite),
    )
  })
  return { attempt: await getAttemptState(next.id, { recoveryTokenHash: credential.hash }), recoveryToken: credential.token }
}

// Participant reports consume committed results, not mutable answers or live scale
// definitions. Keep the parent and definition envelopes complete: authorization,
// feedback release, variants/flows and historical package reports use those fields.
const reportScaleChildSelect = {
  id: true, scaleId: true, compositeItemId: true, result: true, completedAt: true, totalTime: true,
  submissionId: true, submissionPayloadHash: true,
  attemptEpoch: true, compiledRuntimeHash: true, runtimeSnapshotEncrypted: true,
  scale: { select: { code: true, instrumentVersion: true, instrumentClass: true,
    libraryEntryId: true, measurementReleaseId: true } },
} as const
const reportCognitiveChildSelect = {
  id: true, compositeItemId: true, attemptNo: true, testType: true, finishedAt: true,
  resultSnapshotEncrypted: true, configSnapshotEncrypted: true,
  scoreEncrypted: true, metricsEncrypted: true, qualityFlagsEncrypted: true,
  engineVersion: true, scoringVersion: true, configVersion: true,
} as const
const reportSituationalChildSelect = {
  compositeItemId: true, canonicalResultEncrypted: true, runtimeSnapshotEncrypted: true,
  instrumentKey: true, instrumentVersion: true, completedAt: true, totalTime: true,
} as const

const loadAttemptWithChildren = async (attemptId: string, reportOnly = false) => {
  const attempt: any = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      _count: reportOnly ? { select: OPTIONAL_REPORT_RELATION_COUNTS } : false,
      compositeAssessment: {
        include: {
          items: {
            orderBy: { position: 'asc' },
            include: {
              scale: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  description: true,
                  status: true,
                  instrumentClass: true,
                  instrumentVersion: true,
                  ...(reportOnly ? {} : { definition: true }),
                },
              },
              cognitiveAssignment: { include: { config: true } },
            },
          },
          formSections: {
            orderBy: { position: 'asc' as const },
            include: { items: { orderBy: [{ formSectionPosition: 'asc' as const }, { position: 'asc' as const }] } },
          },
        },
      },
      scaleAssessments: reportOnly ? { select: reportScaleChildSelect } : { include: { scale: true } },
      cognitiveSessions: reportOnly ? false : {
        include: {
          trials: {
            orderBy: { trialIndex: 'desc' },
            take: 1,
            select: { trialIndex: true },
          },
        },
      },
      formAnswers: !reportOnly,
      formSectionAttempts: !reportOnly,
      situationalAttempts: !reportOnly,
    },
  })
  if (!attempt) throw compositeNotFound('综合测评记录不存在')
  if (reportOnly) {
    const empty = await emptyOptionalReportRelations(attempt)
    const [cognitiveSessions, situationalAttempts, formAnswers, formSectionAttempts] = await Promise.all([
      empty.has('cognitiveSessions') ? [] : prisma.cognitiveSession.findMany({ where: { compositeAttemptId: attemptId }, select: reportCognitiveChildSelect }),
      empty.has('situationalAttempts') ? [] : prisma.situationalAttempt.findMany({ where: { compositeAttemptId: attemptId }, select: reportSituationalChildSelect }),
      empty.has('formAnswers') ? [] : prisma.compositeFormAnswer.findMany({ where: { attemptId } }),
      empty.has('formSectionAttempts') ? [] : prisma.compositeFormSectionAttempt.findMany({ where: { attemptId } }),
    ])
    const { _count, ...parent } = attempt
    return applyTrainingAttemptScope({ ...parent, cognitiveSessions, situationalAttempts, formAnswers, formSectionAttempts })
  }
  return applyTrainingAttemptScope(attempt)
}

const lockCompositeAttempt = async (tx: Db, attemptId: string) => {
  // Keep lightweight service-test Prisma doubles usable. Real Prisma
  // transaction clients always expose $queryRaw and take the row lock.
  if (typeof tx?.$queryRaw !== 'function') return
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "composite_assessment_attempts"
    WHERE "id" = ${attemptId}
    FOR UPDATE
  `
  if (!rows?.[0]) throw compositeNotFound('综合测评记录不存在')
}

const loadAttemptForFinalization = async (tx: Db, attemptId: string) => {
  const attempt = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      compositeAssessment: {
        include: {
          items: {
            orderBy: { position: 'asc' as const },
            include: {
              cognitiveAssignment: { include: { config: true } },
              scale: { select: { id: true, code: true, status: true } },
            },
          },
          formSections: {
            orderBy: { position: 'asc' as const },
            include: { items: true },
          },
        },
      },
      scaleAssessments: true,
      cognitiveSessions: true,
      formAnswers: true,
      formSectionAttempts: true,
      situationalAttempts: true,
    },
  })
  if (!attempt) throw compositeNotFound('综合测评记录不存在')
  return applyTrainingAttemptScope(attempt)
}

const findAttempt = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }, frozenRead = false, reportOnly = false) => {
  const attempt = await loadAttemptWithChildren(attemptId, reportOnly)
  const authorized = context.userId
    ? attempt.userId === context.userId
    : Boolean(context.recoveryTokenHash && attempt.recoveryTokenHash === context.recoveryTokenHash && !attempt.userId)
  if (!authorized) throw compositeForbidden('无权限查看此综合测评记录')
  if(attempt.participantKey?.startsWith('field-v2:')||attempt.compositeAssessment.creationKey?.endsWith(':TEACHER:EXPERT_REPORT:2.0.0')){
    const {currentFieldComposition}=await import('../huiteacher/fieldComposition.authority')
    if(!context.userId)throw compositeForbidden('现场观察需要本人教育账号')
    await currentFieldComposition(prisma,{attemptId,actorUserId:context.userId})
  }
  assertSupportedComposite(attempt.compositeAssessment, frozenRead && ['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE'].includes(attempt.compositeAssessment.productKind), false)
  return attempt
}

export const freezeContext = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const authorized = await findAttempt(attemptId, context)
  if (authorized.status !== 'IN_PROGRESS') throw compositeConflict('综合测评已结束，不能冻结人口学上下文')
  return prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, select: { status: true } })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeConflict('综合测评已结束，不能冻结人口学上下文')
    const frozen = await freezeCompositeAttemptContext(tx, attemptId)
    await assertTrainingPrivateReferenceAdmissionCurrent(tx as Prisma.TransactionClient)
    return { status: 'frozen' as const, frozenAt: frozen.context.frozenAt }
  })
}

const cognitiveRunnerPayload = async (session: any, contextSnapshotHash?: string | null, feedbackDeferred = false, parent?: any, deliveredAdmission?: { attemptEpoch: number }) => {
  if (parent) feedbackDeferred = feedbackDeferred || await isLoadedCompositeParticipantFeedbackDeferred(parent)
  const admission = deliveredAdmission ?? (session.frozenAdmissionSnapshotEncrypted ? await (await import('../cognitive/cognitive-admission.service')).loadStoredCognitiveAdmission(session) : null)
  const persistence = parent ? trainingPersistenceMetadata(parent) : undefined
  const storedConfig = await cognitiveSessionService.loadCognitiveSessionConfig(session.configSnapshotEncrypted)
  const config = storedConfig.config
  const resultSnapshot = !feedbackDeferred && session.status === 'COMPLETED' && session.resultSnapshotEncrypted
    ? parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted))
    : null
  const result = resultSnapshot
    ? {
        metrics: resultSnapshot.metrics,
        quality: resultSnapshot.quality,
        qualityFlags: resultSnapshot.quality.flags,
        references: referencesForCognitiveResult(resultSnapshot),
        report: resultSnapshot.report,
        assessmentContext: resultSnapshot.assessmentContext,
      }
    : !feedbackDeferred && session.status === 'COMPLETED' && session.scoreEncrypted && session.metricsEncrypted && session.qualityFlagsEncrypted
    ? {
        score: decryptCognitivePayload<number>(session.scoreEncrypted),
        metrics: decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted),
        qualityFlags: decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted),
      }
    : undefined
  return {
    sessionId: session.id,
    ...(admission ? { sessionEpoch: admission.attemptEpoch } : {}),
    ...(persistence ? { trainingPersistence: persistence } : {}),
    assignmentId: session.assignmentId,
    testType: session.testType,
    attemptNo: session.attemptNo,
    attemptEpoch: session.attemptNo,
    deliveryMode: session.deliveryMode ?? 'FINAL_ONLY',
    definitionHash: storedConfig.snapshot?.configHash ?? null,
    contextSnapshotHash: contextSnapshotHash ?? session.compositeAttempt?.contextSnapshotHash ?? null,
    status: session.status,
    configVersion: session.configVersion,
    engineVersion: session.engineVersion,
    scoringVersion: session.scoringVersion,
    config,
    ...(storedConfig.snapshot ? { protocol: storedConfig.snapshot.protocol, protocolSignature: storedConfig.snapshot.protocolSignature } : {}),
    randomSeed: session.randomSeed,
    nextTrialIndex: (session.trials?.[0]?.trialIndex ?? -1) + 1,
    ...(result ? { result } : {}),
    ...(feedbackDeferred ? { feedbackDeferred: true } : {}),
  }
}

const latestChildrenByItem = (children: any[]) => {
  const map = new Map<string, any>()
  for (const child of children) {
    const itemId = child.compositeItemId ?? child.itemId
    if (!itemId) continue
    const current = map.get(itemId)
    if (!current || (child.attemptNo ?? 0) >= (current.attemptNo ?? 0)) {
      map.set(itemId, child)
    }
  }
  return map
}

function completedMeasurementChildren(children: any[], attemptEpoch: number, finalized: Set<string> | null = null) {
  return [...latestChildrenByItem(children).values()].filter(child => child.status === 'COMPLETED'
    && (child.attemptEpoch === undefined || child.attemptEpoch === attemptEpoch)
    && (!finalized || finalized.has(child.id)))
}

const attemptCompletedItemMaps = (attempt: any) => ({
  scaleMap: latestChildrenByItem(attempt.scaleAssessments),
  cognitiveMap: latestChildrenByItem(attempt.cognitiveSessions),
  situationalMap: latestChildrenByItem(attempt.situationalAttempts ?? []),
  formMap: latestChildrenByItem(attempt.formAnswers),
  sectionMap: new Map<string, any>((attempt.formSectionAttempts ?? []).map((section: any) => [section.sectionId, section])),
})

const isAttemptItemCompleted = (
  item: any,
  maps: ReturnType<typeof attemptCompletedItemMaps>,
  finalOnly = false,
) => {
  if (!item.required && !item.contextKey) return true
  if (item.type === 'SCALE') return maps.scaleMap.get(item.id)?.status === 'COMPLETED'
  if (item.type === 'COGNITIVE') return maps.cognitiveMap.get(item.id)?.status === 'COMPLETED'
  if (item.type === 'SITUATIONAL') return maps.situationalMap.get(item.id)?.status === 'COMPLETED'
  if (finalOnly) return maps.sectionMap.get(item.formSectionId)?.status === 'COMPLETED'
  return maps.formMap.get(item.id)?.completed !== false && maps.formMap.has(item.id)
}

const countAttemptCompletedItems = (attempt: any, maps = attemptCompletedItemMaps(attempt)) =>
  attempt.deliveryMode === 'FINAL_ONLY'
    ? attempt.compositeAssessment.items.filter((item: any) => item.type !== 'FORM' && isAttemptItemCompleted(item, maps)).length
      + (attempt.formSectionAttempts ?? []).filter((section: any) => section.status === 'COMPLETED').length
    : attempt.compositeAssessment.items.filter((item: any) => isAttemptItemCompleted(item, maps)).length

const unifiedCompositeProgressSnapshot = (
  row: { slotKey: string; terminalState: string },
  slots: Map<string, FrozenActiveSlotV1>,
  attemptEpoch: number,
): AggregateSnapshotHeader => {
  const slot = slots.get(row.slotKey)
  return {
    slotKey: row.slotKey,
    attemptEpoch,
    unitType: slot?.unitType ?? 'FORM_SECTION',
    terminalState: row.terminalState as AggregateSnapshotHeader['terminalState'],
    payloadKind: slot?.unitType === 'FORM_SECTION' ? 'COLLECTION_FACTS' : 'UNIT_RESULT',
    sourceType: 'PROGRESS_HEADER',
    sourceAttemptId: 'PROGRESS_HEADER',
  }
}

// Load-once attempt-state: the parent row is read exactly once (in
// getAttemptState) with this full select and shared by the unified state
// projection and the ensure*AtDelivery steps, so a state read never
// re-reads the same composite attempt row for routing, projection, or
// admission.
const UNIFIED_ATTEMPT_STATE_PARENT_SELECT = {
  trainingContentBindingHash:true,trainingReferenceBindingHash:true,
  ...trainingFeedbackAttemptSelect,
  participantKey:true, trainingVariantAllocationEncrypted:true, trainingFlowSnapshotEncrypted:true,trainingFlowSnapshotHash:true,trainingFlowPathEncrypted:true,trainingFlowPathHash:true,trainingVariantAllocationHash:true,
  taskSatisfaction: true,
  id: true,
  asyncReportEpoch: true,
  assignmentRef: true,
  userId: true,
  recoveryTokenHash: true,
  status: true,
  deliveryMode: true,
  runtimeGeneration: true,
  attemptEpoch: true,
  startedAt: true,
  lastSavedAt: true,
  completedAt: true,
  anonymousCode: true,
  contextSnapshotEncrypted: true,
  contextSnapshotHash: true,
  contextFrozenAt: true,
  trainingPersistenceSnapshot: true, trainingPersistenceSnapshotHash: true, deliveryCourseId: true,
  trainingTimingSnapshot: true,
  frozenActiveSlotSetEncrypted: true,
  frozenActiveSlotSetHash: true,
  compositeAssessment: {
    select: {
      ...trainingFeedbackParentSelect,
      id: true,
      publishedAt:true,trainingVariantDraft:true,trainingVariantFrozen:true,trainingFlowDraft:true,trainingFlowFrozen:true,trainingFlowDigest:true,trainingVariantDigest:true,
      name: true,
      productKind: true,
      creationKey: true,
      instruction: true,
      reportPackageSnapshotEncrypted: true,
      reportPackageKey: true,
      reportPackageVersion: true,
      reportPackageProfile: true,
      items: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          type: true,
          position: true,
          required: true,
          scaleId: true, cognitiveAssignmentId:true,
          situationalInstrumentKey: true,
          situationalInstrumentVersion: true,
          formSectionId: true,
          formType: true,
          formLabel: true,
          formPlaceholder: true,
          formOptions: true, formDefinition: true, formPolicy: true,
          contextKey: true,
          scale: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              instruction: true,
              instrumentClass: true,
              instrumentVersion: true,
            },
          },
          cognitiveAssignment: { select: { id: true, title: true } },
        },
      },
      formSections: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          contextSection: true,
          items: {
            orderBy: [{ formSectionPosition: 'asc' }, { position: 'asc' }],
            select: {
              id: true,
              formType: true,
              formLabel: true,
              formPlaceholder: true,
              formOptions: true, formDefinition: true, formPolicy: true,
              contextKey: true,
              required: true,
              position: true,
              formSectionPosition: true,
            },
          },
        },
      },
    },
  },
  // These rows identify children only. Progress comes from frozen snapshot
  // headers; the current child is loaded below with its authoritative runtime.
  // Keep every child row so variant scope still detects unselected injections.
  scaleAssessments: {
    orderBy: { startedAt: 'asc' },
    select: { id: true, compositeItemId: true },
  },
  cognitiveSessions: { select: { id: true, compositeItemId: true } },
  situationalAttempts: { select: { id: true, compositeItemId: true } },
} satisfies Prisma.CompositeAssessmentAttemptSelect

export type CompositeAttemptStateView = 'full' | 'current-unit'

const getUnifiedCompositeAttemptState = async (
  attempt: any,
  context: { userId?: string; recoveryTokenHash?: string },
  view: CompositeAttemptStateView = 'full',
) => {
  const attemptId = attempt.id
  const authorized = context.userId
    ? attempt.userId === context.userId
    : Boolean(context.recoveryTokenHash && attempt.userId === null && attempt.recoveryTokenHash === context.recoveryTokenHash)
  if (!authorized) throw compositeForbidden('无权限查看此综合测评记录')
  if(attempt.participantKey?.startsWith('field-v2:')||attempt.compositeAssessment.creationKey?.endsWith(':TEACHER:EXPERT_REPORT:2.0.0')){
    const {currentFieldComposition}=await import('../huiteacher/fieldComposition.authority')
    if(!context.userId)throw compositeForbidden('现场观察需要本人教育账号')
    await currentFieldComposition(prisma,{attemptId,actorUserId:context.userId})
  }
  attempt = await applyTrainingAttemptScope(attempt)
  if (attempt.deliveryMode !== 'FINAL_ONLY' || attempt.runtimeGeneration !== 'UNIFIED_V1') {
    throw compositeConflict('综合测评运行时版本不匹配，请重启测评')
  }
  // Publication controls new admission. Existing attempts are validated against
  // their frozen slot set below, so retiring content cannot break resume/history.
  assertSupportedComposite(attempt.compositeAssessment, true)

  let frozenSlotSet
  try {
    if (!attempt.frozenActiveSlotSetEncrypted || !attempt.frozenActiveSlotSetHash) throw new Error('FrozenActiveSlotSet missing')
    frozenSlotSet = await loadFrozenActiveSlotSet(attempt.frozenActiveSlotSetEncrypted)
    if (
      frozenSlotSet.snapshotHash !== attempt.frozenActiveSlotSetHash
      || frozenSlotSet.attemptEpoch !== attempt.attemptEpoch
      || frozenSlotSet.runtimeGeneration !== 'UNIFIED_V1'
    ) throw new Error('FrozenActiveSlotSet identity mismatch')
  } catch {
    throw compositeConflict('综合测评冻结内容不可用，请重启测评')
  }

  // Progress is closed over the frozen slot set and terminal headers only.
  // No answer, result, trial, or encrypted participant payload is selected.
  const snapshotRows = await prisma.assessmentUnitSnapshot.findMany({
    where: { compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch },
    select: { slotKey: true, terminalState: true },
  })
  const slotsByKey = new Map(frozenSlotSet.slots.map((slot: FrozenActiveSlotV1) => [slot.slotKey, slot]))
  const headers = snapshotRows.map((row) => unifiedCompositeProgressSnapshot(row, slotsByKey, attempt.attemptEpoch))
  const completeness = evaluateCompleteness({ slots: frozenSlotSet.slots, snapshots: headers, attemptEpoch: attempt.attemptEpoch, pathPolicy:attempt.trainingFlowScope?.aggregatePathPolicy })
  if (completeness.invalidSlotKeys.length > 0) throw compositeBadRequest('综合测评进度快照不可用，请重启测评')
  const headerByKey = new Map(headers.map((header) => [header.slotKey, header]))
  const slotKeyForItem = (item: any): string | null => item.type === 'SCALE' || item.type === 'COGNITIVE' || item.type === 'SITUATIONAL'
    ? compositeItemSlotKey(item.id, item.type)
    : item.type === 'FORM' && item.formSectionId
      ? formSectionSlotKey(item.formSectionId)
      : null
  const completedSlot = (slotKey: string | null) => Boolean(slotKey && headerByKey.get(slotKey)?.terminalState === 'COMPLETED')
  const completedItem = (item: any) => {
    // Optional non-context modules are intentionally not materialized as
    // active slots. Preserve the legacy completion projection for them while
    // deriving every required unit exclusively from snapshot headers.
    if (!item.required && !item.contextKey) return true
    return completedSlot(slotKeyForItem(item))
  }
  const sections = (attempt.compositeAssessment.formSections ?? []).slice().sort((left: any, right: any) => left.position - right.position)
  const units = [
    ...attempt.compositeAssessment.items
      .filter((item: any) => item.type !== 'FORM' && item.required)
      .map((item: any) => ({ id: item.id, type: item.type, position: item.position, required: item.required, item })),
    ...sections.map((section: any) => ({ id: section.id, type: 'FORM_SECTION', position: section.position, required: true, section })),
  ].sort((left: any, right: any) => {
    const key=(unit:any)=>unit.type==='FORM_SECTION'?formSectionSlotKey(unit.id):compositeItemSlotKey(unit.id,unit.type)
    const l=slotsByKey.get(key(left))?.sourceBinding.educationOrder,r=slotsByKey.get(key(right))?.sourceBinding.educationOrder
    return typeof l==='number'&&typeof r==='number'?l-r:left.position-right.position||left.id.localeCompare(right.id)
  })
  const unitCompleted = (unit: any) => unit.type === 'FORM_SECTION'
    ? completedSlot(formSectionSlotKey(unit.id))
    : completedItem(unit.item)
  const completedItems = units.filter(unitCompleted).length
  const currentIndex = units.findIndex((unit: any) => !unitCompleted(unit))
  const effectiveCurrentIndex = currentIndex < 0 ? units.length : currentIndex
  const currentUnit = currentIndex >= 0 ? units[currentIndex] : null
  const packageSlotLabels = getFrozenPackageSlotLabels(attempt.compositeAssessment)

  // The current-unit runner reads only currentItem plus progress summaries.
  // Keep the default DTO intact for legacy clients and bulk-section consumers.
  const deliveredSections = view === 'current-unit'
    ? sections.filter((section: any) => currentUnit?.type === 'FORM_SECTION' && section.id === currentUnit.id)
    : sections
  const formSections = deliveredSections.map((section: any) => {
    const sectionDefinition = compositeFormSectionRuntimeDefinition(section)
    const slot = slotsByKey.get(formSectionSlotKey(section.id))
    const sectionCompleted = completedSlot(formSectionSlotKey(section.id))
    const answers = section.items.map((item: any) => ({
      id: item.id,
      formItemId: item.id,
      type: item.formType,
      label: packageSlotLabels.get(item.position) ?? item.formLabel,
      placeholder: item.formPlaceholder,
      options: item.formOptions,
      ...(item.formDefinition != null ? { formDefinition: publicTrainingFormDefinition(item.formDefinition) } : {}),
      ...(item.formPolicy != null ? { formPolicy: item.formPolicy } : {}),
      required: item.required !== false,
      contextKey: item.contextKey ?? null,
      value: null,
    }))
    return {
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: compositeSectionHasContext(section),
      definitionHash: slot?.sourceDefinitionIdentity.hash ?? formSectionIdentityHash(sectionDefinition),
      status: sectionCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      submittedAt: null,
      items: answers,
      answers,
    }
  })

  let currentItem: any = null
  if (currentUnit?.type === 'FORM_SECTION') {
    const section = formSections.find((candidate: any) => candidate.id === currentUnit.id)
    if (section) {
      await ensureCompositeFormAdmissionAtDelivery(attempt.id, compositeFormSectionRuntimeDefinition(currentUnit.section), attempt)
      currentItem = {
        id: section.id,
        type: 'FORM_SECTION',
        position: section.position,
        required: true,
        formSectionId: section.id,
        title: section.title,
        description: section.description,
        contextSection: section.contextSection,
        definitionHash: section.definitionHash,
        status: section.status,
        answers: section.items,
      }
    }
  } else if (currentUnit?.type === 'SCALE') {
    const item = currentUnit.item
    const summary = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === item.id)
    const slot = slotsByKey.get(compositeItemSlotKey(item.id, 'SCALE'))
    if (!summary?.id || !slot) throw compositeConflict('量表冻结运行时不可用，请重启测评')
    // Lazy current-unit: only the unfinished Scale loads its frozen runtime
    // and admission fields. The parent projection carries only cheap child
    // summaries, so the current unit does exactly one authoritative child read
    // which is then shared by runtime validation and admission.
    const child = await prisma.assessment.findUnique({
      where: { id: summary.id },
      select: { ...UNIFIED_SCALE_CHILD_ADMISSION_SELECT, compositeAttempt: false },
    })
    if (!child || !child.runtimeSnapshotEncrypted) throw compositeConflict('量表冻结运行时不可用，请重启测评')
    try {
      const runtime = (await loadScaleAdmissionRuntime(child))
      if (
        runtime.instrumentKey !== item.scale?.code
        || runtime.instrumentVersion !== item.scale?.instrumentVersion
        || runtime.sourceDefinitionHash !== slot.sourceDefinitionIdentity.hash
        || runtime.compiledRuntime.compiledRuntimeHash !== child.compiledRuntimeHash
      ) throw new Error('Scale runtime identity mismatch')
      const admission=await ensureScaleAdmissionAtDelivery(child.id, attempt, child)
      currentItem = {
        id: item.id,
        type: 'SCALE',
        position: item.position,
        required: item.required,
        scaleAssessmentId: child.id,
        ...(admission.trainingTiming ? {trainingTiming:admission.trainingTiming} : {}),
        definitionHash: runtime.legacyDefinitionHash,
        presentationMode: runtime.measurementPresentation?.presentationMode ?? 'ONE_BY_ONE',
        answers: [],
        scale: {
          id: item.scale.id,
          name: packageSlotLabels.get(item.position) ?? item.scale.name,
          instruction: runtime.instruction !== undefined ? runtime.instruction?.text ?? null : item.scale.instruction ?? null,
          description: item.scale.description ?? null,
          instrumentVersion: item.scale.instrumentVersion,
          definition: runnerDefinition(runtime.definition),
        },
      }
    } catch (error) {
      if (isInstrumentFinalSubmitError(error)) throw error
      throw compositeConflict('量表冻结运行时不可用，请重启测评')
    }
  } else if (currentUnit?.type === 'COGNITIVE') {
    const summary = attempt.cognitiveSessions.find((candidate: any) => candidate.compositeItemId === currentUnit.item.id)
    const slot = slotsByKey.get(compositeItemSlotKey(currentUnit.item.id, 'COGNITIVE'))
    if (!summary || !slot) throw compositeConflict('认知任务冻结运行时不可用，请重启测评')
    // Lazy current-unit: only the unfinished Cognitive session loads its full
    // row. The parent projection carries only cheap child summaries, so the
    // current unit does exactly one authoritative child read which is then
    // shared by runtime validation and admission.
    const child = await prisma.cognitiveSession.findUnique({
      where: { id: summary.id },
      select: { ...UNIFIED_COGNITIVE_CHILD_ADMISSION_SELECT, compositeAttempt: false },
    })
    if (!child || child.runtimeGeneration !== 'UNIFIED_V1' || child.compiledRuntimeHash !== (slot.sourceBinding as Record<string, unknown>).compiledRuntimeHash) {
      throw compositeConflict('认知任务冻结运行时不可用，请重启测评')
    }
    try {
      const admission = await ensureCognitiveAdmissionAtDelivery(child.id, attempt, child)
      currentItem = {
        id: currentUnit.item.id,
        type: 'COGNITIVE',
        position: currentUnit.item.position,
        required: currentUnit.item.required,
        cognitiveSession: await cognitiveRunnerPayload(child, attempt.contextSnapshotHash, attempt.status !== 'COMPLETED', attempt, admission),
      }
    } catch (error) {
      if (isInstrumentFinalSubmitError(error)) throw error
      throw compositeConflict('认知任务冻结运行时不可用，请重启测评')
    }
  } else if (currentUnit?.type === 'SITUATIONAL') {
    const summary = attempt.situationalAttempts.find((candidate: any) => candidate.compositeItemId === currentUnit.item.id)
    const slot = slotsByKey.get(compositeItemSlotKey(currentUnit.item.id, 'SITUATIONAL'))
    if (!summary || !slot || !slot.runtimeIdentity) throw compositeConflict('情境化测评冻结运行时不可用，请重启测评')
    try {
      const runtime = await loadEmbeddedSituationalAttemptRuntime(summary.id, {
        parent:attempt,
        compositeAttemptId: attempt.id,
        compositeItemId: currentUnit.item.id,
        compositeSlotKey: slot.slotKey,
        ...(context.userId ? { userId: context.userId } : { recoveryTokenHash: context.recoveryTokenHash }),
      })
      if (
        runtime.row.attemptEpoch !== attempt.attemptEpoch
        || runtime.snapshot.instrumentKey !== slot.runtimeIdentity.instrumentKey
        || runtime.snapshot.instrumentVersion !== slot.runtimeIdentity.instrumentVersion
        || runtime.snapshot.definitionHash !== slot.runtimeIdentity.definitionHash
        || runtime.snapshot.compiledRuntimeHash !== slot.runtimeIdentity.compiledRuntimeHash
        || runtime.snapshot.scorerKey !== slot.runtimeIdentity.scorerKey
        || runtime.snapshot.scoringVersion !== slot.runtimeIdentity.scoringVersion
        || runtime.snapshot.frozenAt !== slot.runtimeIdentity.frozenAt
      ) throw new Error('Situational runtime identity mismatch')
      const child = await projectSjtReleaseStatus(situationalAttemptForResponse(runtime.row, runtime.snapshot))
      currentItem = {
        id: currentUnit.item.id,
        type: 'SITUATIONAL',
        position: currentUnit.item.position,
        required: currentUnit.item.required,
        situationalAttemptId: runtime.row.id,
        situationalInstrumentKey: runtime.row.instrumentKey,
        situationalInstrumentVersion: runtime.row.instrumentVersion,
        definitionHash: runtime.row.definitionHash,
        compiledRuntimeHash: runtime.row.compiledRuntimeHash,
        status: runtime.row.status,
        instrument: child.instrument,
      }
    } catch (error) {
      if (isInstrumentFinalSubmitError(error)) throw error
      throw compositeConflict('情境化测评冻结运行时不可用，请重启测评')
    }
  }

  if(currentItem&&currentUnit){
    const key=currentUnit.type==='FORM_SECTION'?formSectionSlotKey(currentUnit.id):compositeItemSlotKey(currentUnit.id,currentUnit.type)
    const instruction=frozenEducationBlockInstruction(frozenSlotSet.slots,key)
    if(instruction)currentItem.questionnaireInstruction=instruction
  }
  const definitionHash = computeSubmissionPayloadHash({
    assessmentId: attempt.compositeAssessment.id,
    items: attempt.compositeAssessment.items.map((item: any) => ({ id: item.id, type: item.type, position: item.position, formSectionId: item.formSectionId ?? null })),
    formSections: sections.map((section: any) => ({ id: section.id, position: section.position, itemIds: section.items.map((item: any) => item.id) })),
  })
  return {
    id: attempt.id,
    ...(trainingPersistenceMetadata(attempt) ? { trainingPersistence: trainingPersistenceMetadata(attempt), checkpointDefinitionHash: attempt.frozenActiveSlotSetHash } : {}),
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    ...(attempt.compositeAssessment.productKind === 'QUESTIONNAIRE' ? { productKind: 'QUESTIONNAIRE' as const, reportMode: 'COLLECTION_ONLY' as const } : {}),
    instruction: attempt.compositeAssessment.instruction,
    status: attempt.status,
    ...(attempt.trainingFlowScope?{trainingFlow:{materials:attempt.trainingFlowScope.path.materials,termination:attempt.trainingFlowScope.path.termination,currentInstrumentKey:attempt.trainingFlowScope.path.currentInstrumentKey,pathHash:attempt.trainingFlowScope.pathHash}}:{}),
    taskSatisfaction: attempt.taskSatisfaction ?? null,
    taskSatisfied: isTaskSatisfied(attempt),
    deliveryMode: attempt.deliveryMode,
    attemptEpoch: attempt.attemptEpoch,
    definitionHash,
    contextSnapshotHash: attempt.contextSnapshotHash ?? null,
    progress: attempt.status === 'COMPLETED' ? 100 : completeness.progress,
    completedItems,
    totalItems: units.length,
    currentIndex: attempt.status === 'COMPLETED' ? units.length : effectiveCurrentIndex,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    anonymousCode: attempt.anonymousCode,
    context: {
      status: attempt.contextSnapshotEncrypted && attempt.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
      frozenAt: attempt.contextFrozenAt?.toISOString?.() ?? null,
      snapshotHash: attempt.contextSnapshotHash ?? null,
    },
    items: attempt.compositeAssessment.items.map((item: any, index: number) => ({
      id: item.id,
      type: item.type,
      position: item.position,
      label: resolveCompositeItemLabel(item, packageSlotLabels),
      completed: completedItem(item),
      index,
    })),
    units: units.map((unit: any, index: number) => ({
      id: unit.id,
      type: unit.type,
      position: unit.position,
      required: unit.required,
      label: unit.type === 'FORM_SECTION' ? unit.section.title : resolveCompositeItemLabel(unit.item, packageSlotLabels),
      completed: unitCompleted(unit),
      index,
      ...(unit.type === 'FORM_SECTION' ? { formSectionId: unit.id } : { itemId: unit.id }),
    })),
    ...(view === 'full' ? { formSections } : {}),
    currentItem,
  }
}

const markCompositeItemCompleted = async (tx: Db, attemptId: string, increment: boolean) => {
  const current = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { status: true, completedItems: true, compositeAssessmentId: true },
  })
  if (!current || current.status !== 'IN_PROGRESS') return false
  const totalItems = await tx.compositeAssessmentItem.count({ where: { compositeAssessmentId: current.compositeAssessmentId } })
  const completedItems = increment
    ? Math.min(totalItems, current.completedItems + 1)
    : current.completedItems
  if (increment) {
    await tx.compositeAssessmentAttempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: {
        completedItems,
        progress: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100,
        lastSavedAt: new Date(),
      },
    })
  }
  return totalItems > 0 && completedItems >= totalItems
}

/**
 * Parent Attempt finalization and reanalysis are serialized on the Attempt
 * row. Child modules commit their own frozen result rows first; this check
 * only promotes the parent after it sees those committed rows. Package
 * analysis and its immutable snapshot are written before the parent status
 * changes, so any analysis/encryption/DB failure rolls completion back as one
 * transaction.
 */
const finalizeCompositeAttemptLegacyIfReady = async (attemptId: string) => withQuestionnaireCompletionTransaction(async (tx) => {
  await lockCompositeAttempt(tx, attemptId)
  const attempt = await loadAttemptForFinalization(tx, attemptId)
  const maps = attemptCompletedItemMaps(attempt)
  const completedItems = countAttemptCompletedItems(attempt, maps)
  const totalItems = attempt.deliveryMode === 'FINAL_ONLY'
    ? attempt.compositeAssessment.items.filter((item: any) => item.type !== 'FORM').length
      + (attempt.compositeAssessment.formSections ?? []).length
    : attempt.compositeAssessment.items.length
  const progress = totalItems ? Math.round((completedItems / totalItems) * 100) : 100
  const shouldComplete = totalItems > 0 && completedItems === totalItems

  if (attempt.status === 'COMPLETED') {
    return {
      status: attempt.status,
    ...(attempt.trainingFlowScope?{trainingFlow:{materials:attempt.trainingFlowScope.path.materials,termination:attempt.trainingFlowScope.path.termination,currentInstrumentKey:attempt.trainingFlowScope.path.currentInstrumentKey,pathHash:attempt.trainingFlowScope.pathHash}}:{}),
    taskSatisfaction: attempt.taskSatisfaction ?? null,
    taskSatisfied: isTaskSatisfied(attempt),
      progress: attempt.progress,
      completedAt: attempt.completedAt,
    }
  }

  if (shouldComplete && attempt.status === 'IN_PROGRESS') {
    const packageAnalysis = await loadPackageAnalysisForAttempt(attempt, tx)
    if (packageAnalysis) {
      const persisted = await persistOrGetPackageAnalysisSnapshot(tx, {
        attemptId: attempt.id,
        analysis: packageAnalysis.analysis,
        inputFingerprint: packageAnalysis.inputFingerprint,
        generationReason: 'COMPLETION',
      })
      if (!persisted.created && persisted.row.generationReason !== 'COMPLETION') {
        throw new Error('综合测评完成时的分析快照已被其他生成原因占用')
      }
    }

    const completedAt = new Date()
    await tx.compositeAssessmentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        completedItems,
        completedAt,
        totalTime: completedAt.getTime() - attempt.startedAt.getTime(),
        lastSavedAt: completedAt,
      },
    })
    return { status: 'COMPLETED', progress: 100, completedAt }
  }

  if (attempt.status === 'IN_PROGRESS') {
    // Never let a stale GET lower progress or completedItems observed by a newer request.
    await tx.compositeAssessmentAttempt.updateMany({
      where: {
        id: attempt.id,
        status: 'IN_PROGRESS',
        completedItems: { lte: completedItems },
      },
      data: { progress, completedItems, lastSavedAt: new Date() },
    })
  }

  const latest = await tx.compositeAssessmentAttempt.findUnique({
    where: { id: attempt.id },
    select: { status: true, progress: true, completedAt: true },
  })
  if (!latest) throw compositeNotFound('综合测评记录不存在')
  return latest
})

type CompositeCompletionCandidate = {
  id: string
  status: string
  deliveryMode: string
  progress: number
  completedItems: number
  attemptEpoch: number
  startedAt: Date
  completedAt: Date | null
  contextSnapshotHash: string | null
  compositeAssessment: {
    items: Array<{ id: string; type: string; required: boolean; contextKey: string | null }>
    formSections: Array<{ id: string }>
  }
  scaleAssessments: Array<{
    id: string
    compositeItemId: string | null
    status: string
    attemptEpoch: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
  cognitiveSessions: Array<{
    id: string
    compositeItemId: string | null
    status: string
    attemptNo: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
  formSectionAttempts: Array<{
    id: string
    sectionId: string
    status: string
    attemptEpoch: number
    submissionId: string | null
    submissionPayloadHash: string | null
  }>
}

const compositeCompletionCandidateSelect = {
  id: true,
  status: true,
  deliveryMode: true,
  progress: true,
  completedItems: true,
  attemptEpoch: true,
  startedAt: true,
  completedAt: true,
  contextSnapshotHash: true,
  compositeAssessment: {
    select: {
      items: { select: { id: true, type: true, required: true, contextKey: true } },
      formSections: { select: { id: true } },
    },
  },
  scaleAssessments: {
    select: { id: true, compositeItemId: true, status: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true },
  },
  cognitiveSessions: {
    select: { id: true, compositeItemId: true, status: true, attemptNo: true, submissionId: true, submissionPayloadHash: true },
  },
  formSectionAttempts: {
    select: { id: true, sectionId: true, status: true, attemptEpoch: true, submissionId: true, submissionPayloadHash: true },
  },
} as const

const loadCompositeCompletionCandidate = async (attemptId: string) => measureRequestPhase(
  'final_submit_db_query',
  () => prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: compositeCompletionCandidateSelect,
  }) as Promise<CompositeCompletionCandidate | null>,
)

const compositeCompletionCounts = (candidate: CompositeCompletionCandidate) => {
  const items = candidate.compositeAssessment.items.filter((item) => item.type !== 'FORM')
  const itemIds = new Set(items
    .map((item) => item.id))
  const completedItemIds = new Set([
    ...items
      .filter((item) => !item.required && !item.contextKey)
      .map((item) => item.id),
    ...candidate.scaleAssessments
      .filter((child) => itemIds.has(child.compositeItemId ?? '')
        && child.attemptEpoch === candidate.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.compositeItemId as string),
    ...candidate.cognitiveSessions
      .filter((child) => itemIds.has(child.compositeItemId ?? '')
        && child.attemptNo === candidate.attemptEpoch
        && child.status === 'COMPLETED')
      .map((child) => child.compositeItemId as string),
  ])
  const sectionIds = new Set(candidate.compositeAssessment.formSections.map((section) => section.id))
  const completedSectionIds = new Set(candidate.formSectionAttempts
    .filter((section) => sectionIds.has(section.sectionId)
      && section.attemptEpoch === candidate.attemptEpoch
      && section.status === 'COMPLETED')
    .map((section) => section.sectionId))
  const totalItems = itemIds.size + sectionIds.size
  const completedItems = completedItemIds.size + completedSectionIds.size
  const progress = totalItems === 0 ? 100 : Math.min(100, Math.round((completedItems / totalItems) * 100))
  return { totalItems, completedItems, progress, ready: totalItems > 0 && completedItems >= totalItems }
}

const compositeCompletionFingerprint = (
  candidate: CompositeCompletionCandidate,
  packageInputFingerprint: string | null = null,
): string => computeSubmissionPayloadHash({
  attemptEpoch: candidate.attemptEpoch,
  contextSnapshotHash: candidate.contextSnapshotHash,
  packageInputFingerprint,
  scales: candidate.scaleAssessments
    .filter((child) => child.attemptEpoch === candidate.attemptEpoch)
    .map((child) => ({
      id: child.id,
      compositeItemId: child.compositeItemId,
      attemptEpoch: child.attemptEpoch,
      status: child.status,
      submissionId: child.submissionId,
      submissionPayloadHash: child.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  cognitive: candidate.cognitiveSessions
    .filter((child) => child.attemptNo === candidate.attemptEpoch)
    .map((child) => ({
      id: child.id,
      compositeItemId: child.compositeItemId,
      attemptNo: child.attemptNo,
      status: child.status,
      submissionId: child.submissionId,
      submissionPayloadHash: child.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
  formSections: candidate.formSectionAttempts
    .filter((section) => section.attemptEpoch === candidate.attemptEpoch)
    .map((section) => ({
      id: section.id,
      sectionId: section.sectionId,
      attemptEpoch: section.attemptEpoch,
      status: section.status,
      submissionId: section.submissionId,
      submissionPayloadHash: section.submissionPayloadHash,
    }))
    .sort((left, right) => left.id.localeCompare(right.id)),
})

const finalOnlyRetryBackoff = async (retry: number): Promise<void> => {
  const delayMs = Math.min(25, 5 * (2 ** retry))
  await measureRequestPhase('final_submit_retry_backoff', () => new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs)
  }))
}

const finalizeCompositeAttemptFinalOnlyIfReady = async (attemptId: string) => {
  for (let retry = 0; retry < 3; retry += 1) {
    const candidate = await loadCompositeCompletionCandidate(attemptId)
    if (!candidate) throw compositeNotFound('综合测评记录不存在')
    if (candidate.status === 'COMPLETED' || candidate.status !== 'IN_PROGRESS') {
      return { status: candidate.status, progress: candidate.progress, completedAt: candidate.completedAt }
    }

    const counts = compositeCompletionCounts(candidate)
    if (!counts.ready) {
      const progressResult = await withFinalOnlyCompletionTransaction(async (tx) => {
        await measureRequestPhase('final_submit_row_lock_wait', () => lockCompositeAttempt(tx, attemptId))
        const current = await tx.compositeAssessmentAttempt.findUnique({
          where: { id: attemptId },
          select: compositeCompletionCandidateSelect,
        }) as CompositeCompletionCandidate | null
        if (!current) throw compositeNotFound('综合测评记录不存在')
        if (current.status !== 'IN_PROGRESS') return { status: current.status, progress: current.progress, completedAt: current.completedAt }
        const currentCounts = compositeCompletionCounts(current)
        if (currentCounts.ready) return { needsPreparation: true as const }
        await tx.compositeAssessmentAttempt.update({
          where: { id: attemptId },
          data: { completedItems: currentCounts.completedItems, progress: currentCounts.progress, lastSavedAt: new Date() },
        })
        return { status: 'IN_PROGRESS', progress: currentCounts.progress, completedAt: null }
      })
      if (progressResult && 'needsPreparation' in progressResult) {
        if (retry < 2) await finalOnlyRetryBackoff(retry)
        continue
      }
      return progressResult
    }

    // Package analysis and encryption are CPU/crypto work and must not run
    // while the parent row is locked.
    const fullAttempt = await measureRequestPhase('final_submit_db_query', () => loadAttemptForFinalization(prisma, attemptId))
    const packageAnalysis = await measureRequestPhase(
      'final_submit_serialization',
      () => loadPackageAnalysisForAttempt(fullAttempt),
    )
    const payloadEncrypted = packageAnalysis
      ? await measureRequestPhase('final_submit_encryption', async () => encryptCognitivePayload(packageAnalysis.analysis))
      : undefined
    const expectedFingerprint = measureRequestPhaseSync(
      'final_submit_payload_hash',
      () => compositeCompletionFingerprint(candidate, packageAnalysis?.inputFingerprint ?? null),
    )

    const completionResult = await withFinalOnlyCompletionTransaction(async (tx) => {
      await measureRequestPhase('final_submit_row_lock_wait', () => lockCompositeAttempt(tx, attemptId))
      const current = await tx.compositeAssessmentAttempt.findUnique({
        where: { id: attemptId },
        select: compositeCompletionCandidateSelect,
      }) as CompositeCompletionCandidate | null
      if (!current) throw compositeNotFound('综合测评记录不存在')
      if (current.status === 'COMPLETED' || current.status !== 'IN_PROGRESS') {
        return { status: current.status, progress: current.progress, completedAt: current.completedAt }
      }
      const currentFingerprint = measureRequestPhaseSync(
        'final_submit_payload_hash',
        () => compositeCompletionFingerprint(current, packageAnalysis?.inputFingerprint ?? null),
      )
      if (currentFingerprint !== expectedFingerprint) {
        return { retry: true as const }
      }
      const currentCounts = compositeCompletionCounts(current)
      if (!currentCounts.ready) {
        await tx.compositeAssessmentAttempt.update({
          where: { id: attemptId },
          data: { completedItems: currentCounts.completedItems, progress: currentCounts.progress, lastSavedAt: new Date() },
        })
        return { status: 'IN_PROGRESS', progress: currentCounts.progress, completedAt: null }
      }
      if (packageAnalysis) {
        const persisted = await persistOrGetPackageAnalysisSnapshot(tx, {
          attemptId,
          analysis: packageAnalysis.analysis,
          inputFingerprint: packageAnalysis.inputFingerprint,
          generationReason: 'COMPLETION',
          payloadEncrypted,
        })
        if (!persisted.created && persisted.row.generationReason !== 'COMPLETION') {
          throw new Error('综合测评完成时的分析快照已被其他生成原因占用')
        }
      }
      const completedAt = new Date()
      await tx.compositeAssessmentAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'COMPLETED',
          progress: 100,
          completedItems: currentCounts.completedItems,
          completedAt,
          totalTime: Math.max(0, completedAt.getTime() - new Date(current.startedAt).getTime()),
          lastSavedAt: completedAt,
        },
      })
      return { status: 'COMPLETED', progress: 100, completedAt }
    })
    if (completionResult && 'retry' in completionResult) {
      if (retry < 2) await finalOnlyRetryBackoff(retry)
      continue
    }
    return completionResult
  }

  const latest = await loadCompositeCompletionCandidate(attemptId)
  if (!latest) throw compositeNotFound('综合测评记录不存在')
  return { status: latest.status, progress: latest.progress, completedAt: latest.completedAt }
}

export const finalizeCompositeAttemptIfReady = async (attemptId: string, options: {
  reportJob?: ReportJobIdentity
  preloadedParent?: any
  committedGraph?: any
} = {}): Promise<{ status: string; progress: number; completedAt: Date | null;
  aggregateInputHash?: string; totalTime?: number } | null | undefined> => {
  const route = options.preloadedParent ?? await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { ...REPORT_PARENT_SELECT, startedAt: true, completedItems: true,
      trainingTimingSnapshot: true,
  frozenActiveSlotSetEncrypted: true, contextSnapshotEncrypted: true, compiledBundleRuntimeHash: true },
  })
  if (route && options.reportJob) assertReportJobIdentity(route, options.reportJob)
  // Already enrolled attempts stay asynchronous while new enrollment is off.
  // Their canonical snapshot transaction is the ONLY producer of report jobs.
  if (route && route.asyncReportEpoch === route.attemptEpoch && !options.reportJob) {
    return { status: route.status, progress: route.progress, completedAt: route.completedAt }
  }
  let result
  if (route?.runtimeGeneration === 'UNIFIED_V1') {
    const { finalizeCompositeAttemptUnifiedIfReady } = await import('../assessment-runtime/unified-aggregate-finalizer.service')
    result = await finalizeCompositeAttemptUnifiedIfReady(attemptId, route, options.reportJob, options.committedGraph)
  } else if (!route || route.deliveryMode !== 'FINAL_ONLY') {
    result = await finalizeCompositeAttemptLegacyIfReady(attemptId)
  } else {
    result = await finalizeCompositeAttemptFinalOnlyIfReady(attemptId)
  }
  if (result?.status === 'COMPLETED' && ((route?.status !== 'COMPLETED' && route?.compositeAssessment?.productKind === 'ASSESSMENT_BUNDLE') || (route?.compositeAssessment?.productKind === 'ORGANIZATION_RESOURCE' && route.compiledBundleRuntimeHash!==null))) {
    await (await import('../bundle-product/analysis')).processInitial(attemptId)
  }
  // The canonical runtime commits first. Reconcile outside its transaction to
  // preserve the Run -> runtime lock order. Repeated FINAL/GET repairs any lag.
  if (result?.status === 'COMPLETED' && route?.assignmentRef) {
    const { reconcileRelationalCompositeCompletion } = await import('../assessment-relational/runtime-completion')
    await reconcileRelationalCompositeCompletion(attemptId)
  }
  return result
}


const patchCompositeStateAfterFinalize = (
  state: Awaited<ReturnType<typeof getUnifiedCompositeAttemptState>>,
  finalized: { status: string; progress: number; completedAt: Date | string | null },
) => {
  // Only promote runner 终态 fields when finalize actually completed.
  if (finalized.status !== 'COMPLETED') {
    return {
      ...state,
      status: finalized.status,
      progress: finalized.progress,
      completedAt: finalized.completedAt,
    }
  }
  return {
    ...state,
    status: finalized.status,
    progress: 100,
    completedAt: finalized.completedAt,
    currentIndex: state.totalItems,
    currentItem: null,
    completedItems: state.totalItems,
  }
}

export const getAttemptState = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }, requestedUnit?: {itemId?:string;sectionId?:string}, view: CompositeAttemptStateView = 'full') => {
  // Load-once: the parent row is read exactly once with the full unified
  // select and shared by the unified state projection and the
  // ensure*AtDelivery steps. The legacy path (rare, pre-UNIFIED_V1 attempts)
  // re-reads through findAttempt below.
  let runtime = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: UNIFIED_ATTEMPT_STATE_PARENT_SELECT,
  }) as any
  if (!runtime) throw compositeNotFound('综合测评记录不存在')
  if (runtime.runtimeGeneration === 'UNIFIED_V1') {
    if(trainingFlowMarkerState(runtime)==='FLOW'){
      await ensureTrainingFlowCurrentChild(attemptId,context)
      runtime=await prisma.compositeAssessmentAttempt.findUnique({where:{id:attemptId},select:UNIFIED_ATTEMPT_STATE_PARENT_SELECT})
    }
    if(requestedUnit){
      const authorized=context.userId?runtime.userId===context.userId:Boolean(context.recoveryTokenHash&&runtime.userId===null&&runtime.recoveryTokenHash===context.recoveryTokenHash)
      if(!authorized)throw compositeForbidden('无权限查看此综合测评记录')
      const scope=await resolveTrainingAttemptScope(runtime)
      if((requestedUnit.itemId&&!scope.itemIds.has(requestedUnit.itemId))||(requestedUnit.sectionId&&!scope.sectionIds.has(requestedUnit.sectionId)))throw compositeForbidden('此内容未分配给当前作答')
    }
    const state = await getUnifiedCompositeAttemptState(runtime, context, view)
    // An authorized reread repairs a completion projection that failed after
    // canonical FINAL committed, without creating or resubmitting an attempt.
    if (state.status === 'COMPLETED' && runtime.assignmentRef) {
      const { reconcileRelationalCompositeCompletion } = await import('../assessment-relational/runtime-completion')
      await reconcileRelationalCompositeCompletion(attemptId)
    }
    if (state.status === 'IN_PROGRESS' && ((state as any).trainingFlow?.termination && (state as any).trainingFlow.termination!=='PENDING' || state.totalItems > 0 && state.completedItems >= state.totalItems)) {
      // Reconcile-once: patch parent completion fields onto the first projection.
      if (runtime.asyncReportEpoch === runtime.attemptEpoch) {
        const job = await readCompositeReportJobHeader(attemptId, runtime.attemptEpoch)
        return { ...state, allUnitsSubmitted: true, reportStatus: compositeReportJobState(job) }
      }
      const finalized = await finalizeCompositeAttemptIfReady(attemptId, { preloadedParent: runtime })
      if (!finalized) return state
      return patchCompositeStateAfterFinalize(state, finalized)
    }
    return state
  }

  const attempt = await findAttempt(attemptId, context)
  if (attempt.runtimeGeneration === 'UNIFIED_V1') return getUnifiedCompositeAttemptState(attempt, context)
  const readableFormAnswers = readContextFormAnswers(
    attempt.compositeAssessment.items
      .filter((item: any) => item.type === 'FORM')
      .map((item: any) => ({ id: item.id, contextKey: item.contextKey })),
    attempt.formAnswers,
  )
  const readableAttempt = { ...attempt, formAnswers: readableFormAnswers }
  const maps = attemptCompletedItemMaps(readableAttempt)
  const { scaleMap, cognitiveMap, formMap, sectionMap } = maps
  const finalOnly = attempt.deliveryMode === 'FINAL_ONLY'
  const completed = (item: any) => isAttemptItemCompleted(item, maps, finalOnly)
  const completedItems = countAttemptCompletedItems(attempt, maps)
  const sections = (attempt.compositeAssessment.formSections ?? []).slice().sort((left: any, right: any) => left.position - right.position)
  const units = finalOnly
    ? [
        ...attempt.compositeAssessment.items
          .filter((item: any) => item.type !== 'FORM')
          .map((item: any) => ({ id: item.id, type: item.type, position: item.position, required: item.required, item })),
        ...sections.map((section: any) => ({ id: section.id, type: 'FORM_SECTION', position: section.position, required: true, section })),
      ].sort((left: any, right: any) => left.position - right.position)
    : attempt.compositeAssessment.items.map((item: any) => ({ id: item.id, type: item.type, position: item.position, required: item.required, item }))
  const currentIndex = units.findIndex((unit: any) => unit.type === 'FORM_SECTION'
    ? sectionMap.get(unit.id)?.status !== 'COMPLETED'
    : !completed(unit.item))
  const currentUnit = currentIndex >= 0 ? units[currentIndex] : null
  const current = currentUnit?.item ?? null
  const packageSlotLabels = getFrozenPackageSlotLabels(attempt.compositeAssessment)
  let currentItem: any = null
  if (currentUnit?.type === 'FORM_SECTION') {
    const section = currentUnit.section
    const sectionAnswers = section.items.map((item: any) => ({
      id: item.id,
      formItemId: item.id,
      type: item.formType,
      label: packageSlotLabels.get(item.position) ?? item.formLabel,
      placeholder: item.formPlaceholder,
      options: item.formOptions,
      ...(item.formDefinition != null ? { formDefinition: publicTrainingFormDefinition(item.formDefinition) } : {}),
      ...(item.formPolicy != null ? { formPolicy: item.formPolicy } : {}),
      required: item.required,
      contextKey: item.contextKey ?? null,
      value: formMap.get(item.id)?.value ?? null,
    }))
    currentItem = {
      id: section.id,
      type: 'FORM_SECTION',
      position: section.position,
      required: true,
      formSectionId: section.id,
      title: section.title,
      description: section.description ?? null,
      contextSection: compositeSectionHasContext(section),
      definitionHash: finalOnly && attempt.runtimeGeneration === 'UNIFIED_V1'
        ? formSectionIdentityHash(compositeFormSectionRuntimeDefinition(section))
        : computeSubmissionPayloadHash({
            sectionId: section.id,
            title: section.title,
            description: section.description ?? null,
            position: section.position,
            contextSection: compositeSectionHasContext(section),
            items: section.items.map((item: any) => ({
              id: item.id,
              formType: item.formType,
              formLabel: item.formLabel,
              placeholder: item.formPlaceholder ?? null,
              required: item.required !== false,
              formOptions: item.formOptions,
              ...(item.formDefinition != null ? { formDefinition: item.formDefinition } : {}),
      ...(item.formPolicy != null ? { formPolicy: item.formPolicy } : {}),
              contextKey: item.contextKey ?? null,
              position: item.position,
              formSectionPosition: item.formSectionPosition ?? null,
            })),
          }),
      status: sectionMap.get(section.id)?.status ?? 'IN_PROGRESS',
      answers: sectionAnswers,
    }
  } else if (current?.type === 'FORM') {
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, form: { type: current.formType, label: packageSlotLabels.get(current.position) ?? current.formLabel, placeholder: current.formPlaceholder, options: current.formOptions, contextKey: current.contextKey ?? null }, value: formMap.get(current.id)?.value ?? null }
  } else if (current?.type === 'SCALE') {
    const assessment = scaleMap.get(current.id)
    const scale = current.scale
      ? { ...current.scale, name: packageSlotLabels.get(current.position) ?? current.scale.name }
      : current.scale
    let runnerScale = scale
    let definitionHash: string | undefined
    let presentationMode: 'ONE_BY_ONE' | 'ALL_AT_ONCE' = 'ONE_BY_ONE'
    if (scale) {
      try {
        const frozen = assessment?.runtimeSnapshotEncrypted
          ? await loadFrozenScaleRuntimeSnapshot(assessment.runtimeSnapshotEncrypted) : null
        definitionHash = frozen?.legacyDefinitionHash ?? hashScaleDefinition(scaleDefinitionFromRecord(scale))
        presentationMode = frozen?.measurementPresentation?.presentationMode ?? 'ONE_BY_ONE'
        const { definition: _definition, ...metadata } = scale
        runnerScale = { ...metadata, definition: frozen ? runnerDefinition(frozen.definition) : scaleRunnerFromRecord(scale) }
      } catch {
        const { definition: _definition, ...metadata } = scale
        runnerScale = { ...metadata, definition: null, definitionError: true }
      }
    }
    const decodedAnswers = (await loadScaleAnswers(assessment?.answers, assessment))
    currentItem = {
      id: current.id,
      type: current.type,
      position: current.position,
      required: current.required,
      scaleAssessmentId: assessment?.id,
      presentationMode,
      scale: runnerScale,
      answers: decodedAnswers.answers,
      definitionHash,
      ...(decodedAnswers.deviceInputProvenance ? { deviceInputProvenance: decodedAnswers.deviceInputProvenance } : {}),
      ...(decodedAnswers.decryptError ? { decryptError: true } : {}),
    }
  } else if (current?.type === 'COGNITIVE') {
    const session = cognitiveMap.get(current.id)
    currentItem = { id: current.id, type: current.type, position: current.position, required: current.required, cognitiveSession: session ? await cognitiveRunnerPayload(session, attempt.contextSnapshotHash, attempt.status !== 'COMPLETED', attempt) : null }
  }
  return {
    id: attempt.id,
    ...(trainingPersistenceMetadata(attempt) ? { trainingPersistence: trainingPersistenceMetadata(attempt), checkpointDefinitionHash: attempt.frozenActiveSlotSetHash } : {}),
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    ...(attempt.compositeAssessment.productKind === 'QUESTIONNAIRE' ? { productKind: 'QUESTIONNAIRE' as const, reportMode: 'COLLECTION_ONLY' as const } : {}),
    instruction: attempt.compositeAssessment.instruction,
    status: attempt.status,
    ...(attempt.trainingFlowScope?{trainingFlow:{materials:attempt.trainingFlowScope.path.materials,termination:attempt.trainingFlowScope.path.termination,currentInstrumentKey:attempt.trainingFlowScope.path.currentInstrumentKey,pathHash:attempt.trainingFlowScope.pathHash}}:{}),
    taskSatisfaction: attempt.taskSatisfaction ?? null,
    taskSatisfied: isTaskSatisfied(attempt),
    deliveryMode: attempt.deliveryMode,
    attemptEpoch: attempt.attemptEpoch,
    definitionHash: computeSubmissionPayloadHash({
      assessmentId: attempt.compositeAssessment.id,
      items: attempt.compositeAssessment.items.map((item: any) => ({ id: item.id, type: item.type, position: item.position, formSectionId: item.formSectionId ?? null })),
      formSections: sections.map((section: any) => ({ id: section.id, position: section.position, itemIds: section.items.map((item: any) => item.id) })),
    }),
    contextSnapshotHash: attempt.contextSnapshotHash ?? null,
    progress: attempt.progress,
    completedItems,
    totalItems: units.length,
    currentIndex: currentIndex < 0 ? units.length : currentIndex,
    startedAt: attempt.startedAt,
    lastSavedAt: attempt.lastSavedAt,
    completedAt: attempt.completedAt,
    anonymousCode: attempt.anonymousCode,
    context: {
      status: attempt.contextSnapshotEncrypted && attempt.contextSnapshotHash ? 'frozen' as const : 'collecting' as const,
      frozenAt: attempt.contextFrozenAt?.toISOString?.() ?? null,
      snapshotHash: attempt.contextSnapshotHash ?? null,
    },
    items: attempt.compositeAssessment.items.map((item: any, index: number) => ({ id: item.id, type: item.type, position: item.position, label: resolveCompositeItemLabel(item, packageSlotLabels), completed: completed(item), index })),
    units: units.map((unit: any, index: number) => ({
      id: unit.id,
      type: unit.type,
      position: unit.position,
      required: unit.required,
      label: unit.type === 'FORM_SECTION' ? unit.section.title : resolveCompositeItemLabel(unit.item, packageSlotLabels),
      completed: unit.type === 'FORM_SECTION' ? sectionMap.get(unit.id)?.status === 'COMPLETED' : completed(unit.item),
      index,
      ...(unit.type === 'FORM_SECTION' ? { formSectionId: unit.id } : { itemId: unit.id }),
    })),
    formSections: sections.map((section: any) => ({
      id: section.id,
      title: section.title,
      description: section.description ?? null,
      position: section.position,
      contextSection: compositeSectionHasContext(section),
      definitionHash: finalOnly && attempt.runtimeGeneration === 'UNIFIED_V1'
        ? formSectionIdentityHash(compositeFormSectionRuntimeDefinition(section))
        : computeSubmissionPayloadHash({
            sectionId: section.id,
            title: section.title,
            description: section.description ?? null,
            position: section.position,
            contextSection: compositeSectionHasContext(section),
            items: section.items.map((item: any) => ({ id: item.id, formType: item.formType, formLabel: item.formLabel, placeholder: item.formPlaceholder ?? null, required: item.required !== false, formOptions: item.formOptions, contextKey: item.contextKey ?? null, position: item.position, formSectionPosition: item.formSectionPosition ?? null })),
          }),
      status: sectionMap.get(section.id)?.status ?? 'IN_PROGRESS',
      submittedAt: sectionMap.get(section.id)?.submittedAt ?? null,
      items: section.items.map((item: any) => ({
        id: item.id,
        type: item.formType,
        label: packageSlotLabels.get(item.position) ?? item.formLabel,
        placeholder: item.formPlaceholder,
        options: item.formOptions,
        ...(item.formDefinition != null ? { formDefinition: publicTrainingFormDefinition(item.formDefinition) } : {}),
      ...(item.formPolicy != null ? { formPolicy: item.formPolicy } : {}),
        required: item.required !== false,
        contextKey: item.contextKey ?? null,
        value: formMap.get(item.id)?.value ?? null,
      })),
    })),
    currentItem,
  }
}

const decodeJson = <T extends object>(value: unknown): T | null => {
  if (typeof value === 'string') return safeDecrypt<T>(value) ?? null
  return (value as T) ?? null
}

const getOwnedChild = async (attemptId: string, itemId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const attempt = await findAttempt(attemptId, context)
  const item = attempt.compositeAssessment.items.find((candidate: any) => candidate.id === itemId)
  if (!item) throw compositeNotFound('综合测评模块不存在')
  return { attempt, item }
}

const lockScaleAssessment = async (tx: Db, assessmentId: string) => {
  if (typeof tx?.$queryRaw !== 'function') throw compositeNotFound('量表测评记录不存在')
  const rows = await tx.$queryRaw<Array<{ status: string; answers: unknown }>>`
    SELECT "status", "answers"
    FROM "assessments"
    WHERE "id" = ${assessmentId}
    FOR UPDATE
  `
  const assessment = rows[0]
  if (!assessment) throw compositeNotFound('量表测评记录不存在')
  return assessment
}

export const saveAttempt = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
  draft?: { itemId: string; value: string },
) => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
  if (draft) {
    const item = attempt.compositeAssessment.items.find((candidate: any) => candidate.id === draft.itemId)
    if (!item || item.type !== 'FORM') throw compositeBadRequest('只能保存当前综合测评中的表单草稿')
    await prisma.$transaction(async (tx: Db) => {
      await lockCompositeAttempt(tx, attemptId)
      const current = await tx.compositeAssessmentAttempt.findUnique({
        where: { id: attemptId },
        select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
      })
      if (!current) throw compositeNotFound('综合测评记录不存在')
      if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
      if (item.contextKey) {
        try {
          assertContextMutable(Boolean(current.contextSnapshotEncrypted || current.contextSnapshotHash))
        } catch (error) {
          if (isAssessmentContextServiceError(error)) throw compositeConflict(error.message)
          throw error
        }
        const validationMessage = validateContextAnswer({
          id: item.id,
          type: item.formType,
          label: item.formLabel,
          required: item.required,
          position: item.position,
          contextKey: item.contextKey,
          options: item.formOptions,
        }, draft.value)
        if (validationMessage) throw compositeBadRequest(validationMessage)
      }
      const existing = await tx.compositeFormAnswer.findUnique({ where: { attemptId_itemId: { attemptId, itemId: draft.itemId } }, select: { completed: true } })
      if (!existing || existing.completed === false) {
        const storedValue = writeContextFormAnswer(item.contextKey, draft.value)
        await tx.compositeFormAnswer.upsert({
          where: { attemptId_itemId: { attemptId, itemId: draft.itemId } },
          create: { attemptId, itemId: draft.itemId, value: storedValue, completed: false },
          update: { value: storedValue, completed: false },
        })
      }
      await tx.compositeAssessmentAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: new Date() } })
    })
    return prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, select: { id: true, lastSavedAt: true, status: true, progress: true } })
  }
  return prisma.compositeAssessmentAttempt.update({ where: { id: attemptId }, data: { lastSavedAt: new Date() }, select: { id: true, lastSavedAt: true, status: true, progress: true } })
}

export const saveFormAnswer = async (attemptId: string, itemId: string, value: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (item.type !== 'FORM') throw compositeBadRequest('当前模块不是表单')
  const shouldFinalize = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
    if (item.contextKey) {
      try {
        assertContextMutable(Boolean(current.contextSnapshotEncrypted || current.contextSnapshotHash))
      } catch (error) {
        if (isAssessmentContextServiceError(error)) throw compositeConflict(error.message)
        throw error
      }
      const validationMessage = validateContextAnswer({
        id: item.id,
        type: item.formType,
        label: item.formLabel,
        required: item.required,
        position: item.position,
        contextKey: item.contextKey,
        options: item.formOptions,
      }, value)
      if (validationMessage) throw compositeBadRequest(validationMessage)
    }
    if (item.required && !value.trim()) throw compositeBadRequest('此表单项为必填项')
    if (item.formType === 'single_choice' || item.formType === 'multiple_choice') {
      const options = Array.isArray(item.formOptions) ? item.formOptions as Array<{ value: string }> : []
      const allowed = new Set(options.map((option) => option.value))
      const values = item.formType === 'multiple_choice' ? value.split(',').filter(Boolean) : (value ? [value] : [])
      if (values.some((candidate) => !allowed.has(candidate)) || new Set(values).size !== values.length) throw compositeBadRequest('表单选项无效')
    }
    const existing = await tx.compositeFormAnswer.findUnique({
      where: { attemptId_itemId: { attemptId, itemId } },
      select: { completed: true },
    })
    const storedValue = writeContextFormAnswer(item.contextKey, value)
    await tx.compositeFormAnswer.upsert({ where: { attemptId_itemId: { attemptId, itemId } }, create: { attemptId, itemId, value: storedValue, completed: true }, update: { value: storedValue, completed: true } })
    return markCompositeItemCompleted(tx, attemptId, !existing?.completed)
  })
  if (shouldFinalize) await finalizeCompositeAttemptIfReady(attempt.id)
  return { saved: true, finalized: shouldFinalize }
}

export const saveScaleAnswer = async (
  attemptId: string,
  itemId: string,
  input: { itemCode: string; responseValue: string | number; responseTimeMs?: number; deviceInputProvenance?: DeviceInputProvenanceV1 },
  context: { userId?: string; recoveryTokenHash?: string },
) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (attempt.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
  if (item.type !== 'SCALE') throw compositeBadRequest('当前模块不是量表')
  const assessment = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === itemId)
  if (!assessment || assessment.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
  let definition
  try {
    const scale = item.scale
    if (!scale?.definition) throw new Error('量表尚未安装 v2 definition')
    definition = scaleDefinitionFromRecord(scale)
    validateScaleAnswer(definition, {
      itemCode: input.itemCode,
      responseValue: input.responseValue,
      responseTimeMs: input.responseTimeMs,
    })
  } catch (error) {
    if (error instanceof ScaleAnswerValidationError) throw compositeBadRequest(error.issues[0]?.message || '量表答案无效')
    throw compositeBadRequest('量表尚未安装有效的 v2 definition')
  }
  await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const locked = await lockScaleAssessment(tx, assessment.id)
    if (locked.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
    if (!current.contextSnapshotEncrypted || !current.contextSnapshotHash) {
      await freezeCompositeAttemptContext(tx, attemptId)
    }
    const decoded = (await loadScaleAnswers(locked.answers, locked))
    if (decoded.decryptError) throw compositeBadRequest('量表答案无法读取，请联系管理员')
    const answers = decoded.answers
    const index = answers.findIndex((candidate) => candidate.itemCode === input.itemCode)
    const answer = {
      itemCode: input.itemCode,
      responseValue: input.responseValue,
      ...(input.responseTimeMs === undefined ? {} : { responseTimeMs: input.responseTimeMs }),
      answeredAt: new Date().toISOString(),
      changeCount: index >= 0 ? (answers[index].changeCount ?? 0) + 1 : 0,
    }
    if (index >= 0) answers[index] = { ...answers[index], ...answer }
    else answers.push(answer)
    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        answers: encryptScaleAnswers(answers, input.deviceInputProvenance ?? decoded.deviceInputProvenance),
        result: null,
        progress: Math.round((answers.length / Math.max(definition.items.length, 1)) * 100),
      },
    })
    await assertTrainingPrivateReferenceAdmissionCurrent(tx as Prisma.TransactionClient)
  })
  return { saved: true }
}

export const completeScale = async (attemptId: string, itemId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const { attempt, item } = await getOwnedChild(attemptId, itemId, context)
  if (item.type !== 'SCALE') throw compositeBadRequest('当前模块不是量表')
  const assessment = attempt.scaleAssessments.find((candidate: any) => candidate.compositeItemId === itemId)
  if (!assessment) throw compositeNotFound('量表测评记录不存在')
  const result = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const locked = await lockScaleAssessment(tx, assessment.id)
    if (locked.status === 'COMPLETED') {
      return { didComplete: false, shouldFinalize: await markCompositeItemCompleted(tx, attemptId, false) }
    }
    if (locked.status !== 'IN_PROGRESS') throw compositeBadRequest('量表模块已结束')
    if (!item.scale?.definition) throw compositeBadRequest('量表尚未安装有效的 v2 definition')
    const current = await tx.compositeAssessmentAttempt.findUnique({
      where: { id: attemptId },
      select: { status: true, contextSnapshotEncrypted: true, contextSnapshotHash: true },
    })
    if (!current) throw compositeNotFound('综合测评记录不存在')
    if (current.status !== 'IN_PROGRESS') throw compositeBadRequest('综合测评已结束')
    const contextSnapshot = current.contextSnapshotEncrypted && current.contextSnapshotHash
      ? readCompositeAttemptContext(current)
      : await freezeCompositeAttemptContext(tx, attemptId)
    if (('decryptError' in contextSnapshot && contextSnapshot.decryptError) || !contextSnapshot.context || !contextSnapshot.hash) {
      throw compositeBadRequest('人口学上下文无法读取，请联系管理员')
    }
    const decoded = (await loadScaleAnswers(locked.answers, locked))
    if (decoded.decryptError) throw compositeBadRequest('量表答案无法读取，请联系管理员')
    const answers = decoded.answers
    const definition = scaleDefinitionFromRecord(item.scale)
    const missingRequiredItems = missingRequiredScaleItemCodes(definition, answers)
    if (missingRequiredItems.length > 0) throw compositeBadRequest(`还有 ${missingRequiredItems.length} 道必答题未作答`)
    const result = await buildScaleResultForRecord({
      scale: item.scale,
      answers,
      participantContext: contextSnapshot.context.values,
      participantContextHash: contextSnapshot.hash,
    })
    const completedAt = new Date()
    await tx.assessment.update({
      where: { id: assessment.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        answers: encryptScaleAnswers(answers, decoded.deviceInputProvenance),
        result: encryptScaleResult(result),
        completedAt,
        totalTime: completedAt.getTime() - assessment.startedAt.getTime(),
      },
    })
    const shouldFinalize = await markCompositeItemCompleted(tx, attemptId, true)
    await assertTrainingPrivateReferenceAdmissionCurrent(tx as Prisma.TransactionClient)
    return { didComplete: true, shouldFinalize }
  })
  if (result.shouldFinalize) await finalizeCompositeAttemptIfReady(attempt.id)
  return { completed: true, finalized: result.shouldFinalize }
}

export const buildCompositeReport = async (attempt: any, verifiedContext?: WholeQuestionnaireReportContext, readBatch?: CompositeReportFactsReader) => {
  const batch = readBatch?.(attempt)
  attempt = await applyTrainingAttemptScope(attempt)
  const scaleFacts = batch ? undefined : await preloadStoredScaleResults(attempt.scaleAssessments)
  const scaleMap = new Map<string, any>(attempt.scaleAssessments.map((item: any) => [item.compositeItemId, item]))
  const cognitiveMap = new Map<string, any>(attempt.cognitiveSessions.map((item: any) => [item.compositeItemId, item]))
  const situationalMap = new Map<string, any>((attempt.situationalAttempts ?? []).map((item: any) => [item.compositeItemId, item]))
  const readableFormAnswers = readContextFormAnswers(
    attempt.compositeAssessment.items
      .filter((item: any) => item.type === 'FORM')
      .map((item: any) => ({ id: item.id, contextKey: item.contextKey })),
    attempt.formAnswers,
  )
  const formMap = new Map<string, any>(readableFormAnswers.map((item: any) => [item.itemId, item]))
  const typedFormStates = batch?.typedFormStates ?? new Map<string,{state:string;rowStates?:Record<string,string>;otherText?:string}>()
  const typedFormValues = batch?.typedFormValues ?? await loadCompositeTypedFormValues(attempt,typedFormStates)
  const unitReports: any[] = []
  const backgroundValues: any[] = []
  const packageSlotLabels = getFrozenPackageSlotLabels(attempt.compositeAssessment)
  const packageBased = Boolean(attempt.compositeAssessment.reportPackageKey)
  for (const item of attempt.compositeAssessment.items) {
    if (item.type === 'FORM') {
      backgroundValues.push({...buildFormBackgroundReport({ itemId: item.id, label: packageSlotLabels.get(item.position) ?? item.formLabel, value: typedFormValues.has(item.id) ? legacyFormValueProjection(typedFormValues.get(item.id) ?? null) : formMap.get(item.id)?.value ?? null, formType: item.formType, options: item.formOptions }), ...(typedFormStates.has(item.id)?typedFormStates.get(item.id):{}), ...(item.formDefinition!=null?typedFormPresentation(item,typedFormValues.get(item.id)??null):{})})
      continue
    }
    if (item.type === 'SCALE') {
      try {
        const result = scaleMap.get(item.id)
        const reportInput = {
          assessmentId: result?.id,
          itemId: item.id,
          scaleId: item.scaleId,
          scaleCode: item.scale?.code,
          scaleName: item.scale?.name || '未知量表',
          result: result?.result,
          completedAt: result?.completedAt,
          totalTime: result?.totalTime,
        }
        const report = batch && result && batch.scaleResults.has(result)
          ? buildScaleUnitReport({...reportInput, result: batch.scaleResults.get(result)})
          : buildScaleUnitReport({...reportInput,result:await resolveStoredScaleResult(reportInput.result,{record:result,reader:result?scaleFacts:undefined})})
        const libraryWrapper = Boolean(result?.scale?.libraryEntryId)
        if (libraryWrapper || ['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE'].includes(attempt.compositeAssessment.productKind)) {
          const entry = verifiedContext?.units.get(result?.id)
          const reusable = Boolean(verifiedContext && entry && result && verifiedContext.attemptId === attempt.id
            && verifiedContext.attemptEpoch === attempt.attemptEpoch
            && verifiedContext.slotSetHash === attempt.frozenActiveSlotSetHash
            && verifiedContext.contextHash === attempt.contextSnapshotHash
            && entry?.attemptEpoch === result?.attemptEpoch
            && entry.runtimeSnapshotEncrypted === result?.runtimeSnapshotEncrypted
            && entry.runtime.compiledRuntime.compiledRuntimeHash === result?.compiledRuntimeHash
            && entry.runtime.instrumentKey === result?.scale?.code
            && entry.runtime.instrumentVersion === result?.scale?.instrumentVersion)
          // Legacy composites can consume approved library wrappers too. Their
          // generated code is not a registry key: carry the actual child's
          // frozen disclosure instead of guessing a policy in the projector.
          let frozenRuntime = batch?.scaleRuntimes.get(result) ?? (reusable ? entry!.runtime : undefined)
          if (libraryWrapper) {
            if (!frozenRuntime && !batch && typeof result.runtimeSnapshotEncrypted === 'string') {
              frozenRuntime = await loadFrozenScaleRuntimeSnapshot(result.runtimeSnapshotEncrypted)
            }
            if (!frozenRuntime || result.scaleId !== item.scaleId
              || frozenRuntime.instrumentKey !== result.scale.code
              || frozenRuntime.instrumentVersion !== result.scale.instrumentVersion
              || frozenRuntime.compiledRuntime.compiledRuntimeHash !== result.compiledRuntimeHash
              || !result.scale.measurementReleaseId
              || frozenRuntime.measurementPresentation?.releaseId !== result.scale.measurementReleaseId) {
              throw new Error('Library report frozen identity unavailable')
            }
          }
          const policy = batch ? resolveProjectionPolicyForAssessment(result, report.result, frozenRuntime)
            : await loadProjectionPolicyForAssessment(result, report.result, frozenRuntime)
          Object.defineProperty(report, '__scaleProjectionPolicy', { value: policy.policy, enumerable: false })
        }
        if (report.decryptError) {
          logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
          unitReports.push(report)
          continue
        }
        unitReports.push(report)
        continue
      } catch {
        logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
        unitReports.push({
          itemId: item.id,
          type: 'SCALE' as const,
          kind: 'scale' as const,
          scaleId: item.scaleId,
          scaleCode: item.scale?.code ?? null,
          scaleName: item.scale?.name || '未知量表',
          result: null,
          quality: null,
          scores: [],
          references: [],
          interpretations: [],
          completedAt: null,
          totalTime: null,
          method: {
            scaleId: item.scaleId,
            instrumentVersion: item.scale?.instrumentVersion ?? '',
            scoringVersion: '',
            reportVersion: SCALE_REPORT_DEFINITION_VERSION,
            definitionHash: '',
            referenceVersions: [],
            assessmentContext: null,
          },
          caveats: [],
          disclaimer: SCALE_REPORT_DISCLAIMER,
          decryptError: true,
        })
        continue
      }
    }
    if (item.type === 'SITUATIONAL') {
      try {
        const child = situationalMap.get(item.id)
        const canonical = child?.canonicalResultEncrypted
          ? parseCanonicalUnitResultEnvelope(decryptUnifiedRuntimePayload<unknown>(child.canonicalResultEncrypted))
          : null
        const scientificContext = frozenSituationalScientificProjection(child?.runtimeSnapshotEncrypted ? decryptFrozenSituationalRuntimeSnapshot(child.runtimeSnapshotEncrypted).scientificContext : undefined)
        if (canonical && canonical.core.unitType !== 'SITUATIONAL') throw new Error('wrong situational canonical unit type')
        unitReports.push({
          itemId: item.id,
          type: 'SITUATIONAL' as const,
          kind: 'situational' as const,
          label: resolveCompositeItemLabel(item, packageSlotLabels),
          scienceMaturity: scientificContext.scientificMaturity,
          scientificContext,
          instrumentKey: canonical?.core.instrumentKey ?? child?.instrumentKey ?? item.situationalInstrumentKey ?? null,
          instrumentVersion: canonical?.core.instrumentVersion ?? child?.instrumentVersion ?? item.situationalInstrumentVersion ?? null,
          metrics: canonical?.core.metrics?.map((metric) => ({
            key: metric.key,
            value: metric.value,
            unit: metric.unit,
            quality: metric.quality,
          })) ?? [],
          quality: canonical?.core.quality ?? null,
          qualityState: canonical?.core.quality.status ?? null,
          resultHash: canonical?.resultHash ?? null,
          completedAt: child?.completedAt ?? null,
          totalTime: child?.totalTime ?? null,
        })
      } catch {
        logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
        unitReports.push({
          itemId: item.id,
          type: 'SITUATIONAL' as const,
          kind: 'situational' as const,
          label: resolveCompositeItemLabel(item, packageSlotLabels),
          metrics: [],
          quality: null,
          qualityState: null,
          completedAt: null,
          totalTime: null,
          decryptError: true,
        })
      }
      continue
    }
    try {
      const session = cognitiveMap.get(item.id)
      const resultSnapshot = session?.resultSnapshotEncrypted
        ? parseCognitiveResultSnapshot(decryptCognitivePayload<unknown>(session.resultSnapshotEncrypted))
        : null
      // Unified completed sessions already contain their authoritative report;
      // only historical results need to reload/decrypt the task configuration.
      const config = session && !resultSnapshot
        ? (await cognitiveSessionService.loadCognitiveSessionConfig(session.configSnapshotEncrypted)).config
        : {}
      const resultReferences = resultSnapshot ? referencesForCognitiveResult(resultSnapshot) : []
      const score = resultSnapshot
        ? null
        : session?.scoreEncrypted
          ? decryptCognitivePayload<number>(session.scoreEncrypted)
          : null
      const metrics = resultSnapshot?.metrics
        ?? (session?.metricsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.metricsEncrypted) : {})
      const qualityFlags = resultSnapshot?.quality.flags
        ?? (session?.qualityFlagsEncrypted ? decryptCognitivePayload<Record<string, unknown>>(session.qualityFlagsEncrypted) : {})
      const frozenReport = readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)
      if (packageBased && !frozenReport) {
        throw new Error('报告包认知模块缺少冻结报告定义')
      }
      const profile = frozenReport?.profile
        ?? (item.cognitiveAssignment?.profile === 'experience'
          || item.cognitiveAssignment?.profile === 'standard'
          || item.cognitiveAssignment?.profile === 'research'
          ? item.cognitiveAssignment.profile
          : null)
      const legacyReference = session && score !== null
        ? resolveCognitiveReferenceForResult({
          testType: session.testType,
          metrics,
          score,
          qualityFlags,
          config,
          profile,
          engineVersion: session.engineVersion,
          scoringVersion: session.scoringVersion,
          configVersion: session.configVersion,
        })
        : undefined
      const reference = resultSnapshot ? resultReferences[0] : legacyReference
      const singleTaskReport = resultSnapshot
        ? resultSnapshot.report
        : session && score !== null
        ? buildCognitiveSingleTaskReport({
          testType: session.testType,
          engineVersion: session.engineVersion ?? '',
          scoringVersion: session.scoringVersion ?? '',
          configVersion: session.configVersion ?? '',
          profile,
          frozenReport,
          score,
          metrics,
          qualityFlags,
          reference: legacyReference ?? null,
        })
        : null
      const unitReport = {
        itemId: item.id,
        type: item.type,
        kind: 'cognitive' as const,
        label: resolveCompositeItemLabel(item, packageSlotLabels),
        sessionId: session?.id,
        testType: session?.testType,
        score,
        metrics,
        qualityFlags,
        quality: resultSnapshot?.quality,
        finishedAt: session?.finishedAt,
        reference,
        references: resultReferences,
        assessmentContext: resultSnapshot?.assessmentContext ?? null,
        singleTaskReport,
      }
      Object.defineProperty(unitReport, '__frozenMetricDefinitions', {
        value: frozenReport?.metricDefinitions,
        enumerable: false,
      })
      unitReports.push(unitReport)
    } catch {
      logger.warn('composite report module decrypt failed', { attemptId: attempt.id, itemId: item.id, type: item.type })
      unitReports.push({ itemId: item.id, type: item.type, kind: 'cognitive' as const, label: resolveCompositeItemLabel(item, packageSlotLabels), decryptError: true })
    }
  }
  const report = {
    ...(attempt.trainingFlowScope?{trainingFlow:trainingFlowProvenance(attempt.trainingFlowScope)}:{}),...(attempt.trainingVariantScope?.variant?{trainingVariant:trainingVariantProvenance(attempt.trainingVariantScope)}:{}),
    taskSatisfaction: attempt.taskSatisfaction ?? null, taskSatisfied:isTaskSatisfied(attempt),
    id: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    name: attempt.compositeAssessment.name,
    ...(attempt.compositeAssessment.productKind === 'QUESTIONNAIRE' ? { productKind: 'QUESTIONNAIRE' as const, reportMode: 'COLLECTION_ONLY' as const } : {}),
    anonymousCode: attempt.anonymousCode,
    completedAt: attempt.completedAt,
    totalTime: attempt.totalTime,
    backgroundValues,
    unitReports,
  }
  // Keep direct callers of the pre-PR6A builder source-compatible while the
  // JSON/API contract exposes only the collection-only unitReports field.
  Object.defineProperty(report, 'modules', { value: unitReports, enumerable: false })
  return report
}

const readPackageSnapshotForReport = async (attempt: any, snapshotId?: string) => {
  const packageFields = [
    attempt.compositeAssessment.reportPackageKey,
    attempt.compositeAssessment.reportPackageVersion,
    attempt.compositeAssessment.reportPackageProfile,
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  ]
  const collectionOnly = packageFields.every((value) => value === null || value === undefined)
  if (collectionOnly) {
    if (snapshotId) throw compositeNotFound('分析快照不存在')
    return null
  }
  if (packageFields.some((value) => !value)) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }

  let packageSnapshot
  try {
    packageSnapshot = readFrozenReportPackageSnapshot(
      attempt.compositeAssessment.reportPackageSnapshotEncrypted,
    )
    if (
      packageSnapshot.packageKey !== attempt.compositeAssessment.reportPackageKey
      || packageSnapshot.packageVersion !== attempt.compositeAssessment.reportPackageVersion
      || packageSnapshot.profile !== attempt.compositeAssessment.reportPackageProfile
    ) {
      throw new Error('报告包实例与冻结快照不匹配')
    }
  } catch {
    logger.warn('composite package snapshot unavailable', {
      attemptId: attempt.id,
      snapshotId: snapshotId ?? null,
      packageKey: attempt.compositeAssessment.reportPackageKey,
      packageVersion: attempt.compositeAssessment.reportPackageVersion,
      profile: attempt.compositeAssessment.reportPackageProfile,
    })
    throw compositeBadRequest('分析快照不可用')
  }

  let snapshot
  try {
    snapshot = await readPackageAnalysisSnapshot(prisma, {
      attemptId: attempt.id,
      snapshotId,
      expected: buildCompletionSnapshotExpectation({
        attemptId: attempt.id,
        assessmentId: attempt.compositeAssessment.id,
        packageSnapshot,
      }),
    })
  } catch {
    throw compositeBadRequest('分析快照不可用')
  }
  if (!snapshot) {
    if (snapshotId) throw compositeNotFound('分析快照不存在')
    throw compositeBadRequest('综合测评缺少完成时分析快照')
  }
  return { packageSnapshot, snapshot }
}

const trainingContentReportSelect = {
  compositeAssessmentId:true,trainingContentBinding:true,trainingContentBindingHash:true,
  trainingReferenceBinding:true,trainingReferenceBindingHash:true,contextSnapshotEncrypted:true,contextSnapshotHash:true,
  trainingContentInterpretationEncrypted:true,trainingContentInterpretationHash:true,
} as const

// Called only after the existing exact attempt visibility check. Participant
// feedback remains its existing independently governed projection.
const withTrainingContentReports = async (report:any,parent:any,audience:CompositeReportAudience,metadataOnly=false) => {
  if(audience==='participant'||parent.trainingContentInterpretationEncrypted==null)return report
  if(metadataOnly){
    const receipt=decodeTrainingFinalReceipt(parent)
    return {...report,contentReportIndex:receipt?.interpretation.units.map(unit=>({itemId:unit.instrumentKey,status:unit.report.status}))??[]}
  }
  const contentReports=await prisma.$transaction(tx=>readTrainingContentReports(tx,{parent,audience}),
    {isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:5000})
  return {...report,contentReports}
}

const projectHttpReport = async (
  attempt: any,
  audience: CompositeReportAudience,
  snapshotId?: string,
  readBatch?: CompositeReportFactsReader,
) => {
  const report = (await buildCompositeReport(attempt, undefined, readBatch))
  if (attempt.compositeAssessment.productKind === 'ASSESSMENT_BUNDLE') {
    const projected = projectCompositeCollectionReport({ ...report, backgroundValues: [] }, audience)
    return { ...projected, productKind: 'ASSESSMENT_BUNDLE', bundleReport: await (await import('../bundle-product/analysis')).readReport(
      attempt.id, audience === 'researcher' ? 'admin' : audience === 'teacher' ? 'teacher' : 'student', snapshotId) }
  }
  const packageContext = await readPackageSnapshotForReport(attempt, snapshotId)
  if (!packageContext) return withTrainingContentReports(await withTrainingTimingReport(projectCompositeCollectionReport(report, audience),attempt,audience,readBatch?{attemptEpoch:attempt.attemptEpoch,children:attempt.scaleAssessments}:undefined),attempt,audience,Boolean(readBatch))
  return projectCompositeReport({
    report,
    packageSnapshot: packageContext.packageSnapshot,
    snapshot: packageContext.snapshot,
    audience,
  })
}

const packageAnalysisExportContextFor = async (
  attempt: any,
  audience: CompositeReportAudience,
  snapshotId?: string,
): Promise<CompositeAnalysisExportContext> => {
  const packageFields = [
    attempt.compositeAssessment.reportPackageKey,
    attempt.compositeAssessment.reportPackageVersion,
    attempt.compositeAssessment.reportPackageProfile,
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  ]
  if (packageFields.every((value) => value === null || value === undefined)) {
    throw compositeBadRequest('collection-only 综合测评不支持综合分析导出')
  }
  if (packageFields.some((value) => !value)) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }
  // The collection-only and incomplete-package cases are rejected above;
  // the supported export path therefore always returns a package context.
  const packageContext = (await readPackageSnapshotForReport(attempt, snapshotId))!
  return {
    attemptId: attempt.id,
    assessmentId: attempt.compositeAssessment.id,
    assessmentName: attempt.compositeAssessment.name,
    audience,
    packageSnapshot: packageContext.packageSnapshot,
    snapshot: packageContext.snapshot,
  }
}

const reportReadHeaderSelect = {
  ...REPORT_PARENT_SELECT, ...trainingContentReportSelect, ...trainingFeedbackAttemptSelect, compositeAssessmentId: true, userId: true, recoveryTokenHash: true,trainingTimingSnapshot:true,trainingVariantAllocationEncrypted:true,trainingFlowSnapshotEncrypted:true,trainingFlowSnapshotHash:true,trainingFlowPathEncrypted:true,trainingFlowPathHash:true,trainingVariantAllocationHash:true,
  compositeAssessment: { select: { ...trainingFeedbackParentSelect, id: true,createdBy:true, productKind: true,timingExportEnabled:true,revision:true,trainingVariantFrozen:true,trainingVariantDraft:true,trainingFlowDraft:true,trainingFlowFrozen:true,trainingFlowDigest:true,trainingVariantDigest:true, items: { select: { type: true } } } },
} as const

const loadReportReadHeader = async (attemptId: string) => {
  const parent = await prisma.compositeAssessmentAttempt.findUnique({ where: { id: attemptId }, select: reportReadHeaderSelect })
  if (!parent) throw compositeNotFound('综合测评记录不存在')
  return parent
}

const authorizeReportParticipant = (parent: any, context: { userId?: string; recoveryTokenHash?: string }) => {
  const authorized = context.userId ? parent.userId === context.userId
    : Boolean(context.recoveryTokenHash && parent.userId === null && parent.recoveryTokenHash === context.recoveryTokenHash)
  if (!authorized) throw compositeForbidden('无权限查看此综合测评记录')
  assertSupportedComposite(parent.compositeAssessment, true)
}

const reportStatusForHeader = async (parent: any, joinedJob?: Awaited<ReturnType<typeof readCompositeReportJobHeader>>, participant = true) => {
  const job = joinedJob !== undefined ? joinedJob : parent.asyncReportEpoch === parent.attemptEpoch
    ? await readCompositeReportJobHeader(parent.id, parent.attemptEpoch) : null
  const feedback = job?.wholeSubmissionId ? readWholeReportFeedbackHint(parent.id, job.wholeSubmissionId) : null
  const release = participant ? evaluateTrainingFeedbackForAttempt(parent, { reportReady: trainingFeedbackReportReady(parent, job) }) : null
  // A durable whole FINAL can precede aggregate completion while generation
  // runs. Keep that processing state distinct from an unfinished submission.
  if (release?.configured && release.state === 'WAITING_SUBMISSION' && job?.wholeSubmissionId && job.status !== 'WAITING') release.state = 'REPORT_PROCESSING'
  return {
    ...(release?.configured ? { participantFeedback: { state: release.state, releaseAt: release.releaseAt } } : {}),
    ...(feedback ? { feedbackPollProfile: feedback.profile } : {}),
    feedbackWaitMs: job?.wholeSubmissionId && reportReadyWaitAvailable() ? REPORT_READY_MAX_WAIT_MS : 0,
    attemptId: parent.id, attemptEpoch: parent.attemptEpoch, status: parent.status,
    hasAcceptedSubmission: Boolean(job && (job.wholeSubmissionId || job.requestedRevision > 0)),
    wholeSubmissionReceived: Boolean(job?.wholeSubmissionId), wholeSubmissionId: job?.wholeSubmissionId ?? null,
    reportStatus: job ? { ...compositeReportJobState(job), ...(feedback ? { retryAfterSeconds: job?.wholeSubmissionId && reportReadyWaitAvailable() ? 0.1 : feedback.retryAfterSeconds } : {}) } : {
      state: parent.status === 'COMPLETED' ? 'READY' : 'WAITING', jobId: null,
      retryAfterSeconds: 2, errorCode: null, completedAt: parent.completedAt,
    },
  }
}

const readParticipantReportStatus = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string },
  options: { waitMs?: number; signal?: AbortSignal } = {}, compactView = false) => {
  const compact = compactView || process.env.ASSESSMENT_REPORT_COMPACT_READ_ENABLED === 'true'
  if (compact || options.waitMs) await prepareReportReadyNotifications()
  const sequence = reportReadyNotificationSequence()
  const loaded = compact ? await readCompositeReportStatusContext(attemptId) : null
  const parent = compact ? loaded?.parent : await loadReportReadHeader(attemptId)
  if (!parent) throw compositeNotFound('综合测评记录不存在')
  authorizeReportParticipant(parent, context)
  if (!compact && parent.asyncReportEpoch === parent.attemptEpoch) await prepareReportReadyNotifications()
  const wait = beginReportReadyWait(attemptId, parent.attemptEpoch, options.waitMs ?? 0, options.signal, sequence)
  try {
    const status = await reportStatusForHeader(parent, compact ? loaded!.job : undefined)
    if (!wait || !status.wholeSubmissionReceived || !['PENDING', 'PROCESSING'].includes(status.reportStatus.state)) {
      return { parent, status: options.waitMs && !wait ? { ...status, feedbackWaitMs: 0 } : status }
    }
    const result = await wait.done
    if (options.signal?.aborted) return { parent, status }
    // Fresh authorization AND status share one DB snapshot after a hint/timeout.
    const refreshed = compact ? await readCompositeReportStatusContext(attemptId) : null
    const current = compact ? refreshed?.parent : await loadReportReadHeader(attemptId)
    if (!current) throw compositeNotFound('综合测评记录不存在')
    authorizeReportParticipant(current, context)
    const authoritative = await reportStatusForHeader(current, compact ? refreshed!.job : undefined)
    return { parent: current, status: result === 'unavailable' ? { ...authoritative, feedbackWaitMs: 0 } : authoritative }
  } finally { wait?.cancel() }
}

export const getCompositeReportStatus = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string },
  options: { waitMs?: number; signal?: AbortSignal } = {}) => (await readParticipantReportStatus(attemptId, context, options)).status

export const retryCompositeQuestionnaireReport = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  const parent = await loadReportReadHeader(attemptId)
  authorizeReportParticipant(parent, context)
  if (parent.asyncReportEpoch !== parent.attemptEpoch) throw compositeBadRequest('本次作答没有异步报告任务')
  await retryCompositeReport(parent)
  return reportStatusForHeader(parent)
}

export const getCompositeReportStatusForTeacher = async (userId: string, role: UserRole, compositeId: string, attemptId: string) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const parent = await loadReportReadHeader(attemptId)
  if (parent.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
  await assertRelationalTeacherAttemptReadAllowed(parent, userId, role)
  return reportStatusForHeader(parent, undefined, false)
}

const reportMaterializationBinding = async (parent:any,job:any) => {
  if (parent.status !== 'COMPLETED' || !job || job.status !== 'READY' || !job.reportEncrypted || !parent.aggregateInputHash) {
    throw new (await import('../../services/questionnaireCompletionAdmission')).QuestionnaireCompletionAdmissionBusyError('database_busy', 2)
  }
  assertReportJobIdentity(parent, { attemptEpoch: job.attemptEpoch, slotSetHash: job.slotSetHash, contextHash: job.contextHash })
  if (job.aggregateInputHash !== parent.aggregateInputHash) throw compositeConflict('报告输入版本已变化')
  return {attemptId: parent.id, attemptEpoch: parent.attemptEpoch, slotSetHash: job.slotSetHash,
    contextHash: job.contextHash, aggregateInputHash: parent.aggregateInputHash}
}

const materializedReportForHeader = async (parent: any, audience: CompositeReportAudience, joinedJob?: any, verifiedScope?: Awaited<ReturnType<typeof resolveTrainingAttemptScope>>, batchReads?:CompactReportReadDependencies) => {
  if (parent.asyncReportEpoch !== parent.attemptEpoch) return null
  const job = joinedJob !== undefined ? joinedJob : await readCompositeReportMaterialization(parent.id, parent.attemptEpoch)
  const reportBinding = await reportMaterializationBinding(parent,job)
  const scope = verifiedScope ?? (hasTrainingVariantMetadata(parent)
    ? await resolveTrainingAttemptScope(await loadAttemptWithChildren(parent.id)) : undefined)
  const report = await decryptCompactCompositeReport(job.reportEncrypted, reportBinding,{...batchReads,...(scope?{trainingVariantScope:scope}:{})}) ?? decryptCompositeCollectionReport(job.reportEncrypted, reportBinding)
  if(scope)assertTrainingVariantReportScope(report,scope)
  // HTTP projection is applied to the CURRENT audience on every read. No
  // participant/teacher projection or authorization decision is globally cached.
  return withTrainingContentReports(await withTrainingTimingReport(projectCompositeCollectionReport({...report,taskSatisfaction:parent.taskSatisfaction??null,taskSatisfied:isTaskSatisfied(parent)}, audience),parent,audience,batchReads?{attemptEpoch:parent.attemptEpoch,children:parent.scaleAssessments}:undefined),parent,audience,Boolean(batchReads))
}


/**
 * Collection-report projection for every instrument combination. Avoid raw
 * answers, trial rows and live scale definitions; frozen disclosure remains.
 */
const loadCollectionReportAttempt = async (attemptId: string) => {
  const attempt = await prisma.compositeAssessmentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      ...REPORT_PARENT_SELECT, ...trainingContentReportSelect, frozenActiveSlotSetEncrypted:true, anonymousCode: true, totalTime: true, participantKey:true, trainingVariantAllocationEncrypted:true, trainingFlowSnapshotEncrypted:true,trainingFlowSnapshotHash:true,trainingFlowPathEncrypted:true,trainingFlowPathHash:true,trainingVariantAllocationHash:true,
      compositeAssessment: { select: {
        id: true, name: true, createdBy:true, productKind: true, reportPackageKey: true, analysisProtocolKey: true,
        publishedAt:true,trainingVariantDraft:true,trainingVariantFrozen:true,trainingFlowDraft:true,trainingFlowFrozen:true,trainingFlowDigest:true,trainingVariantDigest:true,formSections:{include:{items:true}},
        reportPackageSnapshotEncrypted: true,
        items: { orderBy: { position: 'asc' }, include: {
          scale: { select: { id: true, code: true, name: true, instrumentVersion: true, instrumentClass: true } },
          cognitiveAssignment: { select: { id: true, title: true, profile: true,
            resolvedReportSnapshotEncrypted: true, config: { select: { testType: true, name: true } } } },
        } },
      } },
      scaleAssessments: { select: {
        id: true, scaleId: true, compositeItemId: true, result: true, completedAt: true, totalTime: true,
        submissionId: true, submissionPayloadHash: true,
        attemptEpoch: true, compiledRuntimeHash: true, runtimeSnapshotEncrypted: true,
        scale: { select: { code: true, instrumentVersion: true, instrumentClass: true, libraryEntryId: true, measurementReleaseId: true } },
      } },
      cognitiveSessions: { select: {
        id: true, compositeItemId: true, attemptNo: true, testType: true, finishedAt: true,
        resultSnapshotEncrypted: true, configSnapshotEncrypted: true,
        scoreEncrypted: true, metricsEncrypted: true, qualityFlagsEncrypted: true,
        engineVersion: true, scoringVersion: true, configVersion: true,
      } },
      situationalAttempts: { select: {
        compositeItemId: true, canonicalResultEncrypted: true, runtimeSnapshotEncrypted: true,
        instrumentKey: true, instrumentVersion: true, completedAt: true, totalTime: true,
      } },
      formAnswers: { select: { itemId: true, value: true } },
    },
  })
  if (!attempt) throw compositeNotFound('综合测评记录不存在')
  return applyTrainingAttemptScope(attempt)
}

/** A completed ordinary questionnaire needs source references and layout, not an expanded report tree. */
const materializeCompactReportFromFacts = async (attempt: any, binding: ReportJobIdentity & {attemptId:string;aggregateInputHash:string}, verified?: WholeQuestionnaireReportContext): Promise<string | null> => {
  attempt = await applyTrainingAttemptScope(attempt)
  // C07 will add typed report layout to the compact format; use canonical reader meanwhile.
  if (attempt.compositeAssessment.items.some((item:any) => item.formDefinition != null)) return null
  if (!sharedControlWritesEnabled() || !attempt.compositeAssessment.items.every((item:any)=>['FORM','SCALE','COGNITIVE'].includes(item.type))) return null
  const scaleByItem = new Map<string,any>(attempt.scaleAssessments.map((row:any)=>[row.compositeItemId,row])), cogByItem = new Map<string,any>(attempt.cognitiveSessions.map((row:any)=>[row.compositeItemId,row]))
  const rows = attempt.compositeAssessment.items.filter((item:any)=>item.type==='SCALE').map((item:any)=>scaleByItem.get(item.id))
  if (rows.some((row:any)=>!row || row.result?.k!=='SFF1') || attempt.compositeAssessment.items.some((item:any)=>item.type==='COGNITIVE'&&!cogByItem.get(item.id)?.resultSnapshotEncrypted)) return null
  const scaleFacts = await preloadStoredScaleResults(rows)
  const labels=getFrozenPackageSlotLabels(attempt.compositeAssessment),formValues=readContextFormAnswers(attempt.compositeAssessment.items.filter((item:any)=>item.type==='FORM').map((item:any)=>({id:item.id,contextKey:item.contextKey})),attempt.formAnswers)
  const formById=new Map<string,any>(formValues.map((row:any)=>[row.itemId,row])),backgroundValues:any[]=[],unitReports:any[]=[]
  for(const item of attempt.compositeAssessment.items){
    if(item.type==='FORM'){
      backgroundValues.push(buildFormBackgroundReport({itemId:item.id,label:labels.get(item.position)??item.formLabel,value:formById.get(item.id)?.value??null,formType:item.formType,options:item.formOptions}));continue
    }
    if(item.type==='COGNITIVE'){
      const unit={itemId:item.id,type:'COGNITIVE',kind:'cognitive',label:resolveCompositeItemLabel(item,labels)}
      const frozen=readFrozenReport(item.cognitiveAssignment?.resolvedReportSnapshotEncrypted)
      if(frozen?.metricDefinitions)Object.defineProperty(unit,'__frozenMetricDefinitions',{value:frozen.metricDefinitions,enumerable:false})
      unitReports.push(unit);continue
    }
    const child=scaleByItem.get(item.id),committed=readCommittedScaleFacts(child),result=committed?.result??await resolveStoredScaleResult(child.result,{record:child,reader:scaleFacts})
    const entry=verified?.units.get(child.id),reuse=verified&&entry&&verified.attemptId===attempt.id&&verified.attemptEpoch===attempt.attemptEpoch
      &&verified.slotSetHash===attempt.frozenActiveSlotSetHash&&verified.contextHash===attempt.contextSnapshotHash&&entry.attemptEpoch===child.attemptEpoch
      &&entry.runtimeSnapshotEncrypted===child.runtimeSnapshotEncrypted&&entry.runtime.compiledRuntime.compiledRuntimeHash===child.compiledRuntimeHash
      &&entry.runtime.instrumentKey===child.scale?.code&&entry.runtime.instrumentVersion===child.scale?.instrumentVersion
    const policy=await loadProjectionPolicyForAssessment(child,result,reuse?entry!.runtime:undefined)
    if(policy.snapshotError)throw new Error('Frozen report disclosure unavailable')
    const unit={itemId:item.id,type:'SCALE',kind:'scale',scaleId:item.scaleId,scaleCode:item.scale?.code,scaleName:item.scale?.name||'未知量表',result}
    Object.defineProperty(unit,'__scaleProjectionPolicy',{value:policy.policy,enumerable:false});unitReports.push(unit)
  }
  const report={...(attempt.trainingFlowScope?{trainingFlow:trainingFlowProvenance(attempt.trainingFlowScope)}:{}),...(attempt.trainingVariantScope?.variant?{trainingVariant:trainingVariantProvenance(attempt.trainingVariantScope)}:{}),id:attempt.id,assessmentId:attempt.compositeAssessment.id,name:attempt.compositeAssessment.name,productKind:'QUESTIONNAIRE',reportMode:'COLLECTION_ONLY',
    anonymousCode:attempt.anonymousCode,completedAt:attempt.completedAt,totalTime:attempt.totalTime,backgroundValues,unitReports}
  return canStoreCompactCompositeReport(report,attempt.scaleAssessments,attempt.cognitiveSessions)
    ?encryptCompactCompositeReport(report,binding,attempt.scaleAssessments,undefined,attempt.cognitiveSessions,await resolveTrainingAttemptScope(attempt)):null
}

export const materializeCompositeQuestionnaireReport = async (attemptId: string, expected: ReportJobIdentity,
  verifiedContext?: WholeQuestionnaireReportContext,
  committedAttempt?: any,
) => {
  const committed = verifiedContext?.committed
  const reusable = process.env.ASSESSMENT_REPORT_COMMITTED_CONTEXT_ENABLED === 'true'
    && committed && committedAttempt && committedAttempt.id === attemptId
    && committedAttempt.attemptEpoch === expected.attemptEpoch
    && committedAttempt.frozenActiveSlotSetHash === expected.slotSetHash
    && committedAttempt.contextSnapshotHash === expected.contextHash
    && committedAttempt.scaleAssessments === committed.parent.scaleAssessments
    && committedAttempt.status === 'COMPLETED' && committedAttempt.aggregateInputHash
  const attempt = reusable ? committedAttempt : process.env.ASSESSMENT_REPORT_NARROW_LOAD_ENABLED === 'true'
    ? await loadCollectionReportAttempt(attemptId) : await loadAttemptWithChildren(attemptId)
  assertReportJobIdentity(attempt, expected)
  if (attempt.status !== 'COMPLETED' || !attempt.aggregateInputHash
    || attempt.assignmentRef || attempt.compositeAssessment.productKind !== 'QUESTIONNAIRE'
    || attempt.compositeAssessment.reportPackageKey || attempt.compositeAssessment.analysisProtocolKey) {
    throw compositeConflict('异步报告不支持此冻结产品或当前状态')
  }
  const binding = { attemptId, ...expected, aggregateInputHash: attempt.aggregateInputHash }
  const compact = await materializeCompactReportFromFacts(attempt, binding, verifiedContext)
  if (compact) return { aggregateInputHash: attempt.aggregateInputHash, reportEncrypted: compact }
  const report = await buildCompositeReport(attempt, verifiedContext)
  return { aggregateInputHash: attempt.aggregateInputHash, reportEncrypted: canStoreCompactCompositeReport(report, attempt.scaleAssessments, attempt.cognitiveSessions)
    ? await encryptCompactCompositeReport(report, binding, attempt.scaleAssessments, undefined, attempt.cognitiveSessions, await resolveTrainingAttemptScope(attempt))
    : encryptCompositeCollectionReport(report, binding) }
}

const assertParticipantFeedbackAvailable = async (parent: any, joinedJob?: any): Promise<void> => {
  if (await isLoadedCompositeParticipantFeedbackDeferred(parent, prisma, joinedJob)) {
    throw compositeForbidden('报告尚未向学员开放，请查看报告状态')
  }
}

export const getReport = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) => {
  if (!assessmentReportConfig().enabled) {
    // Compatible rollback reads keep the existing frozen-result path. The
    // independent status endpoint and worker still recover enrolled jobs.
    const attempt = await findAttempt(attemptId, context, true, true)
    if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
    await assertParticipantFeedbackAvailable(attempt)
    return projectHttpReport(attempt, 'participant')
  }
  const loaded = sharedControlWritesEnabled() ? await readCompositeReportStatusContext(attemptId, true) : null
  const parent = sharedControlWritesEnabled() ? loaded?.parent : await loadReportReadHeader(attemptId)
  if (!parent) throw compositeNotFound('综合测评记录不存在')
  authorizeReportParticipant(parent, context)
  const job = loaded ? loaded.job : parent.asyncReportEpoch === parent.attemptEpoch
    ? await readCompositeReportMaterialization(parent.id, parent.attemptEpoch) : null
  await assertParticipantFeedbackAvailable(parent, job)
  const cached = await materializedReportForHeader(parent, 'participant', job)
  if (cached) return cached
  const attempt = await findAttempt(attemptId, context, true, true)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  await assertParticipantFeedbackAvailable(attempt, job)
  return projectHttpReport(attempt, 'participant')
}

/** Opt-in participant page read. The compact locator never authorizes report contents. */
export const getCompositeReportView = async (attemptId: string, context: { userId?: string; recoveryTokenHash?: string },
  options: { waitMs?: number; signal?: AbortSignal } = {}) => {
  const ready = (generation: Awaited<ReturnType<typeof reportStatusForHeader>>) => generation.reportStatus.state === 'READY'
    && (!generation.participantFeedback || generation.participantFeedback.state === 'AVAILABLE')
  const initial = await readParticipantReportStatus(attemptId, context, options, true)
  if (!ready(initial.status) || options.signal?.aborted) return { generation: initial.status, report: null }

  if (assessmentReportConfig().enabled && initial.parent.asyncReportEpoch === initial.parent.attemptEpoch) {
    // Reload the full current projection context, not the compact status JSON.
    const parent = await loadReportReadHeader(attemptId)
    authorizeReportParticipant(parent, context)
    const job = parent.asyncReportEpoch === parent.attemptEpoch ? await prisma.compositeReportJob.findUnique({
      where: { attemptId_attemptEpoch: { attemptId, attemptEpoch: parent.attemptEpoch } },
      select: { id: true, status: true, errorCode: true, completedAt: true, requestedRevision: true,
        wholeSubmissionId: true, attemptEpoch: true, slotSetHash: true, contextHash: true,
        aggregateInputHash: true, reportEncrypted: true },
    }) : null
    const generation = await reportStatusForHeader(parent, job)
    if (!ready(generation) || options.signal?.aborted) return { generation, report: null }
    await assertParticipantFeedbackAvailable(parent, job)
    const report = await materializedReportForHeader(parent, 'participant', job)
    if (report) return { generation, report }
  }

  // The original fresh frozen graph remains authoritative after a READY hint.
  // Recompute status so a restarted epoch or tightened release cannot pair an
  // earlier status with a different report or expose its contents.
  const attempt = await findAttempt(attemptId, context, true, true)
  const job = attempt.asyncReportEpoch === attempt.attemptEpoch
    ? await readCompositeReportJobHeader(attempt.id, attempt.attemptEpoch) : null
  const generation = await reportStatusForHeader(attempt, job)
  if (!ready(generation) || options.signal?.aborted) return { generation, report: null }
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  await assertParticipantFeedbackAvailable(attempt, job)
  return { generation, report: await projectHttpReport(attempt, 'participant') }
}

/** Reads completed, frozen children without finalizing the aggregate or admitting a new unit. */
async function projectPartialReport(attempt: any, audience: CompositeReportAudience) {
  const definition = attempt.compositeAssessment
  if (attempt.assignmentRef || !['QUESTIONNAIRE', 'LEGACY_COMPOSITE'].includes(definition.productKind) || definition.reportPackageKey || definition.analysisProtocolKey) throw compositeNotFound('该产品不提供通用单项预览')
  if (attempt.status === 'COMPLETED') return projectHttpReport(attempt, audience)
  let finalized: Set<string> | null = null
  if (attempt.runtimeGeneration === 'UNIFIED_V1') {
    const headers = await prisma.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: attempt.id, attemptEpoch: attempt.attemptEpoch } })
    if ((await loadFrozenCompositeProgress(attempt, headers))?.progressUnavailableReason) throw compositeConflict('冻结记录需要核对，暂不能读取单项结果')
    finalized = new Set((await loadFrozenMeasurementFinalHeaders(attempt, headers)).map(row => row.sourceAttemptId))
  }
  const completed = (children: any[]) => completedMeasurementChildren(children, attempt.attemptEpoch, finalized)
  const scaleAssessments = completed(attempt.scaleAssessments), cognitiveSessions = completed(attempt.cognitiveSessions), situationalAttempts = completed(attempt.situationalAttempts ?? [])
  const itemIds = new Set([...scaleAssessments, ...cognitiveSessions, ...situationalAttempts].map(child => child.compositeItemId))
  // Teacher partial reports contain completed measurements only. A reached but
  // pending Form has no accepted facts yet; do not require or synthesize them
  // merely to discard all background fields immediately below.
  const flowPartial = attempt.trainingFlowScope ? await applyTrainingAttemptScope({ ...attempt, scaleAssessments, cognitiveSessions, situationalAttempts }, { verifiedScope: attempt.trainingVariantScope }) : null
  const partialFacts = flowPartial ? await preloadCompositeReportFacts([flowPartial], prisma, { selectedItemIds: new Map([[attempt.id, itemIds]]) }) : undefined
  const report = (attempt.trainingVariantScope?.variant||attempt.trainingFlowScope) ? await buildCompositeReport(flowPartial ?? attempt, undefined, partialFacts) : await buildCompositeReport({ ...attempt, scaleAssessments, cognitiveSessions, situationalAttempts, formAnswers: [], compositeAssessment: { ...definition, items: definition.items.filter((item: any) => itemIds.has(item.id) && item.type !== 'FORM') } })
  const projected = projectCompositeCollectionReport((attempt.trainingVariantScope?.variant||attempt.trainingFlowScope) ? {...report,backgroundValues:[],unitReports:report.unitReports.filter((unit:any)=>itemIds.has(unit.itemId))} : report, audience)
  return { ...projected, reportState: 'PARTIAL' as const, completedAt: null, totalTime: null }
}

export async function getPartialReport(attemptId: string, userId: string) {
  // Legacy participant ?partial links cannot release feedback before the battery ends.
  return getReport(attemptId, { userId })
}

export const getAnalysisExportForParticipant = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
): Promise<CompositeAnalysisExportContext> => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  await assertParticipantFeedbackAvailable(attempt)
  return packageAnalysisExportContextFor(attempt, 'participant')
}

/**
 * Internal PR8 read path for the future package report API. The completion
 * snapshot is the participant/default history; this helper never falls back
 * to running the live analysis engine.
 */
export const getDefaultPackageAnalysisSnapshot = async (
  attemptId: string,
  context: { userId?: string; recoveryTokenHash?: string },
) => {
  const attempt = await findAttempt(attemptId, context)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  await assertParticipantFeedbackAvailable(attempt)
  const packageFields = [
    attempt.compositeAssessment.reportPackageKey,
    attempt.compositeAssessment.reportPackageVersion,
    attempt.compositeAssessment.reportPackageProfile,
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  ]
  if (packageFields.every((value) => value === null || value === undefined)) return null
  if (packageFields.some((value) => !value)) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }
  const packageSnapshot = readFrozenReportPackageSnapshot(
    attempt.compositeAssessment.reportPackageSnapshotEncrypted,
  )
  if (
    packageSnapshot.packageKey !== attempt.compositeAssessment.reportPackageKey
    || packageSnapshot.packageVersion !== attempt.compositeAssessment.reportPackageVersion
    || packageSnapshot.profile !== attempt.compositeAssessment.reportPackageProfile
  ) {
    throw compositeBadRequest('综合测评报告包实例与冻结快照不匹配')
  }
  const snapshot = await readCompletionPackageAnalysisSnapshot(prisma, attemptId, {
    ...buildCompletionSnapshotExpectation({
      attemptId: attempt.id,
      assessmentId: attempt.compositeAssessment.id,
      packageSnapshot,
    }),
  })
  if (!snapshot) throw compositeBadRequest('综合测评缺少完成时分析快照')
  return snapshot
}

/**
 * Explicit administrative reanalysis. It appends an immutable row when the
 * analysis input/version differs; the unique fingerprint constraint makes a
 * repeated request idempotent and never overwrites the completion row.
 */
export const reanalyzePackageAttempt = async (
  userId: string,
  role: UserRole,
  attemptId: string,
) => {
  if (role !== UserRole.ADMIN) throw compositeForbidden('只有管理员可以重新生成综合分析')
  const existing = await loadAttemptWithChildren(attemptId)
  if (existing.status !== 'COMPLETED') throw compositeBadRequest('只有已完成综合测评可以重新分析')
  if (!existing.compositeAssessment.reportPackageKey) {
    throw compositeBadRequest('collection-only 综合测评不支持综合分析')
  }

  const snapshot = await prisma.$transaction(async (tx: Db) => {
    await lockCompositeAttempt(tx, attemptId)
    const attempt = await loadAttemptForFinalization(tx, attemptId)
    if (attempt.status !== 'COMPLETED') throw compositeBadRequest('只有已完成综合测评可以重新分析')
    const packageAnalysis = await loadPackageAnalysisForAttempt(attempt, tx)
    if (!packageAnalysis) throw compositeBadRequest('综合测评不包含可分析报告包')
    const persisted = await persistOrGetPackageAnalysisSnapshot(tx, {
      attemptId: attempt.id,
      analysis: packageAnalysis.analysis,
      inputFingerprint: packageAnalysis.inputFingerprint,
      generationReason: 'REANALYSIS',
      generatedBy: userId,
    })
    return { ...persisted, packageSnapshot: packageAnalysis.packageSnapshot }
  })

  const { row, created, packageSnapshot } = snapshot
  return {
    id: row.id,
    attemptId: row.attemptId,
    packageKey: row.packageKey,
    packageVersion: row.packageVersion,
    profile: packageSnapshot.profile,
    analysisDefinitionVersion: row.analysisDefinitionVersion,
    analysisProtocolKey: packageSnapshot.analysisProtocolSnapshot.protocolKey,
    analysisProtocolVersion: packageSnapshot.analysisProtocolSnapshot.protocolVersion,
    analysisVersion: row.analysisVersion,
    reportSchemaVersion: row.reportSchemaVersion,
    inputFingerprint: row.inputFingerprint,
    generationReason: row.generationReason,
    generatedBy: row.generatedBy,
    createdAt: row.createdAt.toISOString(),
    created,
  }
}

const toSnapshotMetadata = (
  row: Omit<Awaited<ReturnType<typeof listPackageAnalysisSnapshotMetadata>>[number], 'payloadEncrypted'>,
  packageSnapshot: ReturnType<typeof readFrozenReportPackageSnapshot>,
  includeSensitive: boolean,
): CompositeSnapshotMetadata => {
  return {
    id: row.id,
    attemptId: row.attemptId,
    packageKey: row.packageKey,
    packageVersion: row.packageVersion,
    profile: packageSnapshot.profile,
    analysisDefinitionVersion: row.analysisDefinitionVersion,
    analysisProtocolKey: packageSnapshot.analysisProtocolSnapshot.protocolKey,
    analysisProtocolVersion: packageSnapshot.analysisProtocolSnapshot.protocolVersion,
    analysisVersion: row.analysisVersion,
    reportSchemaVersion: row.reportSchemaVersion,
    ...(includeSensitive ? { inputFingerprint: row.inputFingerprint, generatedBy: row.generatedBy } : {}),
    generationReason: row.generationReason,
    createdAt: row.createdAt.toISOString(),
  }
}

export const listPackageAnalysisSnapshotsForTeacher = async (
  userId: string,
  role: UserRole,
  attemptId: string,
) => {
  assertTeacher(role)
  const attempt = await loadAttemptWithChildren(attemptId)
  const composite = await loadComposite(attempt.compositeAssessmentId)
  assertOwner(composite, userId, role)
  await assertRelationalTeacherAttemptReadAllowed(attempt, userId, role)
  assertSupportedComposite(attempt.compositeAssessment, false, false)
  if (!attempt.compositeAssessment.reportPackageKey) return { list: [], total: 0 }
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  if (
    !attempt.compositeAssessment.reportPackageVersion
    || !attempt.compositeAssessment.reportPackageProfile
    || !attempt.compositeAssessment.reportPackageSnapshotEncrypted
  ) {
    throw compositeBadRequest('综合测评的报告包冻结信息不完整')
  }

  const rows = await listPackageAnalysisSnapshotMetadata(prisma, attemptId)
  let packageSnapshot: ReturnType<typeof readFrozenReportPackageSnapshot>
  try {
    packageSnapshot = readFrozenReportPackageSnapshot(attempt.compositeAssessment.reportPackageSnapshotEncrypted)
    if (
      packageSnapshot.packageKey !== attempt.compositeAssessment.reportPackageKey
      || packageSnapshot.packageVersion !== attempt.compositeAssessment.reportPackageVersion
      || packageSnapshot.profile !== attempt.compositeAssessment.reportPackageProfile
    ) {
      throw new Error('报告包实例与冻结快照不匹配')
    }
    buildCompletionSnapshotExpectation({
      attemptId: attempt.id,
      assessmentId: attempt.compositeAssessment.id,
      packageSnapshot,
    })
  } catch {
    logger.warn('composite package snapshot metadata unavailable', {
      attemptId: attempt.id,
      snapshotId: null,
      packageKey: attempt.compositeAssessment.reportPackageKey,
      packageVersion: attempt.compositeAssessment.reportPackageVersion,
    })
    throw compositeBadRequest('分析快照不可用')
  }
  const driftedRow = rows.find((row) => (
    row.attemptId !== attempt.id
    || row.packageKey !== packageSnapshot.packageKey
    || row.packageVersion !== packageSnapshot.packageVersion
    || row.analysisDefinitionVersion !== packageSnapshot.analysisProtocolSnapshot.protocolVersion
  ))
  if (driftedRow) {
    logger.warn('composite analysis snapshot metadata drift', {
      attemptId: attempt.id,
      snapshotId: driftedRow.id,
      packageKey: driftedRow.packageKey,
      packageVersion: driftedRow.packageVersion,
      analysisVersion: driftedRow.analysisVersion,
      reportSchemaVersion: driftedRow.reportSchemaVersion,
    })
    throw compositeBadRequest('分析快照不可用')
  }
  const list = rows.map((row) => toSnapshotMetadata(row, packageSnapshot, role === UserRole.ADMIN))
  return { list, total: list.length }
}

/** One authorized union and one child/plan batch for a bounded task report page. */
export async function getTrainingVariantReportsForTeacher(userId:string,role:UserRole,compositeId:string,after?:string){
  assertTeacher(role)
  const composite=await loadComposite(compositeId,true)
  assertOwner(composite,userId,role)
  if(!composite.trainingVariantFrozen)throw compositeBadRequest('此接口仅用于概率分卷报告')
  const visibility=await teacherRelationalAttemptVisibility(userId,role)
  const rows=await prisma.compositeAssessmentAttempt.findMany({where:{compositeAssessmentId:compositeId,status:'COMPLETED',...(after?{id:{gt:after}}:{}),...(visibility?{AND:[visibility]}:{})},orderBy:{id:'asc'},take:101,
    include:{scaleAssessments:{include:{scale:true}},cognitiveSessions:true,situationalAttempts:true,formAnswers:true,formSectionAttempts:true}})
  const page=rows.slice(0,100),plans=await loadSituationalExportSlotSets(page)
  const jobs=await prisma.compositeReportJob.findMany({where:{attemptId:{in:page.map(a=>a.id)}}})
  const byAttempt=new Map(jobs.map(j=>[`${j.attemptId}:${j.attemptEpoch}`,j]))
  const selected=[]
  for(const row of page){
    const attempt={...row,compositeAssessment:composite}
    const scope=await resolveTrainingAttemptScope(attempt,composite,{frozenSlotSets:plans})
    if(attempt.compositeAssessmentId!==compositeId)throw compositeForbidden('报告任务来源不一致')
    await assertRelationalTeacherAttemptReadAllowed(attempt,userId,role)
    const job=byAttempt.get(`${attempt.id}:${attempt.attemptEpoch}`)??null
    const materialized=assessmentReportConfig().enabled&&attempt.asyncReportEpoch===attempt.attemptEpoch
    selected.push({attempt:await applyTrainingAttemptScope(attempt),scope,job,materialized,
      binding:materialized?await reportMaterializationBinding(attempt,job):null})
  }
  const [compactReads,fallbackReads]=await Promise.all([
    preloadCompactCompositeReportReads(selected.flatMap(entry=>entry.binding?[{encrypted:entry.job!.reportEncrypted!,binding:entry.binding,scope:entry.scope}]:[])),
    preloadCompositeReportFacts(selected.filter(entry=>!entry.materialized).map(entry=>entry.attempt)),
  ])
  const reports=[]
  for(const entry of selected){
    const audience=role===UserRole.ADMIN?'researcher':'teacher'
    reports.push(entry.materialized
      ?await materializedReportForHeader(entry.attempt,audience,entry.job,entry.scope,compactReads)
      :await projectHttpReport(entry.attempt,audience,undefined,fallbackReads))
  }
  return {reports,next:rows.length>100?rows[99].id:null}
}

export const getReportForTeacher = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  attemptId: string,
  snapshotId?: string,
  partial = false,
) => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  if (!assessmentReportConfig().enabled) {
    const attempt = await loadAttemptWithChildren(attemptId)
    if (attempt.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
    await assertRelationalTeacherAttemptReadAllowed(attempt, userId, role)
    if (partial) return projectPartialReport(attempt, role === UserRole.ADMIN ? 'researcher' : 'teacher')
    if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
    assertSupportedComposite(attempt.compositeAssessment, ['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE'].includes(attempt.compositeAssessment.productKind), false)
    return projectHttpReport(attempt, role === UserRole.ADMIN ? 'researcher' : 'teacher', snapshotId)
  }
  const header = await loadReportReadHeader(attemptId)
  if (header.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
  await assertRelationalTeacherAttemptReadAllowed(header, userId, role)
  if (!partial && header.asyncReportEpoch === header.attemptEpoch) {
    if (snapshotId) throw compositeNotFound('分析快照不存在')
    return materializedReportForHeader(header, role === UserRole.ADMIN ? 'researcher' : 'teacher')
  }
  const attempt = await loadAttemptWithChildren(attemptId)
  if (attempt.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
  await assertRelationalTeacherAttemptReadAllowed(attempt, userId, role)
  if (partial) return projectPartialReport(attempt, role === UserRole.ADMIN ? 'researcher' : 'teacher')
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  assertSupportedComposite(attempt.compositeAssessment, ['QUESTIONNAIRE', 'ASSESSMENT_BUNDLE'].includes(attempt.compositeAssessment.productKind), false)
  return projectHttpReport(attempt, role === UserRole.ADMIN ? 'researcher' : 'teacher', snapshotId)
}

export const getAnalysisExportForTeacher = async (
  userId: string,
  role: UserRole,
  compositeId: string,
  attemptId: string,
  snapshotId?: string,
): Promise<CompositeAnalysisExportContext> => {
  assertTeacher(role)
  const composite = await loadComposite(compositeId)
  assertOwner(composite, userId, role)
  const attempt = await loadAttemptWithChildren(attemptId)
  if (attempt.compositeAssessmentId !== compositeId) throw compositeNotFound('综合测评记录不存在')
  await assertRelationalTeacherAttemptReadAllowed(attempt, userId, role)
  if (attempt.status !== 'COMPLETED') throw compositeBadRequest('综合测评尚未完成')
  assertSupportedComposite(attempt.compositeAssessment, false, false)
  return packageAnalysisExportContextFor(attempt, role === UserRole.ADMIN ? 'researcher' : 'teacher', snapshotId)
}

export const getExportContext = async (userId: string, role: UserRole, id: string) => {
  assertTeacher(role)
  // Export-only authorization projection: the filtered relation count is part
  // of this query, without loading definitions or adding per-export lookups.
  const composite = await prisma.compositeAssessment.findUnique({ where: { id }, select: {
    id: true, createdBy: true, productKind: true,
    _count: { select: { items: { where: { formDefinition: { not: Prisma.AnyNull } } } } },
  } })
  if (!composite) throw compositeNotFound()
  assertOwner(composite, userId, role)
  if (composite.productKind === 'ASSESSMENT_BUNDLE') throw compositeConflict('请使用 Bundle 报告导出，通用明细导出不适用于测评包')
  return composite
}

export const isCompositeError = (err: unknown): err is CompositeServiceError => err instanceof CompositeServiceError

export async function retryBundleForParticipant(attemptId: string, context: { userId?: string; recoveryTokenHash?: string }) {
  const attempt = await findAttempt(attemptId, context, true)
  if (attempt.compositeAssessment.productKind !== 'ASSESSMENT_BUNDLE' || attempt.assignmentRef || attempt.status !== 'COMPLETED') throw compositeNotFound()
  await assertParticipantFeedbackAvailable(attempt)
  const analysis = await import('../bundle-product/analysis')
  const row = await analysis.readReport(attemptId, 'student')
  await analysis.processAnalysis(row.analysisId)
  return analysis.readReport(attemptId, 'student')
}
