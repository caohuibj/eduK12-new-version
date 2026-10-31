import {isSelfGroupV2Entry} from '../assessment-policy/self-group-contract'
import {readNativeEducationScaleFeedback} from './education-native-scale-feedback'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { currentRunPopulationAuthoritySql } from '../assessment-run/currentPopulationAuthority'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { readEducationScaleExecutionSource } from '../assessment-run/educationScaleExecutionSource'
import { validateResultDisclosureContract } from '../assessment-policy/result-disclosure'
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
    if (own.policy.analysisMode !== 'INDIVIDUAL_ONLY' && !isSelfGroupV2Entry(source.resourceEntry)) return hidden()
    const parent = await tx.compositeAssessmentAttempt.findUnique({ where: { id: own.attemptId } })
    if (!parent || parent.status !== 'COMPLETED' || parent.compositeAssessmentId !== source.compositeId
      || parent.userId !== input.actorUserId || parent.respondentUserId !== input.actorUserId
      || parent.subjectUserId !== input.actorUserId || parent.assignmentRef !== own.assignmentId
      || !parent.frozenActiveSlotSetEncrypted || !parent.frozenActiveSlotSetHash) return hidden()
    const projected=(await readNativeEducationScaleFeedback(tx,{actorUserId:input.actorUserId,parent,sources:[{
      itemId:source.compositeItemId,scaleId:source.scaleId,title:source.resourceEntry.title,sourceDefinitionHash:source.sourceDefinitionHash,
      resultDisclosure:contract,...(source.sourceKind==='LIBRARY'?{approvedLibrary:{approvedSnapshotHash:source.approvedSnapshotHash}}
        :{privateVersion:{versionId:source.origin.versionId,contentHash:source.origin.contentHash}}),
    }]})).get(source.compositeItemId)
    // Recheck current task/report access after every asynchronous materialization.
    const current = await readOwn(tx, input)
    if (!current || current.attemptId !== own.attemptId || current.assignmentId !== own.assignmentId
      || current.policyHash !== own.policyHash || canonicalHash(current.policy) !== current.policyHash
      || current.resourceKey !== own.resourceKey || current.resourceVersion !== own.resourceVersion) return hidden()
    if (!projected||projected.state !== 'PROJECTED') return withheld()
    return { schemaVersion: 1 as const, kind: 'EDUCATION_SCALE_PERSONAL_REPORT' as const,
      state: 'READY' as const, mode: 'INDIVIDUAL_SUMMARY' as const, message: '以下反馈来自本次作答使用的固定量表版本。', unitReports: projected.unitReports }
  })
}
