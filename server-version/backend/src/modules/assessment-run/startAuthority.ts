import { ordinarySelfWholeEnabled, publishedSelfScaleTrackSql } from './ordinarySelfWholeAccess'
import {privateFormTrackIdentitySql} from './educationPrivateFormIdentitySql'
import {educationCompositionTrackIdentitySql} from './educationCompositionIdentitySql'
import {privateScaleRegistryIdentitySql} from './educationPrivateScaleIdentitySql'
import { Prisma, type CompositeAssessmentAttempt } from '@prisma/client'
import { currentWindowSql } from './currentActorAuthority'
import {
  buildDecomposedSingleExecutionAuthoritySql,
  currentRunPopulationAuthoritySql,
  type RunPopulationProductScope,
  type SingleExecutionAuthorityEnvelope,
} from './currentPopulationAuthority'
import { applyBoundedPlannerControls } from './plannerBound'
import { RunStartAdmissionError } from './startAdmission'

export type StartAuthorityKnownEnvelope = SingleExecutionAuthorityEnvelope & {
  intakeDeadline: Date | null
  hasCampusActivity?: boolean
  hasHuiteacherLink?: boolean
}

const buildTargetedEducationLibrarySql = (envelope: StartAuthorityKnownEnvelope): Prisma.Sql | null => {
  const key = envelope.trackResourceKey
  const isSchoolOnly = envelope.hasCampusActivity === true && envelope.hasHuiteacherLink === false
  const isTeacherOnly = envelope.hasHuiteacherLink === true && envelope.hasCampusActivity === false
  if (key.startsWith('education-composition:')) {
    if (!isSchoolOnly && !isTeacherOnly) return null
    return Prisma.sql`EXISTS (
      SELECT 1 FROM assessment_run_tracks t
      WHERE t.id = ${envelope.trackId}
        AND t.organization_id = ${envelope.organizationId}
        AND t.run_id = ${envelope.runId}
        AND ${educationCompositionTrackIdentitySql({
          track: Prisma.sql`t`,
          organizationId: Prisma.sql`${envelope.organizationId}`,
          product: isSchoolOnly ? 'SCHOOL' : 'TEACHER',
        })}
    )`
  }
  if (key.startsWith('education-assessment:')) {
    if (!isSchoolOnly && !isTeacherOnly) return null
    const product = isSchoolOnly ? 'SCHOOL' : 'TEACHER'
    return Prisma.sql`EXISTS (
      SELECT 1 FROM assessment_run_tracks t
      JOIN education_assessment_deliveries delivery
        ON delivery.organization_id = t.organization_id
        AND delivery.family = t.resource_family
        AND delivery.product = ${product}
        AND t.resource_version = '1.0.0'
        AND t.resource_key = ('education-assessment:' || delivery.product || ':' || delivery.organization_id || ':' || delivery.id)
        AND delivery.runtime_composite_id = t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
        AND delivery.status IN ('PUBLISHED', 'RETIRED')
      WHERE t.id = ${envelope.trackId}
        AND t.organization_id = ${envelope.organizationId}
        AND t.run_id = ${envelope.runId}
    )`
  }
  if (envelope.trackResourceFamily === 'SCALE' && key.startsWith('library-scale:')) {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM registered_assessment_resources r
      WHERE r.resource_key = ${envelope.trackResourceKey}
        AND r.resource_version = ${envelope.trackResourceVersion}
        AND r.entry->'libraryOrigin'->>'product' IN ('SCHOOL', 'TEACHER')
    )`
  }
  if (envelope.trackResourceFamily === 'SCALE' && key.startsWith('private-scale:')) {
    if (!isSchoolOnly && !isTeacherOnly) return null
    return Prisma.sql`EXISTS (
      SELECT 1 FROM registered_assessment_resources r
      WHERE r.resource_key = ${envelope.trackResourceKey}
        AND r.resource_version = ${envelope.trackResourceVersion}
        AND ${privateScaleRegistryIdentitySql({
          registered: Prisma.sql`r`,
          organizationId: Prisma.sql`${envelope.organizationId}`,
          product: isSchoolOnly ? 'SCHOOL' : 'TEACHER',
        })}
    )`
  }
  if (key.startsWith('private-form:')) {
    if (!isSchoolOnly && !isTeacherOnly) return null
    return Prisma.sql`EXISTS (
      SELECT 1 FROM assessment_run_tracks t
      WHERE t.id = ${envelope.trackId}
        AND t.organization_id = ${envelope.organizationId}
        AND t.run_id = ${envelope.runId}
        AND ${privateFormTrackIdentitySql({
          track: Prisma.sql`t`,
          organizationId: Prisma.sql`${envelope.organizationId}`,
          product: isSchoolOnly ? 'SCHOOL' : 'TEACHER',
        })}
    )`
  }
  return null
}

type ExistingStartAttempt = Pick<CompositeAssessmentAttempt, 'id' | 'compositeAssessmentId' | 'userId' |
  'subjectUserId' | 'respondentUserId' | 'respondentType' | 'episodeId' | 'assignmentRef' | 'consentId'>
export type PublishedSelfIntake = { existingAttempt: ExistingStartAttempt | null }

/** A published ordinary SELF task already names its participant. The locked
 * intake state decides whether this participant can create a new attempt. */
export async function assertPublishedSelfWholeStartAuthority(
  tx: Prisma.TransactionClient,
  known: StartAuthorityKnownEnvelope | undefined,
  scope: RunPopulationProductScope,
  assignmentRef: string | null | undefined,
): Promise<PublishedSelfIntake | null> {
  const product = scope === 'CAMPUS_ONLY' ? 'SCHOOL' : scope === 'HUITEACHER_ONLY' ? 'TEACHER' : null
  const role = product === 'SCHOOL' ? 'STUDENT' : 'TEACHER'
  if (!product || !assignmentRef || !ordinarySelfWholeEnabled() || !known
    || known.subjectActorSnapshotId !== known.respondentActorSnapshotId || known.relationshipKind !== 'SELF'
    || known.subjectRole !== role || !known.trackResourceKey?.startsWith('education-composition:' + product + ':')
    || !known.trackResourceKey.endsWith(':' + role + ':SELF:1.0.0')) return null
  const activity = product === 'SCHOOL'
    ? Prisma.sql`campus_activity_runs link JOIN campus_activities activity
        ON activity.course_id=link.course_id AND activity.organization_id=link.organization_id`
    : Prisma.sql`huiteacher_evaluation_run_links link JOIN huiteacher_evaluation_events activity
        ON activity.id=link.event_id AND activity.organization_id=link.organization_id`
  const [row] = await tx.$queryRaw<Array<PublishedSelfIntake & { active: boolean; open: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM users u WHERE u.id=${known.subjectUserId} AND u.account_domain='SCHOOL'
      AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND ${product === 'SCHOOL' ? Prisma.sql`u.role='STUDENT'` : Prisma.sql`u.role IN ('TEACHER','ADMIN') AND u.teacher_approved`}) AS active,
      EXISTS (SELECT 1 FROM ${activity}
        WHERE link.organization_id=t.organization_id AND link.run_id=t.run_id AND activity.status='OPEN')
      AND ${known.intakeDeadline === null ? Prisma.sql`TRUE` : Prisma.sql`${known.intakeDeadline}>statement_timestamp()`}
      AND EXISTS (SELECT 1 FROM education_product_entitlements ent WHERE ent.organization_id=t.organization_id
        AND ent.product=${product === 'SCHOOL' ? 'HUISCHOOL' : 'HUITEACHER'} AND ent.status='ACTIVE') AS open,
      (SELECT jsonb_build_object('id',p.id,'compositeAssessmentId',p.composite_assessment_id,
        'userId',p.user_id,'subjectUserId',p.subject_user_id,'respondentUserId',p.respondent_user_id,
        'respondentType',p.respondent_type,'episodeId',p.episode_id,'assignmentRef',p.assignment_ref,'consentId',p.consent_id)
        FROM composite_assessment_attempts p WHERE p.assignment_ref=${assignmentRef}
        ORDER BY p.started_at DESC LIMIT 1) AS "existingAttempt"
    FROM assessment_run_tracks t
    WHERE t.id=${known.trackId} AND t.organization_id=${known.organizationId} AND t.run_id=${known.runId}
      AND ${publishedSelfScaleTrackSql(Prisma.sql`t`, product)}
  `
  if (!row) return null
  if (!row.active) throw new RunStartAdmissionError('RUN_ACCOUNT_INACTIVE', 'Current account cannot open this questionnaire', 403)
  if (known.orgStatus !== 'ACTIVE') throw new RunStartAdmissionError('ORGANIZATION_SUSPENDED', 'Organization is suspended', 403)
  if (!row.open) throw new RunStartAdmissionError('RUN_INTAKE_CLOSED', 'Questionnaire is no longer accepting new attempts', 403)
  return { existingAttempt: row.existingAttempt }
}

