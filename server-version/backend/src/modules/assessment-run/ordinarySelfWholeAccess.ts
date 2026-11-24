import { Prisma, type CompositeAssessmentAttempt, type CompositeReportJob } from '@prisma/client'
import { prisma } from '../../config/database'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
import { privateToolFail } from '../education-tools/private-tool.contracts'
import { boundCompositeConsentSql } from './boundCompositeContinuation'
import type { RunStartPreflight } from './resourceBoundary'
import type { WholeReceiptRow } from '../composite/whole-receipt-recovery'

export type OrdinarySelfWholeProduct = 'SCHOOL' | 'TEACHER'
const roleFor = (product: OrdinarySelfWholeProduct) => product === 'SCHOOL' ? 'STUDENT' : 'TEACHER'

const RUN_PRODUCT_CACHE_MAX = 2048
const immutableRunProductCache = new Map<string, OrdinarySelfWholeProduct>()
export const resetOrdinarySelfWholeRunProductCacheForTests = () => {
  immutableRunProductCache.clear()
}

const resolveImmutableRunProduct = async (
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  organizationId: string,
  runId: string,
): Promise<OrdinarySelfWholeProduct | null> => {
  const isRootDb = db === (prisma as unknown as Pick<Prisma.TransactionClient, '$queryRaw'>)
  const key = `${organizationId}:${runId}`
  if (isRootDb) {
    const cached = immutableRunProductCache.get(key)
    if (cached) {
      immutableRunProductCache.delete(key)
      immutableRunProductCache.set(key, cached)
      return cached
    }
  }
  const [link] = await db.$queryRaw<Array<{ hasSchool: boolean; hasTeacher: boolean }>>(Prisma.sql`
    SELECT
      EXISTS (SELECT 1 FROM campus_activity_runs WHERE organization_id=${organizationId} AND run_id=${runId}) AS "hasSchool",
      EXISTS (SELECT 1 FROM huiteacher_evaluation_run_links WHERE organization_id=${organizationId} AND run_id=${runId}) AS "hasTeacher"
  `)
  const resolved: OrdinarySelfWholeProduct | null = link?.hasSchool && !link?.hasTeacher
    ? 'SCHOOL'
    : link?.hasTeacher && !link?.hasSchool
      ? 'TEACHER'
      : null
  if (resolved && isRootDb) {
    if (immutableRunProductCache.size >= RUN_PRODUCT_CACHE_MAX) {
      const oldest = immutableRunProductCache.keys().next().value
      if (oldest) immutableRunProductCache.delete(oldest)
    }
    immutableRunProductCache.set(key, resolved)
  }
  return resolved
}

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
  v2FinalCommitted?: boolean
}
type StartProof = { kind: 'start'; preflight: RunStartPreflight }
type Row = Omit<OrdinarySelfWholeBinding, 'id' | 'kind'> & {
  id: string | null
  opened: boolean
  allowed: boolean
  stopped: boolean
  preflight: RunStartPreflight | null
}

export type OrdinarySelfWholeProgressBinding = {
  kind: 'progress'
  id: string
  epoch: number
  receiptOnly: boolean
  parentStatus: CompositeAssessmentAttempt['status']
  wholeSubmissionId: string | null
  jobStatus: CompositeReportJob['status'] | null
  v2FinalCommitted?: boolean
  executionStatus: string
}

type ProgressFastRow = {
  id: string
  epoch: number
  receiptOnly: boolean | null
  parentStatus: CompositeAssessmentAttempt['status']
  slotHash: string | null
  assignmentRef: string | null
  jobSlot: string | null
  wholeSubmissionId: string | null
  payloadHash: string | null
  acceptedAt: Date | null
  jobStatus: CompositeReportJob['status'] | null
  v2FinalCommitted?: boolean
  executionStatus: string
  assignmentStatus: string
  consentId: string | null
  organizationId: string
  runId: string
  isSelfExec: boolean
  execAssignmentId: string | null
  needsStopCheck: boolean
}

/** Lightweight 4-table PK/UK progress poll for already-accepted ordinary SELF whole
 * submissions. Eliminates the 10-table CTE planning overhead (~6.1ms/call, 1,533
 * planning buffers) on high-frequency /whole/progress polls while falling back to the
 * full authority query for pre-submit, consent-bound, transitional, or emergency-stop states. */
