import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { readEducationScaleExecutionSource } from '../assessment-run/educationScaleExecutionSource'
import { privateToolImageReferences } from '../education-tools/private-tool.media-definition'
import { validateResultDisclosureContract } from '../assessment-policy/result-disclosure'
import { loadFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { loadStoredVersionedUnitAdmission } from '../assessment-runtime/unit-admission'
import { loadFrozenActiveSlotSet, compositeItemSlotKey } from '../assessment-runtime/slot-set'
import { resolveStoredScaleResult, loadStoredCanonicalUnitResults, createStoredScaleFactsReader } from '../assessment-runtime/compact-assessment-storage'
import { scaleProjectionPolicyFromCompiled } from '../scale/projection/policy-resolver'
import { DISCLOSURE_PRESETS } from '../scale/policy/disclosure'
import { buildScaleUnitReport, type ScaleUnitReport } from './scale-unit-report'
import { educationLibraryV1ProjectionPolicy, projectEducationScaleIndividualReport } from './education-scale-report.projector'
import { reportingFail } from './types'

export type EducationPersonalReportInput = {
  actorUserId: string; executionId: string; product: 'SCHOOL' | 'TEACHER'
}
type OwnExecution = {
  organizationId: string; resourceKey: string; resourceVersion: string
  attemptId: string; assignmentId: string; policy: Record<string, unknown>; policyHash: string
}
const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)
const withheld = () => ({ schemaVersion: 1 as const, kind: 'EDUCATION_SCALE_PERSONAL_REPORT' as const,
  state: 'WITHHELD' as const, mode: 'NONE' as const, message: '本次测评暂不提供个人解释报告。' })

/** Existing respondent authority, scoped to a self execution. Never use library
 * distribution grants or publication rights as personal-report permissions. */