/** Called with Organization SHARE -> Run SHARE -> Execution UPDATE held. */
export const assertCurrentRunStartAuthority = async (
  tx: Prisma.TransactionClient,
  executionId: string,
  options?: {
    accountMode?: 'DETECT_EDUCATION_LIBRARY'
    operation?: 'BOUND_FINAL'
    productScope?: RunPopulationProductScope
    knownEnvelope?: StartAuthorityKnownEnvelope
  },
): Promise<void> => {
  const fail = (code: string) => { throw new RunStartAdmissionError(code, 'current Run START authority is no longer valid', 403) }
  const productScope = options?.productScope ?? 'ALL'
  const known = options?.knownEnvelope

  // Single-statement flat fast path for already-locked education library /
  // private SELF executions. Because DETECT_EDUCATION_LIBRARY takes no user
  // row lock and SELF takes no relationship row lock, all authority fences
  // (org/run/activity-or-event/execution) were already acquired before this
  // statement starts, preserving the lock-then-statement_timestamp() contract
  // while eliminating 7 sequential queries + force_custom_plan re-planning.
  if (
    known
    && options?.accountMode === 'DETECT_EDUCATION_LIBRARY'
    && (options?.operation !== 'BOUND_FINAL'
      || known.trackResourceKey.startsWith('education-composition:')
      || (known.trackResourceFamily === 'FORM' && known.trackResourceKey.startsWith('private-form:')))
    && known.subjectActorSnapshotId === known.respondentActorSnapshotId
    && known.relationshipKind === 'SELF'
    && known.relationshipCourseId === null
    && known.subjectProvenance === 'ORG_MEMBER'
    && (productScope === 'CAMPUS_ONLY' || productScope === 'HUITEACHER_ONLY')
  ) {
    const librarySql = buildTargetedEducationLibrarySql(known)
    const decomposedPopSql = buildDecomposedSingleExecutionAuthoritySql(known, 'COLLECTION', productScope)
    if (librarySql && decomposedPopSql) {
      const fastRows = await tx.$queryRaw<Array<{
        isLibrary: boolean
        userValid: boolean
        accountNotExpired: boolean
        actorValid: boolean
        actorDenied: boolean
        populationCurrent: boolean
        intakeOpen: boolean
      }>>`
        SELECT
          (${librarySql}) AS "isLibrary",
          (u."is_active" AND NOT u."is_frozen" AND NOT u."must_change_password"
            AND (u."role" <> 'TEACHER' OR u."teacher_approved")) AS "userValid",
          (u."expires_at" IS NULL OR u."expires_at" > statement_timestamp()) AS "accountNotExpired",
          EXISTS (
            SELECT 1 FROM "organization_memberships" m
            JOIN "organization_persona_grants" pg
              ON pg."membership_id" = m."id" AND pg."organization_id" = m."organization_id"
            WHERE m."id" = ${known.subjectMembershipId}
              AND m."user_id" = u."id"
              AND m."organization_id" = ${known.organizationId}
              AND ${currentWindowSql(Prisma.sql`m`)}
              AND pg."id" = ${known.subjectPersonaGrantId}
              AND pg."persona" = ${known.subjectRole}
              AND pg."revoked_at" IS NULL
          ) AS "actorValid",
          EXISTS (
            SELECT 1 FROM "organization_access_denies" d
            WHERE d."organization_id" = ${known.organizationId}
              AND d."user_id" = u."id"
              AND d."lifted_at" IS NULL AND d."permission" IN ('*', 'RUN_START')
          ) AS "actorDenied",
          (${decomposedPopSql}) AS "populationCurrent",
          (${known.intakeDeadline === null
            ? Prisma.sql`TRUE`
            : Prisma.sql`${known.intakeDeadline} > statement_timestamp()`}) AS "intakeOpen"
        FROM "users" u
        WHERE u."id" = ${known.subjectUserId}
        LIMIT 1
      `
      const fast = fastRows[0]
      if (!fast) fail('RUN_ACCOUNT_INACTIVE')
      if (!fast.isLibrary && options?.operation === 'BOUND_FINAL') fail('RUN_BOUND_FINAL_SOURCE_REQUIRED')
      if (fast.isLibrary) {
        if (!fast.userValid) fail('RUN_ACCOUNT_INACTIVE')
        if (known.orgStatus !== 'ACTIVE') fail('ORGANIZATION_SUSPENDED')
        if (!fast.actorValid || fast.actorDenied) fail('RUN_ACTOR_AUTHORITY_REVOKED')
        if (!fast.accountNotExpired) fail('RUN_ACCOUNT_INACTIVE')
        if (!fast.populationCurrent) fail('RUN_ACTOR_AUTHORITY_REVOKED')
        if (options?.operation !== 'BOUND_FINAL' && !fast.intakeOpen) fail('RUN_INTAKE_CLOSED')
        return
      }
    }
  }
  // Verified public-library and author-private executions use query-time account checks. Do not acquire a
  // user lock after org: account-reset writers acquire user UPDATE before org.
  // This server-only mode is never accepted from a request, and actual legacy
  // tracks retain the old lock even when a caller requests detection.
  const library = options?.accountMode === 'DETECT_EDUCATION_LIBRARY' ? await tx.$queryRaw<Array<{id:string;privateForm:boolean}>>`
    SELECT e.id,((t.resource_family='FORM' AND t.resource_key LIKE 'private-form:%') OR
     t.resource_key LIKE 'education-composition:%') AS "privateForm" FROM assessment_run_executions e JOIN assessment_run_tracks t
      ON t.id=e.track_id AND t.organization_id=e.organization_id AND t.run_id=e.run_id
    LEFT JOIN registered_assessment_resources r ON r.resource_key=t.resource_key AND r.resource_version=t.resource_version
    WHERE e.id=${executionId} AND ((${educationCompositionTrackIdentitySql({track:Prisma.sql`t`,organizationId:Prisma.sql`e.organization_id`,product:'TEACHER'})}
      AND EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h WHERE h.organization_id=e.organization_id AND h.run_id=e.run_id)
      AND NOT EXISTS(SELECT 1 FROM campus_activity_runs c WHERE c.organization_id=e.organization_id AND c.run_id=e.run_id))
      OR (${educationCompositionTrackIdentitySql({track:Prisma.sql`t`,organizationId:Prisma.sql`e.organization_id`,product:'SCHOOL'})}
       AND EXISTS(SELECT 1 FROM campus_activity_runs c WHERE c.organization_id=e.organization_id AND c.run_id=e.run_id)
       AND NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h WHERE h.organization_id=e.organization_id AND h.run_id=e.run_id)) OR EXISTS(
      SELECT 1 FROM education_assessment_deliveries delivery
      WHERE delivery.organization_id=e.organization_id AND delivery.family=t.resource_family
       AND t.resource_version='1.0.0'
       AND t.resource_key=('education-assessment:'||delivery.product||':'||delivery.organization_id||':'||delivery.id)
       AND delivery.runtime_composite_id=t.frozen_resource_policy#>>'{runtimeLaunchTarget,ref}'
       AND delivery.status IN ('PUBLISHED','RETIRED')
       AND ((delivery.product='TEACHER'
         AND EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h WHERE h.organization_id=e.organization_id AND h.run_id=e.run_id)
         AND NOT EXISTS(SELECT 1 FROM campus_activity_runs c WHERE c.organization_id=e.organization_id AND c.run_id=e.run_id))
        OR (delivery.product='SCHOOL'
         AND EXISTS(SELECT 1 FROM campus_activity_runs c WHERE c.organization_id=e.organization_id AND c.run_id=e.run_id)
         AND NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h WHERE h.organization_id=e.organization_id AND h.run_id=e.run_id))))
      OR (t.resource_family='SCALE' AND (
      (t.resource_key LIKE 'library-scale:%' AND r.entry->'libraryOrigin'->>'product' IN ('SCHOOL','TEACHER'))
      OR (${privateScaleRegistryIdentitySql({registered:Prisma.sql`r`,organizationId:Prisma.sql`e.organization_id`,product:'SCHOOL'})}
        AND EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id)
        AND NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links teacher WHERE teacher.organization_id=e.organization_id AND teacher.run_id=e.run_id))
      OR (${privateScaleRegistryIdentitySql({registered:Prisma.sql`r`,organizationId:Prisma.sql`e.organization_id`,product:'TEACHER'})}
        AND EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links teacher WHERE teacher.organization_id=e.organization_id AND teacher.run_id=e.run_id)
        AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id))))
      OR (${privateFormTrackIdentitySql({track:Prisma.sql`t`,organizationId:Prisma.sql`e.organization_id`,product:'SCHOOL'})}
       AND EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id)
       AND NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links teacher WHERE teacher.organization_id=e.organization_id AND teacher.run_id=e.run_id))
      OR (${privateFormTrackIdentitySql({track:Prisma.sql`t`,organizationId:Prisma.sql`e.organization_id`,product:'TEACHER'})}
       AND EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links teacher WHERE teacher.organization_id=e.organization_id AND teacher.run_id=e.run_id)
       AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school WHERE school.organization_id=e.organization_id AND school.run_id=e.run_id)))
  ` : []
  if(options?.operation==='BOUND_FINAL'&&!library[0]?.privateForm)fail('RUN_BOUND_FINAL_SOURCE_REQUIRED')
  // Account mutation conflicts with these shared fences. Do not evaluate expiry
  // against this statement's start time: acquiring a row lock can wait past it.
  const users = await tx.$queryRaw<Array<{ valid: boolean }>>`
    SELECT (u."is_active" AND NOT u."is_frozen" AND NOT u."must_change_password"
      AND (u."role" <> 'TEACHER' OR u."teacher_approved")) AS "valid"
    FROM "users" u
    WHERE u."id" IN (
      SELECT a."user_id" FROM "assessment_run_actor_snapshots" a
      JOIN "assessment_run_executions" e ON a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
      WHERE e."id" = ${executionId}
    ) ORDER BY u."id" ${library.length ? Prisma.empty : Prisma.sql`FOR SHARE OF u`}
  `
  if (!users.length || users.some((u) => !u.valid)) fail('RUN_ACCOUNT_INACTIVE')
  const envelopes = await tx.$queryRaw<Array<{ organizationId: string; active: boolean }>>`
    SELECT e."organization_id" AS "organizationId", o."status" = 'ACTIVE' AS "active"
    FROM "assessment_run_executions" e JOIN "assessment_runs" r ON r."id" = e."run_id"
    JOIN "organizations" o ON o."id" = e."organization_id" WHERE e."id" = ${executionId}
  `
  const envelope = envelopes[0]
  if (!envelope?.active) fail('ORGANIZATION_SUSPENDED')
  const actors = await tx.$queryRaw<Array<{ valid: boolean; denied: boolean }>>`
    SELECT (a."provenance_kind" = 'EXTERNAL_PARENT' OR EXISTS (
      SELECT 1 FROM "organization_memberships" m
      JOIN "organization_persona_grants" pg ON pg."membership_id" = m."id" AND pg."organization_id" = m."organization_id"
      WHERE m."id" = a."membership_id" AND m."user_id" = a."user_id" AND m."organization_id" = a."organization_id"
        AND m."valid_from" <= statement_timestamp() AND ${currentWindowSql(Prisma.sql`m`)}
        AND pg."id" = a."snapshot_payload"->>'personaGrantId' AND pg."persona" = a."actor_role" AND pg."revoked_at" IS NULL
    )) AS "valid", EXISTS (
      SELECT 1 FROM "organization_access_denies" d WHERE d."organization_id" = a."organization_id"
        AND d."user_id" = a."user_id" AND d."lifted_at" IS NULL AND d."permission" IN ('*', 'RUN_START')
    ) AS "denied"
    FROM "assessment_run_actor_snapshots" a JOIN "assessment_run_executions" e
      ON a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
    WHERE e."id" = ${executionId}
  `
  if (actors.some((a) => !a.valid || a.denied)) fail('RUN_ACTOR_AUTHORITY_REVOKED')
  const externalParents = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT DISTINCT a."user_id" AS "userId"
    FROM "assessment_run_actor_snapshots" a
    JOIN "assessment_run_executions" e
      ON a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
    WHERE e."id" = ${executionId} AND a."provenance_kind" = 'EXTERNAL_PARENT'
  `
  for (const parent of externalParents) {
    const tether = await tx.$queryRaw<Array<{ valid: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM "parent_student_relationships" r
        JOIN "organization_memberships" m
          ON m."organization_id" = ${envelope.organizationId}
          AND m."user_id" = r."student_user_id"
          AND ${currentWindowSql(Prisma.sql`m`)}
        JOIN "organization_persona_grants" pg
          ON pg."organization_id" = m."organization_id"
          AND pg."membership_id" = m."id"
          AND pg."persona" = 'STUDENT'
          AND pg."revoked_at" IS NULL
        WHERE r."parent_user_id" = ${parent.userId}
          AND r."status" = 'ACTIVE'
          AND r."approved_at" IS NOT NULL
      ) AS "valid"
    `
    if (!tether[0]?.valid) fail('RUN_PARENT_ORGANIZATION_TETHER_REVOKED')
  }
  const relationships = await tx.$queryRaw<Array<{ kind: string; ref: string | null; facts: Record<string, string> }>>`
    SELECT s."relationship_kind" AS "kind", s."relationship_ref" AS "ref", s."snapshot_payload"->'facts' AS "facts"
    FROM "assessment_run_relationship_snapshots" s JOIN "assessment_run_executions" e ON e."relationship_snapshot_id" = s."id"
    WHERE e."id" = ${executionId}
  `
  const relationship = relationships[0]
  if (!relationship) fail('RUN_RELATIONSHIP_REVOKED')
  let valid = relationship.kind === 'SELF'
  if (relationship.kind === 'PARENT_CHILD') {
    const rows = await tx.$queryRaw<Array<{ valid: boolean }>>`
      SELECT ("status" = 'ACTIVE' AND "approved_at" IS NOT NULL) AS "valid"
      FROM "parent_student_relationships" WHERE "id" = ${relationship.ref} FOR SHARE
    `
    valid = rows[0]?.valid ?? false
  } else if(relationship.kind==='STUDENT_PEER'){
    const peers=await tx.$queryRaw<Array<{id:string}>>`
      SELECT peer."id" FROM "campus_peer_assignments" peer
      JOIN "campus_peer_consents" subject_consent
        ON subject_consent."course_id"=peer."course_id"
        AND subject_consent."organization_id"=peer."organization_id"
        AND subject_consent."membership_id"=peer."subject_membership_id"
        AND subject_consent."withdrawn_at" IS NULL
        AND subject_consent."guardian_consented_at" IS NOT NULL
        AND subject_consent."consent_version"='HUISCHOOL_PEER_V1'
      JOIN "campus_peer_consents" respondent_consent
        ON respondent_consent."course_id"=peer."course_id"
        AND respondent_consent."organization_id"=peer."organization_id"
        AND respondent_consent."membership_id"=peer."respondent_membership_id"
        AND respondent_consent."withdrawn_at" IS NULL
        AND respondent_consent."guardian_consented_at" IS NOT NULL
        AND respondent_consent."consent_version"='HUISCHOOL_PEER_V1'
      JOIN "parent_student_relationships" sg
        ON sg."id"=subject_consent."guardian_relationship_id"
        AND sg."status"='ACTIVE' AND sg."approved_at" IS NOT NULL
        AND sg."revoked_at" IS NULL
      JOIN "parent_student_relationships" rg
        ON rg."id"=respondent_consent."guardian_relationship_id"
        AND rg."status"='ACTIVE' AND rg."approved_at" IS NOT NULL
        AND rg."revoked_at" IS NULL
      WHERE peer."id"=${relationship.ref}
        AND peer."organization_id"=${envelope.organizationId}
        AND peer."status"='ACTIVE'
        AND peer."id"=${relationship.facts.peerAssignmentId}
      FOR SHARE OF peer,subject_consent,respondent_consent,sg,rg
    `
    valid=peers.length===1
  } else if (relationship.kind === 'COUNSELOR_CLIENT') {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "organization_counselor_client_relationships"
      WHERE "id" = ${relationship.ref} AND "organization_id" = ${envelope.organizationId} AND "valid_from" <= statement_timestamp() AND ("valid_until" IS NULL OR "valid_until" > statement_timestamp())
      FOR SHARE
    `
    valid = Boolean(rows[0])
  } else if ((relationship.kind === 'CLASS_TEACHER_STUDENT' || relationship.kind === 'COURSE_TEACHER_STUDENT')) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT sc."id" FROM "organization_student_class_assignments" sc
      JOIN "organization_staff_class_assignments" sa ON sa."organization_id" = sc."organization_id" AND sa."class_unit_id" = sc."class_unit_id"
      WHERE sc."id" = ${relationship.facts.studentClassAssignmentId} AND sa."id" = ${relationship.facts.staffClassAssignmentId}
        AND sc."organization_id" = ${envelope.organizationId} AND ${currentWindowSql(Prisma.sql`sc`)} AND ${currentWindowSql(Prisma.sql`sa`)}
      FOR SHARE OF sc, sa
    `
    valid = Boolean(rows[0])
  }
  if (valid && relationship.facts.courseId) {
    const rows = await tx.$queryRaw<Array<{ valid: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM courses c
        JOIN course_students cs ON cs.course_id = c.id AND cs.status IN ('ACTIVE', 'APPROVED')
        JOIN assessment_run_executions e ON e.id = ${executionId}
        JOIN assessment_run_actor_snapshots subject ON subject.id = e.subject_actor_snapshot_id
        JOIN assessment_run_actor_snapshots respondent ON respondent.id = e.respondent_actor_snapshot_id
        WHERE c.id = ${relationship.facts.courseId} AND c.status = 'PUBLISHED' AND c.ended_at IS NULL
          AND c.creator_id = CASE WHEN subject.actor_role = 'TEACHER' THEN subject.user_id ELSE respondent.user_id END
          AND cs.student_id = CASE WHEN subject.actor_role = 'STUDENT' THEN subject.user_id ELSE respondent.user_id END) AS valid
    `
    valid = rows[0]?.valid === true
  }
  if (!valid) fail('RUN_RELATIONSHIP_REVOKED')

  // A separate statement is essential here: statement_timestamp() is fixed at
  // the beginning of its statement, not the end of a lock wait. All authority
  // fences are now held; this is the time-window admission decision.
  // Use the decomposed flat population expression when knownEnvelope qualifies
  // (generic-plan cacheable, no force_custom_plan), falling back to the bounded
  // planner path for rare shapes or direct callers without knownEnvelope.
  const decomposedWindowPopSql = known
    ? buildDecomposedSingleExecutionAuthoritySql(known, 'COLLECTION', productScope)
    : null
  if (!decomposedWindowPopSql) {
    await applyBoundedPlannerControls(tx)
  }
  const windows = await tx.$queryRaw<Array<{ intakeOpen: boolean; accountsCurrent: boolean; populationCurrent: boolean }>>`
    SELECT ${decomposedWindowPopSql ?? currentRunPopulationAuthoritySql(Prisma.sql`e."id"`, 'COLLECTION', productScope)} AS "populationCurrent", (r."intake_deadline" IS NULL OR r."intake_deadline" > statement_timestamp()) AS "intakeOpen",
      NOT EXISTS (
        SELECT 1 FROM "assessment_run_actor_snapshots" a JOIN "users" u ON u."id"=a."user_id"
        WHERE a."id" IN (e."subject_actor_snapshot_id", e."respondent_actor_snapshot_id")
          AND u."expires_at" IS NOT NULL AND u."expires_at" <= statement_timestamp()
      ) AS "accountsCurrent"
    FROM "assessment_run_executions" e JOIN "assessment_runs" r ON r."id"=e."run_id"
    WHERE e."id"=${executionId}
  `
  if (!windows[0]?.accountsCurrent) fail('RUN_ACCOUNT_INACTIVE')
  if (!windows[0]?.populationCurrent) fail('RUN_ACTOR_AUTHORITY_REVOKED')
  // Only the dedicated, DB-bound FORM FINAL caller opts out of new-intake time.
  // It has already verified the immutable source and exact existing parent.
  if (options?.operation!=='BOUND_FINAL' && !windows[0].intakeOpen) fail('RUN_INTAKE_CLOSED')
}