export async function readOrdinarySelfWholeProgress(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  product: OrdinarySelfWholeProduct,
  userId: string,
  attemptId: string,
): Promise<OrdinarySelfWholeBinding | OrdinarySelfWholeProgressBinding | null> {
  if (process.env.ASSESSMENT_SCALE_COLLECTION_BATCH_ENABLED === 'false') return null
  const [row] = await db.$queryRaw<ProgressFastRow[]>(Prisma.sql`
    SELECT p.id, p.attempt_epoch AS epoch, p.receipt_only AS "receiptOnly",
      p.status AS "parentStatus", p.frozen_active_slot_set_hash AS "slotHash",
      p.assignment_ref AS "assignmentRef",
      COALESCE(j.slot_set_hash, f.slot_set_hash) AS "jobSlot",
      COALESCE(j.whole_submission_id, f.submission_id) AS "wholeSubmissionId",
      COALESCE(j.whole_payload_hash, f.payload_hash) AS "payloadHash",
      COALESCE(j.whole_accepted_at, f.completed_at) AS "acceptedAt",
      j.status AS "jobStatus",
      (f.attempt_id IS NOT NULL) AS "v2FinalCommitted",
      e.status AS "executionStatus", a.status AS "assignmentStatus", a.consent_id AS "consentId",
      e.organization_id AS "organizationId", e.run_id AS "runId",
      (e.subject_actor_snapshot_id = e.respondent_actor_snapshot_id) AS "isSelfExec",
      e.relational_assignment_id AS "execAssignmentId",
      ${product === 'TEACHER'
        ? Prisma.sql`(e.status = 'STARTED' AND EXISTS (SELECT 1 FROM scale_library_emergency_stops LIMIT 1))`
        : Prisma.sql`FALSE`} AS "needsStopCheck"
    FROM composite_assessment_attempts p
    JOIN assessment_run_executions e
      ON e.runtime_binding_kind = 'COMPOSITE' AND e.runtime_binding_ref = p.id
    JOIN relational_assessment_assignments a
      ON a.id = e.relational_assignment_id
      AND a.subject_user_id = ${userId}
      AND a.respondent_user_id = ${userId}
      AND a.relationship_kind = 'SELF'
      AND a.policy_domain = 'ORGANIZATION_RUN'
    LEFT JOIN composite_report_jobs j
      ON j.attempt_id = p.id AND j.attempt_epoch = p.attempt_epoch
    LEFT JOIN composite_attempt_finals f
      ON f.attempt_id = p.id AND f.attempt_epoch = p.attempt_epoch
    WHERE p.id = ${attemptId}
      AND p.user_id = ${userId}
      AND p.subject_user_id = ${userId}
      AND p.respondent_user_id = ${userId}
      AND p.respondent_type = 'SELF'
      AND p.delivery_mode = 'FINAL_ONLY'
      AND p.runtime_generation = 'UNIFIED_V1'
      AND p.training_content_binding_hash IS NOT NULL
    LIMIT 1
  `)
  const steadyAcceptedState = Boolean(
    row
    && row.isSelfExec
    && !row.needsStopCheck
    && !row.consentId
    && row.assignmentRef
    && row.execAssignmentId === row.assignmentRef
    && row.wholeSubmissionId
    && row.payloadHash
    && row.acceptedAt
    && row.slotHash
    && row.jobSlot === row.slotHash
    && (
      (row.executionStatus === 'COMPLETED' && row.assignmentStatus === 'COMPLETED' && row.parentStatus === 'COMPLETED')
      || (row.executionStatus === 'STARTED' && row.assignmentStatus === 'STARTED' && row.parentStatus === 'IN_PROGRESS')
    ),
  )
  if (steadyAcceptedState && row) {
    const runProduct = await resolveImmutableRunProduct(db, row.organizationId, row.runId)
    if (runProduct === product) {
      return {
        kind: 'progress',
        id: row.id,
        epoch: row.epoch,
        receiptOnly: Boolean(row.receiptOnly),
        parentStatus: row.parentStatus,
        wholeSubmissionId: row.wholeSubmissionId,
        jobStatus: row.jobStatus,
        ...(row.v2FinalCommitted ? { v2FinalCommitted: true } : {}),
        executionStatus: row.executionStatus,
      }
    }
    return null
  }
  return readOrdinarySelfWholeAccess(db, product, userId, { attemptId, mode: 'progress' })
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
      p.frozen_active_slot_set_hash AS "slotHash",
      COALESCE(j.slot_set_hash, f.slot_set_hash) AS "jobSlot",
      COALESCE(j.whole_submission_id, f.submission_id) AS "wholeSubmissionId",
      COALESCE(j.whole_payload_hash, f.payload_hash) AS "payloadHash",
      COALESCE(j.whole_accepted_at, f.completed_at) AS "acceptedAt",
      COALESCE(j.status::text, CASE WHEN f.attempt_id IS NOT NULL THEN 'READY' END) AS state,
      j.status AS "jobStatus",
      (f.attempt_id IS NOT NULL) AS "v2FinalCommitted",
      e.runtime_binding_ref IS NOT NULL AS opened,
      (e.status='COMPLETED' AND a.status='COMPLETED' AND p.status='COMPLETED'
        OR e.status='STARTED' AND ((a.status='STARTED' AND p.status='IN_PROGRESS')
          OR (a.status='COMPLETED' AND p.status='COMPLETED' AND a.completed_at=p.completed_at
            AND j.slot_set_hash=p.frozen_active_slot_set_hash AND j.whole_submission_id IS NOT NULL
            AND j.whole_payload_hash IS NOT NULL AND j.whole_accepted_at IS NOT NULL))
          AND ${boundCompositeConsentSql(Prisma.sql`a`, Prisma.sql`p`)}) AS allowed,
      CASE WHEN ${!school} AND e.status='STARTED' AND p.id IS NOT NULL
        AND EXISTS (SELECT 1 FROM scale_library_emergency_stops LIMIT 1) THEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN p.training_content_binding->>'schemaVersion'='2' AND NOT (p.training_content_binding ? 'units')
            THEN COALESCE((SELECT ca.training_content_snapshot->'units' FROM composite_assessments ca WHERE ca.id=p.composite_assessment_id),'[]'::jsonb)
            ELSE p.training_content_binding->'units'
          END
        ) unit
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
        : Prisma.sql`AND (
          CASE WHEN p.training_content_binding->>'schemaVersion'='2' AND NOT (p.training_content_binding ? 'units') THEN
            p.publication_hash IS NOT NULL
            AND p.training_content_binding_hash IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM composite_assessments ca WHERE ca.id=p.composite_assessment_id
                AND ca.training_content_snapshot_hash ~ '^[a-f0-9]{64}$'
                AND ca.training_content_snapshot#>>'{educationBinding,origin,variantKey}'=${variant}
                AND ca.training_content_snapshot#>>'{educationBinding,origin,versionId}'=t.frozen_resource_policy#>>'{educationComposition,origin,versionId}'
                AND ca.training_content_snapshot#>>'{educationBinding,origin,contentHash}'=t.frozen_resource_policy#>>'{educationComposition,origin,contentHash}'
                AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(ca.training_content_snapshot->'units') unit WHERE unit->>'family'<>'SCALE')
            )
          ELSE
            p.training_content_binding#>>'{educationComposition,origin,variantKey}'=${variant}
            AND p.training_content_binding#>>'{educationComposition,manifestHash}'=t.frozen_resource_policy#>>'{educationComposition,manifestHash}'
            AND p.training_content_binding->>'attemptId'=p.id
            AND p.training_content_binding->'epoch'=to_jsonb(p.attempt_epoch)
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.training_content_binding->'units') unit WHERE unit->>'family'<>'SCALE')
          END
        )`}
      AND (${wholeDelivery} OR p.async_report_epoch=p.attempt_epoch OR p.publication_hash IS NOT NULL)
    LEFT JOIN composite_report_jobs j ON j.attempt_id=p.id AND j.attempt_epoch=p.attempt_epoch
    LEFT JOIN composite_attempt_finals f ON f.attempt_id=p.id AND f.attempt_epoch=p.attempt_epoch
    LIMIT 1
  `
}
