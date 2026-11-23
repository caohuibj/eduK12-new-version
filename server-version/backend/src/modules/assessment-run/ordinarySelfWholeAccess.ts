import { Prisma, type CompositeAssessmentAttempt, type CompositeReportJob } from '@prisma/client'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { privateToolFail } from '../education-tools/private-tool.contracts'
import { boundCompositeConsentSql } from './boundCompositeContinuation'
import type { RunStartPreflight } from './resourceBoundary'
import type { WholeReceiptRow } from '../composite/whole-receipt-recovery'

export type OrdinarySelfWholeProduct = 'SCHOOL' | 'TEACHER'
const roleFor = (product: OrdinarySelfWholeProduct) => product === 'SCHOOL' ? 'STUDENT' : 'TEACHER'

export const ordinarySelfWholeEnabled = () => process.env.ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED !== 'false'
  && process.env.ASSESSMENT_REPORT_ASYNC_ENABLED === 'true' && process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED === 'true'

export function publishedSelfScaleTrackSql(track: Prisma.Sql, product: OrdinarySelfWholeProduct) {
  const variant = roleFor(product) + ':SELF'
  const target = Prisma.sql`${track}.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'`
  return Prisma.sql`(${track}.resource_family='BUNDLE' AND ${track}.resource_version='1.0.0'
    AND ${track}.resource_key LIKE ${'education-composition:' + product + ':%:' + variant + ':1.0.0'}
    AND ${track}.frozen_resource_policy#>>'{educationComposition,origin,variantKey}'=${variant}
    AND ${track}.frozen_resource_policy#>>'{runtimeLaunchTarget,kind}'='COMPOSITE'
    AND NOT EXISTS (SELECT 1 FROM composite_form_sections section WHERE section.composite_assessment_id=${target})
    AND NOT EXISTS (SELECT 1 FROM composite_assessment_items item
      WHERE item.composite_assessment_id=${target} AND (item.type<>'SCALE' OR NOT item.required)))`
}

type Locator = { attemptId: string; mode?: 'full' | 'progress' } | { executionId: string; schoolPath?: { organizationId: string; runId: string; courseId: string } }
export type OrdinarySelfWholeBinding = WholeReceiptRow & {
  kind: 'bound'
  assignmentRef: string
  executionStatus: string
  parentStatus: CompositeAssessmentAttempt['status']
  jobStatus: CompositeReportJob['status'] | null
}
type StartProof = { kind: 'start'; preflight: RunStartPreflight }
type Row = Omit<OrdinarySelfWholeBinding, 'id' | 'kind'> & {
  id: string | null
  opened: boolean
  allowed: boolean
  stopped: boolean
  preflight: RunStartPreflight | null
}

export function readOrdinarySelfWholeAccess(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>, product: OrdinarySelfWholeProduct, userId: string, locator: { attemptId: string; mode?: 'full' | 'progress' },
): Promise<OrdinarySelfWholeBinding | null>
export function readOrdinarySelfWholeAccess(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>, product: OrdinarySelfWholeProduct, userId: string, locator: Extract<Locator, { executionId: string }>,
): Promise<OrdinarySelfWholeBinding | StartProof | null>
export async function readOrdinarySelfWholeAccess(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>, product: OrdinarySelfWholeProduct, userId: string, locator: Locator,
): Promise<OrdinarySelfWholeBinding | StartProof | null> {
  const query = ordinarySelfWholeAccessQuery(product, userId, locator)
  if (!query) return null
  const [row] = await db.$queryRaw<Row[]>(query)
  if (row?.preflight) return { kind: 'start', preflight: row.preflight }
  if (!assertOrdinarySelfWholeBound(row)) return null
  return { ...row, id: row.id, kind: 'bound' }
}

type BoundAuthority = Pick<Row, 'id' | 'opened' | 'allowed' | 'stopped'>
export function assertOrdinarySelfWholeBound<T extends BoundAuthority>(row: T | undefined | null): row is T & { id: string } {
  if (!row?.opened || !row.id) return false
  if (!row.allowed) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '当前测评作答不可访问', 404)
  if (row.stopped) privateToolFail('PRIVATE_COMPOSITION_COLLECTION_UNAVAILABLE',403)
  return true
}