async function readOwn(tx: Prisma.TransactionClient, input: EducationPersonalReportInput) {
  const role = input.product === 'SCHOOL' ? 'STUDENT' : 'TEACHER'
  const rows = await tx.$queryRaw<OwnExecution[]>(Prisma.sql`
    SELECT e.organization_id AS "organizationId", t.resource_key AS "resourceKey",
      t.resource_version AS "resourceVersion", e.runtime_binding_ref AS "attemptId",
      e.relational_assignment_id AS "assignmentId", t.frozen_resource_policy AS policy,
      t.resource_policy_hash AS "policyHash"
    FROM assessment_run_executions e
    JOIN assessment_run_tracks t ON t.organization_id=e.organization_id AND t.run_id=e.run_id AND t.id=e.track_id
    JOIN assessment_runs run ON run.organization_id=e.organization_id AND run.id=e.run_id AND run.status IN ('PUBLISHED','CLOSED')
    JOIN organizations org ON org.id=e.organization_id AND org.status='ACTIVE' AND org.product_domain='SCHOOL'
    JOIN assessment_run_actor_snapshots r ON r.organization_id=e.organization_id AND r.run_id=e.run_id AND r.id=e.respondent_actor_snapshot_id
    JOIN assessment_run_actor_snapshots s ON s.organization_id=e.organization_id AND s.run_id=e.run_id AND s.id=e.subject_actor_snapshot_id
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
    JOIN organization_memberships m ON m.id=r.membership_id AND m.organization_id=r.organization_id AND m.user_id=r.user_id
      AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
    JOIN organization_persona_grants pg ON pg.organization_id=m.organization_id AND pg.membership_id=m.id
      AND pg.id=r.snapshot_payload->>'personaGrantId' AND pg.persona=${role} AND pg.revoked_at IS NULL
    WHERE e.id=${input.executionId} AND e.status='COMPLETED' AND e.runtime_binding_kind='COMPOSITE'
      AND t.resource_family='SCALE' AND r.user_id=${input.actorUserId} AND s.user_id=${input.actorUserId}
      AND r.actor_role=${role} AND s.actor_role=${role} AND r.provenance_kind='ORG_MEMBER'
      AND a.status='COMPLETED' AND a.relationship_kind='SELF'
      AND a.respondent_user_id=${input.actorUserId} AND a.subject_user_id=${input.actorUserId}
      AND ${currentRunPopulationAuthoritySql(Prisma.sql`e.id`, 'REPORT_READ')}
      AND NOT EXISTS(SELECT 1 FROM organization_access_denies d WHERE d.organization_id=e.organization_id
        AND d.user_id=${input.actorUserId} AND d.lifted_at IS NULL
        AND d.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ'))
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  if (!await resolveEducationProductMemberScope({ actorUserId: input.actorUserId,
    organizationId: row.organizationId, product: input.product === 'SCHOOL' ? 'HUISCHOOL' : 'HUITEACHER' }, tx)) return null
  return row
}

/** Null means this is not an accessible fixed-version education self lane; legacy callers
 * continue their existing independent authorization path. No route accepts
 * version, source, audience, hashes or a projected report from the client.
 * The public publication/START readiness gate remains outside this reader. */
export async function readEducationRespondentScaleReport(input: EducationPersonalReportInput) {
  return prisma.$transaction(async tx => {
    // One execution ID anchors the explicit joins. Bound planner search only
    // inside this report transaction; PostgreSQL restores the pooled session
    // setting at commit/rollback. Keep both current-authority reads unchanged.
    await tx.$executeRaw`SET LOCAL join_collapse_limit = 1`
    const own = await readOwn(tx, input)
    if (!own || !(own.resourceKey.startsWith('library-scale:') || own.resourceKey.startsWith('private-scale:'))) return null
    if (canonicalHash(own.policy) !== own.policyHash) return hidden()
    const source = await readEducationScaleExecutionSource(tx, {
      product: input.product, organizationId: own.organizationId, resourceKey: own.resourceKey, resourceVersion: own.resourceVersion, purpose: 'HISTORY',
    })
    const contract = validateResultDisclosureContract(own.policy.resultDisclosure)
    if (canonicalHash(contract) !== canonicalHash(source.resultDisclosure)) return hidden()
    const rule = contract.audiences.RESPONDENT
    // This stage deliberately does not infer subject/observer read rights.
    if (rule.mode !== 'INDIVIDUAL_SUMMARY') return withheld()
    if (own.policy.analysisMode !== 'INDIVIDUAL_ONLY') return hidden()
    const parent = await tx.compositeAssessmentAttempt.findUnique({ where: { id: own.attemptId } })
    if (!parent || parent.status !== 'COMPLETED' || parent.compositeAssessmentId !== source.compositeId
      || parent.userId !== input.actorUserId || parent.respondentUserId !== input.actorUserId
      || parent.subjectUserId !== input.actorUserId || parent.assignmentRef !== own.assignmentId
      || !parent.frozenActiveSlotSetEncrypted || !parent.frozenActiveSlotSetHash) return hidden()
    const children = await tx.assessment.findMany({ where: { compositeAttemptId: parent.id,
      compositeItemId: source.compositeItemId, scaleId: source.scaleId, attemptEpoch: parent.attemptEpoch } })
    if (children.length !== 1) return hidden()
    const child = children[0]
    if (child.status !== 'COMPLETED' || child.userId !== input.actorUserId
      || child.respondentUserId !== input.actorUserId || child.subjectUserId !== input.actorUserId
      || !child.submissionId || !child.runtimeSnapshotEncrypted || !child.compiledRuntimeHash
      || !child.frozenAdmissionSnapshotHash || !child.compositeAttemptId || !child.compositeItemId) return hidden()
    const finalRows = await tx.assessmentUnitSnapshot.findMany({ where: { compositeAttemptId: parent.id,
      attemptEpoch: parent.attemptEpoch, slotKey: compositeItemSlotKey(child.compositeItemId, 'SCALE'),
      unitType: 'SCALE', terminalState: 'COMPLETED', payloadKind: 'UNIT_RESULT' } })
    if (finalRows.length !== 1) return hidden()
    const finalUnit = finalRows[0]
    if (!finalUnit.canonicalResultEncrypted || !finalUnit.compositeAttemptId || !finalUnit.sourceSubmissionId
      || !finalUnit.sourceDefinitionHash || !finalUnit.compiledRuntimeHash) return hidden()
    const runtime = await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted, tx)
    if (runtime.sourceDefinitionHash !== source.sourceDefinitionHash) return hidden()
    const admission = await loadStoredVersionedUnitAdmission(child, 'Report admission unavailable', tx)
    const slotSet = await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted, tx)
    // Reuse immutable facts within this authorized transaction only. Both views
    // retain independent reconstruction and canonical consistency checks.
    const reader = await createStoredScaleFactsReader([child], tx)
    const [canonical] = await loadStoredCanonicalUnitResults([finalUnit.canonicalResultEncrypted], tx, [], reader)
    if (canonical.core.unitType !== 'SCALE' || canonical.core.sourceDefinitionHash !== runtime.sourceDefinitionHash
      || canonical.core.compiledRuntimeHash !== runtime.compiledRuntime.compiledRuntimeHash
      || canonical.core.contextHash !== (parent.contextSnapshotHash ?? null)
      || canonical.persistenceProvenance.sourceType !== 'ASSESSMENT'
      || canonical.persistenceProvenance.sourceAttemptId !== child.id
      || canonical.persistenceProvenance.sourceSubmissionId !== child.submissionId) return hidden()
    const storedResult = await resolveStoredScaleResult(child.result, { record: child, db: tx, reader })
    const report = buildScaleUnitReport({ assessmentId: child.id, itemId: child.compositeItemId,
      scaleId: child.scaleId, scaleCode: runtime.instrumentKey, scaleName: admission?.scale?.name ?? source.resourceEntry.title,
      result: storedResult, completedAt: child.completedAt, totalTime: child.totalTime })
    if (!report.result || report.decryptError) return hidden()
    // Canonical FINAL is the scoring authority. The display result may not
    // contradict it, even when legacy/full storage rather than compact facts is used.
    if (canonical.core.metrics.length !== report.result.scores.length
      || report.result.scores.some(score => !canonical.core.metrics.some(metric => metric.key === score.key
        && metric.value === score.value && metric.quality === score.status))
      || canonical.core.quality.status !== report.result.quality.status
      || (canonical.bundleBridge && canonicalHash(canonical.bundleBridge.rawScoreFeedback ?? []) !== canonicalHash(report.result.rawScoreFeedback ?? []))) return hidden()
    const full = DISCLOSURE_PRESETS.FULL_REPORT()
    const projected = projectEducationScaleIndividualReport({ report, frozenSnapshot: runtime,
      persistedFacts: { actorUserId: input.actorUserId, resultDisclosureHash: canonicalHash(contract), admission, slotSet,
        ...(source.sourceKind === 'LIBRARY' ? { approvedLibrarySource: { approvedSnapshotHash: source.approvedSnapshotHash,
          sourceDefinitionHash: source.sourceDefinitionHash, resultDisclosureHash: canonicalHash(source.resultDisclosure) } }
          : { privateVersionSource: { versionId: source.origin.versionId, contentHash: source.origin.contentHash,
            sourceDefinitionHash: source.sourceDefinitionHash, resultDisclosureHash: canonicalHash(source.resultDisclosure) } }),
        parent: { id: parent.id, attemptEpoch: parent.attemptEpoch, frozenActiveSlotSetHash: parent.frozenActiveSlotSetHash },
        assessment: { id: child.id, scaleId: child.scaleId, userId: child.userId, compositeAttemptId: child.compositeAttemptId,
          compositeItemId: child.compositeItemId, attemptEpoch: child.attemptEpoch, status: child.status,
          submissionId: child.submissionId, compiledRuntimeHash: child.compiledRuntimeHash, frozenAdmissionSnapshotHash: child.frozenAdmissionSnapshotHash },
        finalUnit: { ...finalUnit, compositeAttemptId: finalUnit.compositeAttemptId, sourceSubmissionId: finalUnit.sourceSubmissionId,
          sourceDefinitionHash: finalUnit.sourceDefinitionHash, compiledRuntimeHash: finalUnit.compiledRuntimeHash } },
      resultAudience: 'RESPONDENT', resultDisclosure: contract,
      context: { principalId: input.actorUserId, audience: 'respondent', purpose: 'report',
        accessDecision: { source: 'RESOURCE_AUTHORIZATION', allowed: true, capabilities: full },
        frozenPolicy: runtime.schemaVersion === 2 ? scaleProjectionPolicyFromCompiled(runtime.compiledPolicy) : educationLibraryV1ProjectionPolicy(), currentRestrictions: full,
        relationalDisposition: 'INDIVIDUAL_ALLOWED' } })
    // Recheck current task/report access after every asynchronous materialization.
    const current = await readOwn(tx, input)
    if (!current || current.attemptId !== own.attemptId || current.assignmentId !== own.assignmentId
      || current.policyHash !== own.policyHash || canonicalHash(current.policy) !== current.policyHash
      || current.resourceKey !== own.resourceKey || current.resourceVersion !== own.resourceVersion) return hidden()
    if (projected.state !== 'PROJECTED') return withheld()
    if (source.sourceKind === 'AUTHOR_PRIVATE') {
      // The complete frozen definition matches the independently verified
      // version source; its report refs, not stimulus refs or author edit URLs,
      // are the extra ceiling on the already audience/metric-filtered images.
      const refs = privateToolImageReferences('SCALE', runtime.definition).reports
      for (const unit of projected.unitReports) {
        if ('rawScoreFeedback' in unit && unit.rawScoreFeedback?.some((feedback: NonNullable<ScaleUnitReport['rawScoreFeedback']>[number]) => feedback.images?.some(image =>
          !refs.some(ref => ref.assetId === image.asset.assetId && ref.contentHash === image.asset.contentHash
            && ref.mimeType === image.asset.mimeType)))) return hidden()
      }
    }
    return { schemaVersion: 1 as const, kind: 'EDUCATION_SCALE_PERSONAL_REPORT' as const,
      state: 'READY' as const, mode: 'INDIVIDUAL_SUMMARY' as const, message: '以下反馈来自本次作答使用的固定量表版本。', unitReports: projected.unitReports }
  })
}
