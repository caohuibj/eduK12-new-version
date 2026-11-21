import { Prisma, type CompositeAssessmentAttempt, type CompositeReportJob } from '@prisma/client'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { privateToolFail } from '../education-tools/private-tool.contracts'
import { boundCompositeConsentSql } from './boundCompositeContinuation'
import type { RunStartPreflight } from './resourceBoundary'
import type { WholeReceiptRow } from '../composite/whole-receipt-recovery'

type Product = 'SCHOOL' | 'TEACHER'
type Locator = { attemptId: string } | { executionId: string; schoolPath?: { organizationId: string; runId: string; courseId: string } }
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
  db: Pick<Prisma.TransactionClient, '$queryRaw'>, product: Product, userId: string, locator: { attemptId: string },
): Promise<OrdinarySelfWholeBinding | null>
export function readOrdinarySelfWholeAccess(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>, product: Product, userId: string, locator: Extract<Locator, { executionId: string }>,
): Promise<OrdinarySelfWholeBinding | StartProof | null>
export async function readOrdinarySelfWholeAccess(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>, product: Product, userId: string, locator: Locator,
): Promise<OrdinarySelfWholeBinding | StartProof | null> {
  // The per-unit compatibility writer retains its historical live authority.
  if (process.env.ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED === 'false') return null
  const wholeDelivery = process.env.ASSESSMENT_REPORT_ASYNC_ENABLED === 'true'
    && process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED === 'true'
  const school = product === 'SCHOOL'
  const role = school ? 'STUDENT' : 'TEACHER'
  const variant = role + ':SELF'
  const byExecution = 'executionId' in locator
  const path = byExecution ? locator.schoolPath : undefined
  const sameRun = Prisma.sql`link.organization_id=e.organization_id AND link.run_id=e.run_id`
  const schoolLink = Prisma.sql`SELECT 1 FROM campus_activity_runs link WHERE ${sameRun}
    ${path ? Prisma.sql`AND link.course_id=${path.courseId}` : Prisma.empty}`
  const teacherLink = Prisma.sql`SELECT 1 FROM huiteacher_evaluation_run_links link WHERE ${sameRun}`
  const [row] = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT e.status AS "executionStatus", a.id AS "assignmentRef", p.id, p.user_id AS "userId",
      NULL::text AS "recoveryTokenHash", p.attempt_epoch AS epoch, p.status AS "parentStatus",
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
      CASE WHEN ${!school} AND e.status='STARTED' AND p.id IS NOT NULL THEN EXISTS (
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
          'compositionStartCompositeId',t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}',
          'compositionStartTrack',jsonb_build_object('policy',t.frozen_resource_policy,'policyHash',t.resource_policy_hash,
            'organizationId',t.organization_id,'key',t.resource_key,'version',t.resource_version)) ELSE NULL END` : Prisma.sql`NULL::jsonb`} AS preflight
    FROM assessment_run_executions e
    JOIN assessment_run_tracks t ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
    JOIN assessment_run_actor_snapshots actor ON actor.id=e.respondent_actor_snapshot_id
      AND actor.run_id=e.run_id AND actor.organization_id=e.organization_id AND actor.user_id=${userId} AND actor.actor_role=${role}
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN'
      AND a.resource_kind=t.resource_family AND a.resource_key=t.resource_key AND a.resource_version=t.resource_version
      AND a.subject_user_id=actor.user_id AND a.respondent_user_id=actor.user_id
      AND a.subject_role=${role} AND a.respondent_role=${role} AND a.relationship_kind='SELF' AND a.perspective='SELF_REPORT'
    LEFT JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref AND e.runtime_binding_kind='COMPOSITE'
      AND p.assignment_ref=a.id AND p.episode_id=a.episode_id AND p.user_id=actor.user_id
      AND p.subject_user_id=actor.user_id AND p.respondent_user_id=actor.user_id AND p.respondent_type='SELF'
      AND p.delivery_mode='FINAL_ONLY' AND p.runtime_generation='UNIFIED_V1'
      AND p.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
      AND p.training_content_binding#>>'{educationComposition,origin,variantKey}'=${variant}
      AND p.training_content_binding#>>'{educationComposition,manifestHash}'=t.frozen_resource_policy#>>'{educationComposition,manifestHash}'
      AND p.training_content_binding->>'attemptId'=p.id
      AND p.training_content_binding->'epoch'=to_jsonb(p.attempt_epoch)
      AND (${wholeDelivery} OR p.async_report_epoch=p.attempt_epoch)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.training_content_binding->'units') unit WHERE unit->>'family'<>'SCALE')
    LEFT JOIN composite_report_jobs j ON j.attempt_id=p.id AND j.attempt_epoch=p.attempt_epoch
    WHERE ${byExecution ? Prisma.sql`e.id=${locator.executionId}` : Prisma.sql`e.runtime_binding_kind='COMPOSITE' AND e.runtime_binding_ref=${locator.attemptId}`}
      ${path ? Prisma.sql`AND e.organization_id=${path.organizationId} AND e.run_id=${path.runId}` : Prisma.empty}
      AND e.subject_actor_snapshot_id=e.respondent_actor_snapshot_id
      AND t.resource_family='BUNDLE' AND t.resource_version='1.0.0'
      AND t.resource_key LIKE ${'education-composition:' + product + ':%:' + variant + ':1.0.0'}
      AND t.frozen_resource_policy#>>'{educationComposition,origin,variantKey}'=${variant}
      AND t.frozen_resource_policy#>>'{runtimeLaunchTarget,kind}'='COMPOSITE'
      AND NOT EXISTS (SELECT 1 FROM composite_form_sections section
        WHERE section.composite_assessment_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}')
      AND EXISTS (${school ? schoolLink : teacherLink}) AND NOT EXISTS (${school ? teacherLink : schoolLink})
    LIMIT 1
  `)
  if (!row) return null
  if (row.preflight) return { kind: 'start', preflight: row.preflight }
  if (!row.opened || !row.id) return null // Other or legacy attempt shapes retain their original authority path.
  if (!row.allowed) throw new InstrumentFinalSubmitError('STALE_ATTEMPT', '当前测评作答不可访问', 404)
  if (row.stopped) privateToolFail('PRIVATE_COMPOSITION_COLLECTION_UNAVAILABLE',403)
  return { ...row, id: row.id, kind: 'bound' }
}