export function ordinarySelfWholeAccessQuery(product: OrdinarySelfWholeProduct, userId: string, locator: Locator) {
  // The per-unit compatibility writer retains its historical live authority.
  if (process.env.ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED === 'false') return null
  const wholeDelivery = process.env.ASSESSMENT_REPORT_ASYNC_ENABLED === 'true'
    && process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED === 'true'
  const school = product === 'SCHOOL'
  const role = school ? 'STUDENT' : 'TEACHER'
  const variant = role + ':SELF'
  const byExecution = 'executionId' in locator
  const progressOnly = !byExecution && locator.mode === 'progress'
  const path = byExecution ? locator.schoolPath : undefined
  const sameRun = Prisma.sql`link.organization_id=e.organization_id AND link.run_id=e.run_id`
  const schoolLink = Prisma.sql`SELECT 1 FROM campus_activity_runs link WHERE ${sameRun}
    ${path ? Prisma.sql`AND link.course_id=${path.courseId}` : Prisma.empty}`
  const teacherLink = Prisma.sql`SELECT 1 FROM huiteacher_evaluation_run_links link WHERE ${sameRun}`
  return Prisma.sql`
    WITH target_exec AS MATERIALIZED (
      SELECT e.*
      FROM assessment_run_executions e
      WHERE ${byExecution ? Prisma.sql`e.id=${locator.executionId}` : Prisma.sql`e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=${locator.attemptId}`}
        ${path ? Prisma.sql`AND e.organization_id=${path.organizationId} AND e.run_id=${path.runId}` : Prisma.empty}
        AND e.subject_actor_snapshot_id=e.respondent_actor_snapshot_id
      LIMIT 1
    ),
    target_track AS MATERIALIZED (
      SELECT t.*
      FROM target_exec e
      JOIN assessment_run_tracks t ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
      WHERE t.resource_family='BUNDLE' AND t.resource_version='1.0.0'
        AND t.resource_key LIKE ${'education-composition:' + product + ':%:' + variant + ':1.0.0'}
        AND t.frozen_resource_policy#>>'{educationComposition,origin,variantKey}'=${variant}
        AND t.frozen_resource_policy#>>'{runtimeLaunchTarget,kind}'='COMPOSITE'
        AND NOT EXISTS (SELECT 1 FROM composite_form_sections section
          WHERE section.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}')
        AND EXISTS (${school ? schoolLink : teacherLink}) AND NOT EXISTS (${school ? teacherLink : schoolLink})
    )
    SELECT e.status AS "executionStatus", a.id AS "assignmentRef",
      jsonb_build_object(
        'assignmentId', a.id, 'status', a.status, 'consentId', a.consent_id,
        'subjectUserId', a.subject_user_id, 'respondentUserId', a.respondent_user_id, 'respondentRole', a.respondent_role,
        'createdByUserId', a.created_by_user_id, 'relationshipKind', a.relationship_kind, 'visibilityPolicyKey', a.visibility_policy_key,
        'policyDomain', a.policy_domain, 'resourceKind', a.resource_kind, 'resourceKey', a.resource_key, 'resourceVersion', a.resource_version
      ) AS "currentAssignment",
      p.id, p.user_id AS "userId",
      NULL::text AS "recoveryTokenHash", p.attempt_epoch AS epoch, p.status AS "parentStatus", p.receipt_only AS "receiptOnly",
      p.frozen_active_slot_set_hash AS "slotHash", j.slot_set_hash AS "jobSlot",
      j.whole_submission_id AS "wholeSubmissionId", j.whole_payload_hash AS "payloadHash",
      j.whole_accepted_at AS "acceptedAt", j.status AS state, j.status AS "jobStatus",
      e.runtime_binding_ref IS NOT NULL AS opened,
      (e.status='COMPLETED' AND a.status='COMPLETED' AND p.status='COMPLETED'
        OR e.status='STARTED' AND ((a.status='STARTED' AND p.status='IN_PROGRESS')
          OR (a.status='COMPLETED' AND p.status='COMPLETED' AND a.completed_at=p.completed_at
            AND j.slot_set_hash=p.frozen_active_slot_set_hash AND j.whole_submission_id IS NOT NULL
            AND j.whole_payload_hash IS NOT NULL AND j.whole_accepted_at IS NOT NULL))
          AND ${boundCompositeConsentSql(Prisma.sql`a`, Prisma.sql`p`)}) AS allowed,
      CASE WHEN ${!school} AND e.status='STARTED' AND p.id IS NOT NULL
        AND EXISTS (SELECT 1 FROM scale_library_emergency_stops LIMIT 1) THEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.training_content_binding->'units') unit
        JOIN scale_library_emergency_stops stop ON
          (stop.target_kind='RELEASE' AND stop.target_id IN
            (unit#>>'{measurement,releaseId}',unit#>>'{source,educationNative,sourceMeasurementReleaseId}'))
          OR (stop.target_kind='TRAINING_SCALE' AND unit->>'family'='SCALE' AND stop.target_id=unit#>>'{source,id}')
      ) ELSE FALSE END AS stopped,
      ${byExecution ? Prisma.sql`CASE WHEN e.status='ASSIGNED' AND e.runtime_binding_kind IS NULL
        AND e.runtime_binding_ref IS NULL AND a.status='OPEN' THEN jsonb_build_object(
          'runtimeBindingKind',NULL,'runtimeBindingRef',NULL,'respondentUserId',a.respondent_user_id,
          'organizationId',e.organization_id,'runId',e.run_id,
          'hasCampusActivity',${school},'hasHuiteacherLink',${!school},
          'publishedSelfScale',${ordinarySelfWholeEnabled()} AND ${publishedSelfScaleTrackSql(Prisma.sql`t`,product)},
          'compositionStartCompositeId',t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}',
          'compositionStartTrack',jsonb_build_object('policy',t.frozen_resource_policy,'policyHash',t.resource_policy_hash,
            'organizationId',t.organization_id,'key',t.resource_key,'version',t.resource_version)) ELSE NULL END` : Prisma.sql`NULL::jsonb`} AS preflight
    FROM target_exec e
    JOIN target_track t ON TRUE
    JOIN assessment_run_actor_snapshots actor ON actor.id=e.respondent_actor_snapshot_id
      AND actor.run_id=e.run_id AND actor.organization_id=e.organization_id AND actor.user_id=${userId} AND actor.actor_role=${role}
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
      AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
      AND a.subject_user_id=actor.user_id AND a.respondent_user_id=actor.user_id
      AND a.subject_role=${role} AND a.respondent_role=${role} AND a.relationship_kind='SELF' AND a.perspective='SELF_REPORT'
    LEFT JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
      ${byExecution ? Prisma.empty : Prisma.sql`AND p.id=${locator.attemptId}`}
      AND p.assignment_ref=a.id AND p.episode_id=a.episode_id AND p.user_id=actor.user_id
      AND p.subject_user_id=actor.user_id AND p.respondent_user_id=actor.user_id AND p.respondent_type='SELF'
      AND p.delivery_mode='FINAL_ONLY' AND p.runtime_generation='UNIFIED_V1'
      AND p.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
      ${progressOnly
        ? Prisma.sql`AND p.training_content_binding_hash IS NOT NULL`
        : Prisma.sql`AND p.training_content_binding#>>'{educationComposition,origin,variantKey}'=${variant}
      AND p.training_content_binding#>>'{educationComposition,manifestHash}'=t.frozen_resource_policy#>>'{educationComposition,manifestHash}'
      AND p.training_content_binding->>'attemptId'=p.id
      AND p.training_content_binding->'epoch'=to_jsonb(p.attempt_epoch)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.training_content_binding->'units') unit WHERE unit->>'family'<>'SCALE')`}
      AND (${wholeDelivery} OR p.async_report_epoch=p.attempt_epoch)
    LEFT JOIN composite_report_jobs j ON j.attempt_id=p.id AND j.attempt_epoch=p.attempt_epoch
    LIMIT 1
  `
}
