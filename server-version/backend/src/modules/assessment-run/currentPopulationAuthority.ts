import {privateFormTrackIdentitySql} from './educationPrivateFormIdentitySql'
import {educationCompositionTrackIdentitySql} from './educationCompositionIdentitySql'
import {privateScaleRegistryIdentitySql} from './educationPrivateScaleIdentitySql'
import { Prisma } from '@prisma/client'
import {studentEvaluationTrackConfigSql} from '../huiteacher/studentCompositionResource'
import { currentRunActorAuthoritySql, currentWindowSql, usableRunAccountSql, type RunAuthorityPurpose } from './currentActorAuthority'
import { applyBoundedPlannerControls, withBoundedPlannerRead, type PlannerBoundReadDb } from './plannerBound'

export type RunPopulationProductScope = 'ALL' | 'CAMPUS_ONLY' | 'HUITEACHER_ONLY'

export type SingleExecutionAuthorityEnvelope = {
  executionId: string
  organizationId: string
  runId: string
  trackId: string
  executionStatus: string
  orgStatus: string
  orgProductDomain: string
  subjectActorSnapshotId: string
  respondentActorSnapshotId: string
  subjectUserId: string
  subjectRole: string
  subjectProvenance: string
  subjectMembershipId: string | null
  subjectPersonaGrantId: string | null
  respondentUserId: string
  respondentRole: string
  respondentProvenance: string
  respondentMembershipId: string | null
  respondentPersonaGrantId: string | null
  relationshipKind: string
  relationshipRef: string | null
  relationshipCourseId: string | null
  relationshipStudentClassAssignmentId: string | null
  relationshipStaffClassAssignmentId: string | null
  relationshipClassUnitId: string | null
  trackResourceFamily: string
  trackResourceKey: string
  trackResourceVersion: string
}

const relationshipAuthoritySql = (productScope: RunPopulationProductScope): Prisma.Sql =>
  productScope === 'HUITEACHER_ONLY'
    ? Prisma.sql`(relation.relationship_kind='SELF'
    OR (relation.relationship_kind IN ('CLASS_TEACHER_STUDENT','COURSE_TEACHER_STUDENT') AND EXISTS (
     SELECT 1 FROM organization_student_class_assignments student_class JOIN organization_staff_class_assignments staff_class
      ON staff_class.organization_id=student_class.organization_id AND staff_class.class_unit_id=student_class.class_unit_id
     WHERE student_class.id=relation.snapshot_payload->'facts'->>'studentClassAssignmentId'
      AND staff_class.id=relation.snapshot_payload->'facts'->>'staffClassAssignmentId'
      AND student_class.organization_id=org.id AND ${currentWindowSql(Prisma.sql`student_class`)} AND ${currentWindowSql(Prisma.sql`staff_class`)}
    )))`
    : Prisma.sql`(relation.relationship_kind='SELF'
    OR (relation.relationship_kind='PARENT_CHILD' AND EXISTS (
     SELECT 1 FROM parent_student_relationships parent_link WHERE parent_link.id=relation.relationship_ref
      AND parent_link.status='ACTIVE' AND parent_link.approved_at IS NOT NULL
    ))
    OR (relation.relationship_kind='STUDENT_PEER' AND EXISTS (
     SELECT 1 FROM campus_peer_assignments peer
     JOIN campus_peer_consents subject_consent ON subject_consent.course_id=peer.course_id
      AND subject_consent.organization_id=peer.organization_id
      AND subject_consent.membership_id=peer.subject_membership_id
      AND subject_consent.withdrawn_at IS NULL AND subject_consent.guardian_consented_at IS NOT NULL
      AND subject_consent.consent_version='HUISCHOOL_PEER_V1'
     JOIN campus_peer_consents respondent_consent ON respondent_consent.course_id=peer.course_id
      AND respondent_consent.organization_id=peer.organization_id
      AND respondent_consent.membership_id=peer.respondent_membership_id
      AND respondent_consent.withdrawn_at IS NULL AND respondent_consent.guardian_consented_at IS NOT NULL
      AND respondent_consent.consent_version='HUISCHOOL_PEER_V1'
     JOIN parent_student_relationships subject_guardian ON subject_guardian.id=subject_consent.guardian_relationship_id
      AND subject_guardian.student_user_id=subject.user_id
      AND subject_guardian.status='ACTIVE' AND subject_guardian.approved_at IS NOT NULL AND subject_guardian.revoked_at IS NULL
     JOIN parent_student_relationships respondent_guardian ON respondent_guardian.id=respondent_consent.guardian_relationship_id
      AND respondent_guardian.student_user_id=respondent.user_id
      AND respondent_guardian.status='ACTIVE' AND respondent_guardian.approved_at IS NOT NULL AND respondent_guardian.revoked_at IS NULL
     WHERE peer.id=relation.relationship_ref AND peer.organization_id=org.id
       AND peer.subject_membership_id=subject.membership_id
       AND peer.respondent_membership_id=respondent.membership_id
       AND peer.status='ACTIVE'
       AND subject.actor_role='STUDENT' AND respondent.actor_role='STUDENT'
       AND subject.user_id<>respondent.user_id
    ))
    OR (relation.relationship_kind='COUNSELOR_CLIENT' AND EXISTS (
     SELECT 1 FROM organization_counselor_client_relationships client_link WHERE client_link.id=relation.relationship_ref
      AND client_link.organization_id=org.id AND ${currentWindowSql(Prisma.sql`client_link`)}
    ))
    OR (relation.relationship_kind IN ('CLASS_TEACHER_STUDENT','COURSE_TEACHER_STUDENT') AND EXISTS (
     SELECT 1 FROM organization_student_class_assignments student_class JOIN organization_staff_class_assignments staff_class
      ON staff_class.organization_id=student_class.organization_id AND staff_class.class_unit_id=student_class.class_unit_id
     WHERE student_class.id=relation.snapshot_payload->'facts'->>'studentClassAssignmentId'
      AND staff_class.id=relation.snapshot_payload->'facts'->>'staffClassAssignmentId'
      AND student_class.organization_id=org.id AND ${currentWindowSql(Prisma.sql`student_class`)} AND ${currentWindowSql(Prisma.sql`staff_class`)}
    ))
   )`

const huiteacherPopulationBranchSql = (purpose: RunAuthorityPurpose): Prisma.Sql => Prisma.sql`EXISTS(
      SELECT 1 FROM huiteacher_evaluation_run_links h
      JOIN huiteacher_evaluation_events event
        ON event.organization_id=h.organization_id AND event.id=h.event_id
        AND event.status IN ('OPEN','CLOSED')
        AND (event.status='OPEN' OR x.status='COMPLETED')
      JOIN education_product_entitlements entitlement
        ON entitlement.organization_id=h.organization_id
        AND entitlement.product='HUITEACHER' AND entitlement.status='ACTIVE'
      JOIN users teacher_respondent ON teacher_respondent.id=respondent.user_id
        AND teacher_respondent.account_domain='SCHOOL'
        AND teacher_respondent.is_active=TRUE
        AND teacher_respondent.is_frozen=FALSE
      JOIN users teacher_subject ON teacher_subject.id=subject.user_id
        AND teacher_subject.account_domain='SCHOOL'
        AND teacher_subject.is_active=TRUE AND teacher_subject.is_frozen=FALSE
      WHERE h.organization_id=org.id AND h.run_id=x.run_id
        AND (
        (relation.relationship_kind='SELF'
        AND subject.actor_role='TEACHER' AND respondent.actor_role='TEACHER'
        AND subject.user_id=respondent.user_id
        AND NOT EXISTS(SELECT 1 FROM assessment_run_tracks ordinary_track WHERE ordinary_track.id=x.track_id
         AND ordinary_track.organization_id=x.organization_id AND ordinary_track.run_id=x.run_id
         AND ordinary_track.resource_key LIKE 'education-composition:%'
         AND NOT ${educationCompositionTrackIdentitySql({track:Prisma.sql`ordinary_track`,organizationId:Prisma.sql`org.id`,product:'TEACHER'})})
        AND NOT EXISTS(SELECT 1 FROM assessment_run_tracks private_form_track
          WHERE private_form_track.id=x.track_id AND private_form_track.organization_id=x.organization_id
           AND private_form_track.run_id=x.run_id AND private_form_track.resource_key LIKE 'private-form:%'
           AND NOT ${privateFormTrackIdentitySql({track:Prisma.sql`private_form_track`,organizationId:Prisma.sql`org.id`,product:'TEACHER'})})
        AND NOT EXISTS(SELECT 1 FROM assessment_run_tracks private_track
          WHERE private_track.id=x.track_id AND private_track.organization_id=x.organization_id
            AND private_track.run_id=x.run_id AND private_track.resource_key LIKE 'private-scale:%'
            AND NOT EXISTS(SELECT 1 FROM registered_assessment_resources private_registered
              WHERE private_registered.resource_key=private_track.resource_key AND private_registered.resource_version=private_track.resource_version
                AND ${privateScaleRegistryIdentitySql({registered:Prisma.sql`private_registered`,organizationId:Prisma.sql`org.id`,product:'TEACHER'})}))
        -- A scored Teacher Scale needs an ACTIVE exact tenant license for
        -- START/unfinished execution. A finished respondent's own report
        -- remains readable from its verified frozen source after license
        -- retirement, provided their product/membership rights remain active.
        AND (NOT EXISTS (
          SELECT 1 FROM assessment_run_tracks scale_track
          WHERE scale_track.organization_id=x.organization_id
            AND scale_track.run_id=x.run_id AND scale_track.id=x.track_id
            AND scale_track.resource_family='SCALE'
            AND scale_track.resource_key LIKE 'teacher-scale:%:INDIVIDUAL'
        ) OR x.status='COMPLETED' OR EXISTS (
          SELECT 1 FROM assessment_run_tracks scale_track
          JOIN registered_assessment_resources registered
            ON registered.resource_key=scale_track.resource_key
            AND registered.resource_version=scale_track.resource_version
            AND registered.status='PUBLISHED'
          JOIN education_teacher_scale_licenses license
            ON license.resource_id=registered.id
            AND license.organization_id=x.organization_id
            AND license.status='ACTIVE'
          WHERE scale_track.organization_id=x.organization_id
            AND scale_track.run_id=x.run_id AND scale_track.id=x.track_id
            AND scale_track.resource_family='SCALE'
            AND scale_track.resource_key LIKE 'teacher-scale:%:INDIVIDUAL'
        ))
        AND NOT EXISTS (
          SELECT 1 FROM organization_access_denies deny
          WHERE deny.organization_id=org.id
            AND deny.user_id=respondent.user_id AND deny.lifted_at IS NULL
            AND ${purpose === 'REPORT_READ'
                ? Prisma.sql`deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','REPORT_READ','PARTICIPANT_REPORT_READ')`
                : Prisma.sql`deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START')`}
        )
        )
        OR (
          relation.relationship_kind='CLASS_TEACHER_STUDENT'
          AND subject.actor_role='TEACHER' AND respondent.actor_role='STUDENT'
          AND teacher_subject.role IN ('TEACHER','ADMIN')
          AND teacher_respondent.role='STUDENT'
          AND EXISTS(
            SELECT 1 FROM huiteacher_student_eval_configs cfg
            JOIN assessment_run_tracks track
              ON track.organization_id=h.organization_id AND track.run_id=h.run_id
              AND track.id=x.track_id
              AND ${studentEvaluationTrackConfigSql(Prisma.sql`track`,Prisma.sql`cfg`)}
            JOIN huiteacher_evaluation_targets target
              ON target.organization_id=cfg.organization_id
              AND target.id=event.target_id AND target.kind='PERSON'
              AND target.subject_user_id=subject.user_id
            JOIN organization_staff_class_assignments staff
              ON staff.id=cfg.staff_assignment_id
              AND staff.organization_id=cfg.organization_id
              AND staff.class_unit_id=cfg.class_unit_id
              AND staff.staff_role IN ('TEACHING','HOMEROOM')
              AND staff.valid_from<=statement_timestamp()
              AND (staff.valid_until IS NULL OR staff.valid_until>statement_timestamp())
            JOIN organization_student_class_assignments placement
              ON placement.id=relation.snapshot_payload->'facts'->>'studentClassAssignmentId'
              AND placement.organization_id=cfg.organization_id
              AND placement.class_unit_id=cfg.class_unit_id
              AND placement.membership_id=respondent.membership_id
              AND placement.valid_from<=statement_timestamp()
              AND (placement.valid_until IS NULL OR placement.valid_until>statement_timestamp())
            WHERE cfg.organization_id=h.organization_id
              AND cfg.event_id=h.event_id
              AND staff.id=relation.snapshot_payload->'facts'->>'staffClassAssignmentId'
              AND relation.snapshot_payload->'facts'->>'classUnitId'=cfg.class_unit_id
          )
          AND NOT EXISTS(
            SELECT 1 FROM organization_access_denies deny
            WHERE deny.organization_id=org.id
              AND deny.user_id=respondent.user_id AND deny.lifted_at IS NULL
              AND ${purpose === 'REPORT_READ'
                ? Prisma.sql`deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','REPORT_READ','PARTICIPANT_REPORT_READ')`
                : Prisma.sql`deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START')`}
          )
        )
        )
    )`

const campusStudentActorCurrentSql = (
  alias: 'subject' | 'respondent',
  purpose: RunAuthorityPurpose,
): Prisma.Sql => {
  const membershipId = Prisma.raw(`${alias}.membership_id`)
  const userId = Prisma.raw(`${alias}.user_id`)
  const actorRole = Prisma.raw(`${alias}.actor_role`)
  return Prisma.sql`(${actorRole}<>'STUDENT' OR EXISTS(
    SELECT 1 FROM campus_activity_runs ar
    JOIN campus_activities activity ON activity.course_id=ar.course_id
      AND activity.organization_id=ar.organization_id AND ${purpose === 'REPORT_READ' ? Prisma.sql`(activity.status IN ('OPEN','PAUSED','CLOSED') AND x.status='COMPLETED')` : Prisma.sql`activity.status='OPEN'`}
    JOIN campus_activity_participants member ON member.course_id=ar.course_id
      AND member.organization_id=ar.organization_id AND member.status='ACTIVE'
      AND member.membership_id=${membershipId}
    JOIN organization_memberships membership ON membership.id=member.membership_id
      AND membership.organization_id=member.organization_id
      AND membership.user_id=${userId}
      AND ${currentWindowSql(Prisma.sql`membership`)}
    JOIN campus_student_enrollments enrollment ON enrollment.user_id=${userId}
      AND enrollment.organization_id=member.organization_id AND enrollment.status='APPROVED'
    JOIN campus_class_admissions admission ON admission.organization_id=enrollment.organization_id
      AND admission.class_unit_id=enrollment.class_unit_id AND admission.status='APPROVED'
    JOIN organization_student_class_assignments class_assignment
      ON class_assignment.organization_id=member.organization_id
      AND class_assignment.membership_id=member.membership_id
      AND class_assignment.class_unit_id=enrollment.class_unit_id
      AND ${currentWindowSql(Prisma.sql`class_assignment`)}
    JOIN users campus_student ON campus_student.id=${userId}
      AND campus_student.account_domain='SCHOOL'
      AND campus_student.is_active=TRUE AND campus_student.is_frozen=FALSE
    WHERE ar.organization_id=org.id AND ar.run_id=x.run_id
  ))`
}

const campusPopulationBranchSql = (purpose: RunAuthorityPurpose): Prisma.Sql => Prisma.sql`NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h
      WHERE h.organization_id=org.id AND h.run_id=x.run_id)
    AND NOT EXISTS(SELECT 1 FROM assessment_run_tracks school_ordinary
      WHERE school_ordinary.id=x.track_id AND school_ordinary.organization_id=x.organization_id
       AND school_ordinary.run_id=x.run_id AND school_ordinary.resource_key LIKE 'education-composition:%'
       AND NOT ${educationCompositionTrackIdentitySql({track:Prisma.sql`school_ordinary`,organizationId:Prisma.sql`org.id`,product:'SCHOOL'})})
    AND ${purpose === 'REPORT_READ' ? Prisma.sql`TRUE` : Prisma.sql`NOT EXISTS (
      SELECT 1 FROM assessment_run_tracks school_scale
      WHERE school_scale.id=x.track_id AND school_scale.organization_id=x.organization_id
        AND school_scale.run_id=x.run_id AND school_scale.resource_family='SCALE'
        AND NOT EXISTS (SELECT 1 FROM registered_assessment_resources registered
          WHERE registered.resource_key=school_scale.resource_key
            AND registered.resource_version=school_scale.resource_version
            AND ((registered.resource_key LIKE 'library-scale:%:SCHOOL:%'
              AND registered.entry->'libraryOrigin'->>'product'='SCHOOL')
              OR ${privateScaleRegistryIdentitySql({registered:Prisma.sql`registered`,organizationId:Prisma.sql`org.id`,product:'SCHOOL'})})
            AND registered.entry->'applicability'->>'resourceKind'='SCALE')
    )`}
    AND NOT EXISTS(SELECT 1 FROM assessment_run_tracks school_form
      WHERE school_form.id=x.track_id AND school_form.organization_id=x.organization_id
       AND school_form.run_id=x.run_id AND school_form.resource_family='FORM'
       AND school_form.resource_key LIKE 'private-form:%'
       AND NOT ${privateFormTrackIdentitySql({track:Prisma.sql`school_form`,organizationId:Prisma.sql`org.id`,product:'SCHOOL'})})
    AND EXISTS(SELECT 1 FROM campus_activity_runs ar
      JOIN campus_activities activity ON activity.course_id=ar.course_id
        AND activity.organization_id=ar.organization_id
      WHERE ar.organization_id=org.id AND ar.run_id=x.run_id
        AND ${purpose === 'REPORT_READ' ? Prisma.sql`(activity.status IN ('OPEN','PAUSED','CLOSED') AND x.status='COMPLETED')` : Prisma.sql`activity.status='OPEN'`})
    AND (subject.actor_role='STUDENT' OR respondent.actor_role='STUDENT')
    AND ${campusStudentActorCurrentSql('subject', purpose)}
    AND (x.respondent_actor_snapshot_id=x.subject_actor_snapshot_id OR ${campusStudentActorCurrentSql('respondent', purpose)})
    AND EXISTS(SELECT 1 FROM users actor_user WHERE actor_user.id=subject.user_id AND actor_user.account_domain='SCHOOL')
    AND (x.respondent_actor_snapshot_id=x.subject_actor_snapshot_id OR respondent.user_id=subject.user_id
      OR EXISTS(SELECT 1 FROM users actor_user WHERE actor_user.id=respondent.user_id AND actor_user.account_domain='SCHOOL'))`

const domainPopulationAuthoritySql = (
  purpose: RunAuthorityPurpose,
  productScope: RunPopulationProductScope,
): Prisma.Sql => {
  if (productScope === 'CAMPUS_ONLY') {
    return Prisma.sql`org.product_domain='SCHOOL' AND (${campusPopulationBranchSql(purpose)})`
  }
  if (productScope === 'HUITEACHER_ONLY') {
    return Prisma.sql`org.product_domain='SCHOOL'
    AND NOT EXISTS(SELECT 1 FROM campus_activity_runs school_excl WHERE school_excl.organization_id=org.id AND school_excl.run_id=x.run_id)
    AND ${huiteacherPopulationBranchSql(purpose)}`
  }
  return Prisma.sql`(org.product_domain<>'SCHOOL' OR (${huiteacherPopulationBranchSql(purpose)} OR (${campusPopulationBranchSql(purpose)})))`
}

const actorPopulationAuthoritySql = (
  alias: 'subject' | 'respondent',
  purpose: RunAuthorityPurpose,
): Prisma.Sql => currentRunActorAuthoritySql({
  userId: Prisma.raw(`${alias}.user_id`),
  organizationId: Prisma.sql`org.id`,
  provenance: Prisma.raw(`${alias}.provenance_kind`),
  membershipId: Prisma.raw(`${alias}.membership_id`),
  personaGrantId: Prisma.raw(`${alias}.snapshot_payload->>'personaGrantId'`),
  role: Prisma.raw(`${alias}.actor_role`),
}, purpose)

/** Shared current population gate. Intake deadlines do not remove own history.
 * executionId is a static SQL expression supplied by the caller, never user SQL.
 */
export const currentRunPopulationAuthoritySql = (
  executionId: Prisma.Sql,
  purpose: RunAuthorityPurpose = 'COLLECTION',
  productScope: RunPopulationProductScope = 'ALL',
): Prisma.Sql => Prisma.sql`
 EXISTS (
  SELECT 1 FROM assessment_run_executions x JOIN organizations org ON org.id=x.organization_id
  JOIN assessment_run_relationship_snapshots relation ON relation.id=x.relationship_snapshot_id
  JOIN assessment_run_actor_snapshots subject ON subject.id=x.subject_actor_snapshot_id
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=x.respondent_actor_snapshot_id
  WHERE x.id=${executionId} AND org.status='ACTIVE'
   AND ${actorPopulationAuthoritySql('subject', purpose)}
   AND (x.respondent_actor_snapshot_id=x.subject_actor_snapshot_id OR ${actorPopulationAuthoritySql('respondent', purpose)})
   AND ${relationshipAuthoritySql(productScope)}
   AND ${domainPopulationAuthoritySql(purpose, productScope)}
   AND (relation.snapshot_payload->'facts'->>'courseId' IS NULL OR EXISTS (
    SELECT 1 FROM courses course JOIN course_students student ON student.course_id=course.id AND student.status IN ('ACTIVE','APPROVED')
    WHERE course.id=relation.snapshot_payload->'facts'->>'courseId' AND course.status='PUBLISHED' AND course.ended_at IS NULL
     AND course.creator_id=CASE WHEN subject.actor_role='TEACHER' THEN subject.user_id ELSE respondent.user_id END
     AND student.student_id=CASE WHEN subject.actor_role='STUDENT' THEN subject.user_id ELSE respondent.user_id END
   ))
 )
`

const TEACHER_INDIVIDUAL_SCALE_PREFIX = 'teacher-scale:'
const TEACHER_INDIVIDUAL_SCALE_SUFFIX = ':INDIVIDUAL'
const isTeacherIndividualScaleKey = (key: string): boolean =>
  key.startsWith(TEACHER_INDIVIDUAL_SCALE_PREFIX)
  && key.endsWith(TEACHER_INDIVIDUAL_SCALE_SUFFIX)
  && key.length >= TEACHER_INDIVIDUAL_SCALE_PREFIX.length + TEACHER_INDIVIDUAL_SCALE_SUFFIX.length

/**
 * Decompose the 18-table `currentRunPopulationAuthoritySql` into a flat,
 * scope-and-relationship-specialized boolean SQL expression for a single known
 * execution envelope. Returns `null` for rare shapes (observer/peer/parent/ALL
 * /course-scoped) so callers fall back to `currentRunPopulationAuthoritySql`.
 *
 * Because each decomposed branch touches only 5-7 PK/unique-indexed tables with
 * no multi-product disjunctions, PostgreSQL reuses cached generic plans instead
 * of forcing `force_custom_plan` re-planning on every request.
 */
export const buildDecomposedSingleExecutionAuthoritySql = (
  envelope: SingleExecutionAuthorityEnvelope,
  purpose: RunAuthorityPurpose = 'COLLECTION',
  productScope: RunPopulationProductScope = 'ALL',
): Prisma.Sql | null => {
  if (envelope.orgStatus !== 'ACTIVE') return Prisma.sql`FALSE`
  if ((productScope === 'CAMPUS_ONLY' || productScope === 'HUITEACHER_ONLY') && envelope.orgProductDomain !== 'SCHOOL') {
    return Prisma.sql`FALSE`
  }

  const sameActor = envelope.subjectActorSnapshotId === envelope.respondentActorSnapshotId
  const actorDenySql = purpose === 'REPORT_READ'
    ? Prisma.sql`deny.permission IN ('*','REPORT_READ','PARTICIPANT_REPORT_READ')`
    : Prisma.sql`deny.permission IN ('*','RUN_START')`
  const teacherDenySql = purpose === 'REPORT_READ'
    ? Prisma.sql`deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','REPORT_READ','PARTICIPANT_REPORT_READ')`
    : Prisma.sql`deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START')`

  // Fast Path 1: School Student SELF (CAMPUS_ONLY)
  if (
    productScope === 'CAMPUS_ONLY'
    && sameActor
    && envelope.relationshipKind === 'SELF'
    && envelope.relationshipCourseId === null
    && envelope.subjectRole === 'STUDENT'
    && envelope.subjectProvenance === 'ORG_MEMBER'
  ) {
    if (!envelope.subjectMembershipId || !envelope.subjectPersonaGrantId) return Prisma.sql`FALSE`
    if (purpose === 'REPORT_READ' && envelope.executionStatus !== 'COMPLETED') return Prisma.sql`FALSE`
    const clauses: Prisma.Sql[] = [
      Prisma.sql`EXISTS (
        SELECT 1 FROM organizations org
        JOIN users current_account ON current_account.id = ${envelope.subjectUserId}
        JOIN organization_memberships member
          ON member.id = ${envelope.subjectMembershipId}
          AND member.user_id = current_account.id
          AND member.organization_id = org.id
          AND ${currentWindowSql(Prisma.sql`member`)}
        JOIN organization_persona_grants persona
          ON persona.id = ${envelope.subjectPersonaGrantId}
          AND persona.organization_id = member.organization_id
          AND persona.membership_id = member.id
          AND persona.persona = 'STUDENT'
          AND persona.granted_at <= statement_timestamp()
          AND persona.revoked_at IS NULL
        WHERE org.id = ${envelope.organizationId}
          AND org.status = 'ACTIVE'
          AND org.product_domain = 'SCHOOL'
          AND current_account.account_domain = 'SCHOOL'
          AND ${usableRunAccountSql(Prisma.sql`current_account`)}
          AND NOT EXISTS (
            SELECT 1 FROM organization_access_denies deny
            WHERE deny.organization_id = org.id
              AND deny.user_id = current_account.id
              AND deny.lifted_at IS NULL
              AND ${actorDenySql}
          )
      )`,
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM huiteacher_evaluation_run_links h
        WHERE h.organization_id = ${envelope.organizationId} AND h.run_id = ${envelope.runId}
      )`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM campus_activity_runs ar
        JOIN campus_activities activity
          ON activity.course_id = ar.course_id
          AND activity.organization_id = ar.organization_id
          AND ${purpose === 'REPORT_READ'
            ? Prisma.sql`activity.status IN ('OPEN','PAUSED','CLOSED')`
            : Prisma.sql`activity.status = 'OPEN'`}
        JOIN campus_activity_participants member
          ON member.course_id = ar.course_id
          AND member.organization_id = ar.organization_id
          AND member.status = 'ACTIVE'
          AND member.membership_id = ${envelope.subjectMembershipId}
        JOIN campus_student_enrollments enrollment
          ON enrollment.user_id = ${envelope.subjectUserId}
          AND enrollment.organization_id = ar.organization_id
          AND enrollment.status = 'APPROVED'
        JOIN campus_class_admissions admission
          ON admission.organization_id = enrollment.organization_id
          AND admission.class_unit_id = enrollment.class_unit_id
          AND admission.status = 'APPROVED'
        JOIN organization_student_class_assignments class_assignment
          ON class_assignment.organization_id = ar.organization_id
          AND class_assignment.membership_id = ${envelope.subjectMembershipId}
          AND class_assignment.class_unit_id = enrollment.class_unit_id
          AND ${currentWindowSql(Prisma.sql`class_assignment`)}
        WHERE ar.organization_id = ${envelope.organizationId} AND ar.run_id = ${envelope.runId}
      )`,
    ]
    if (envelope.trackResourceKey.startsWith('education-composition:')) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM assessment_run_tracks school_ordinary
        WHERE school_ordinary.id = ${envelope.trackId}
          AND school_ordinary.organization_id = ${envelope.organizationId}
          AND school_ordinary.run_id = ${envelope.runId}
          AND ${educationCompositionTrackIdentitySql({
            track: Prisma.sql`school_ordinary`,
            organizationId: Prisma.sql`${envelope.organizationId}`,
            product: 'SCHOOL',
          })}
      )`)
    }
    if (purpose !== 'REPORT_READ' && envelope.trackResourceFamily === 'SCALE') {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM registered_assessment_resources registered
        WHERE registered.resource_key = ${envelope.trackResourceKey}
          AND registered.resource_version = ${envelope.trackResourceVersion}
          AND ((registered.resource_key LIKE 'library-scale:%:SCHOOL:%'
            AND registered.entry->'libraryOrigin'->>'product' = 'SCHOOL')
            OR ${privateScaleRegistryIdentitySql({
              registered: Prisma.sql`registered`,
              organizationId: Prisma.sql`${envelope.organizationId}`,
              product: 'SCHOOL',
            })})
          AND registered.entry->'applicability'->>'resourceKind' = 'SCALE'
      )`)
    }
    if (envelope.trackResourceFamily === 'FORM' && envelope.trackResourceKey.startsWith('private-form:')) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM assessment_run_tracks school_form
        WHERE school_form.id = ${envelope.trackId}
          AND school_form.organization_id = ${envelope.organizationId}
          AND school_form.run_id = ${envelope.runId}
          AND ${privateFormTrackIdentitySql({
            track: Prisma.sql`school_form`,
            organizationId: Prisma.sql`${envelope.organizationId}`,
            product: 'SCHOOL',
          })}
      )`)
    }
    return Prisma.sql`(${Prisma.join(clauses, ' AND ')})`
  }

  // Fast Path 2: Teacher SELF (HUITEACHER_ONLY)
  if (
    productScope === 'HUITEACHER_ONLY'
    && sameActor
    && envelope.relationshipKind === 'SELF'
    && envelope.relationshipCourseId === null
    && envelope.subjectRole === 'TEACHER'
    && envelope.subjectProvenance === 'ORG_MEMBER'
  ) {
    if (!envelope.subjectMembershipId || !envelope.subjectPersonaGrantId) return Prisma.sql`FALSE`
    const clauses: Prisma.Sql[] = [
      Prisma.sql`EXISTS (
        SELECT 1 FROM organizations org
        JOIN users current_account ON current_account.id = ${envelope.subjectUserId}
        JOIN organization_memberships member
          ON member.id = ${envelope.subjectMembershipId}
          AND member.user_id = current_account.id
          AND member.organization_id = org.id
          AND ${currentWindowSql(Prisma.sql`member`)}
        JOIN organization_persona_grants persona
          ON persona.id = ${envelope.subjectPersonaGrantId}
          AND persona.organization_id = member.organization_id
          AND persona.membership_id = member.id
          AND persona.persona = 'TEACHER'
          AND persona.granted_at <= statement_timestamp()
          AND persona.revoked_at IS NULL
        WHERE org.id = ${envelope.organizationId}
          AND org.status = 'ACTIVE'
          AND org.product_domain = 'SCHOOL'
          AND current_account.account_domain = 'SCHOOL'
          AND ${usableRunAccountSql(Prisma.sql`current_account`)}
          AND NOT EXISTS (
            SELECT 1 FROM organization_access_denies deny
            WHERE deny.organization_id = org.id
              AND deny.user_id = current_account.id
              AND deny.lifted_at IS NULL
              AND ${teacherDenySql}
          )
      )`,
      Prisma.sql`NOT EXISTS (
        SELECT 1 FROM campus_activity_runs school_excl
        WHERE school_excl.organization_id = ${envelope.organizationId} AND school_excl.run_id = ${envelope.runId}
      )`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM huiteacher_evaluation_run_links h
        JOIN huiteacher_evaluation_events event
          ON event.organization_id = h.organization_id
          AND event.id = h.event_id
          AND event.status IN ('OPEN', 'CLOSED')
          AND (event.status = 'OPEN' OR ${envelope.executionStatus} = 'COMPLETED')
        JOIN education_product_entitlements entitlement
          ON entitlement.organization_id = h.organization_id
          AND entitlement.product = 'HUITEACHER'
          AND entitlement.status = 'ACTIVE'
        WHERE h.organization_id = ${envelope.organizationId} AND h.run_id = ${envelope.runId}
      )`,
    ]
    if (envelope.trackResourceKey.startsWith('education-composition:')) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM assessment_run_tracks ordinary_track
        WHERE ordinary_track.id = ${envelope.trackId}
          AND ordinary_track.organization_id = ${envelope.organizationId}
          AND ordinary_track.run_id = ${envelope.runId}
          AND ${educationCompositionTrackIdentitySql({
            track: Prisma.sql`ordinary_track`,
            organizationId: Prisma.sql`${envelope.organizationId}`,
            product: 'TEACHER',
          })}
      )`)
    }
    if (envelope.trackResourceKey.startsWith('private-form:')) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM assessment_run_tracks private_form_track
        WHERE private_form_track.id = ${envelope.trackId}
          AND private_form_track.organization_id = ${envelope.organizationId}
          AND private_form_track.run_id = ${envelope.runId}
          AND ${privateFormTrackIdentitySql({
            track: Prisma.sql`private_form_track`,
            organizationId: Prisma.sql`${envelope.organizationId}`,
            product: 'TEACHER',
          })}
      )`)
    }
    if (envelope.trackResourceKey.startsWith('private-scale:')) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM registered_assessment_resources private_registered
        WHERE private_registered.resource_key = ${envelope.trackResourceKey}
          AND private_registered.resource_version = ${envelope.trackResourceVersion}
          AND ${privateScaleRegistryIdentitySql({
            registered: Prisma.sql`private_registered`,
            organizationId: Prisma.sql`${envelope.organizationId}`,
            product: 'TEACHER',
          })}
      )`)
    }
    if (
      envelope.trackResourceFamily === 'SCALE'
      && isTeacherIndividualScaleKey(envelope.trackResourceKey)
      && envelope.executionStatus !== 'COMPLETED'
    ) {
      clauses.push(Prisma.sql`EXISTS (
        SELECT 1 FROM registered_assessment_resources registered
        JOIN education_teacher_scale_licenses license
          ON license.resource_id = registered.id
          AND license.organization_id = ${envelope.organizationId}
          AND license.status = 'ACTIVE'
        WHERE registered.resource_key = ${envelope.trackResourceKey}
          AND registered.resource_version = ${envelope.trackResourceVersion}
          AND registered.status = 'PUBLISHED'
      )`)
    }
    return Prisma.sql`(${Prisma.join(clauses, ' AND ')})`
  }

  // Fast Path 3: Student evaluates Teacher (HUITEACHER_ONLY + CLASS_TEACHER_STUDENT)
  if (
    productScope === 'HUITEACHER_ONLY'
    && envelope.relationshipKind === 'CLASS_TEACHER_STUDENT'
    && envelope.relationshipCourseId === null
    && envelope.subjectRole === 'TEACHER'
    && envelope.respondentRole === 'STUDENT'
    && envelope.subjectProvenance === 'ORG_MEMBER'
    && envelope.respondentProvenance === 'ORG_MEMBER'
  ) {
    if (
      !envelope.subjectMembershipId || !envelope.subjectPersonaGrantId
      || !envelope.respondentMembershipId || !envelope.respondentPersonaGrantId
      || !envelope.relationshipStudentClassAssignmentId
      || !envelope.relationshipStaffClassAssignmentId
      || !envelope.relationshipClassUnitId
    ) return Prisma.sql`FALSE`
    return Prisma.sql`(
      EXISTS (
        SELECT 1 FROM organizations org
        JOIN users teacher_subject ON teacher_subject.id = ${envelope.subjectUserId}
        JOIN organization_memberships member
          ON member.id = ${envelope.subjectMembershipId}
          AND member.user_id = teacher_subject.id
          AND member.organization_id = org.id
          AND ${currentWindowSql(Prisma.sql`member`)}
        JOIN organization_persona_grants persona
          ON persona.id = ${envelope.subjectPersonaGrantId}
          AND persona.organization_id = member.organization_id
          AND persona.membership_id = member.id
          AND persona.persona = 'TEACHER'
          AND persona.granted_at <= statement_timestamp()
          AND persona.revoked_at IS NULL
        WHERE org.id = ${envelope.organizationId}
          AND org.status = 'ACTIVE'
          AND org.product_domain = 'SCHOOL'
          AND teacher_subject.account_domain = 'SCHOOL'
          AND teacher_subject.role IN ('TEACHER', 'ADMIN')
          AND ${usableRunAccountSql(Prisma.sql`teacher_subject`)}
          AND NOT EXISTS (
            SELECT 1 FROM organization_access_denies deny
            WHERE deny.organization_id = org.id
              AND deny.user_id = teacher_subject.id
              AND deny.lifted_at IS NULL
              AND ${actorDenySql}
          )
      )
      AND EXISTS (
        SELECT 1 FROM users student_respondent
        JOIN organization_memberships member
          ON member.id = ${envelope.respondentMembershipId}
          AND member.user_id = student_respondent.id
          AND member.organization_id = ${envelope.organizationId}
          AND ${currentWindowSql(Prisma.sql`member`)}
        JOIN organization_persona_grants persona
          ON persona.id = ${envelope.respondentPersonaGrantId}
          AND persona.organization_id = member.organization_id
          AND persona.membership_id = member.id
          AND persona.persona = 'STUDENT'
          AND persona.granted_at <= statement_timestamp()
          AND persona.revoked_at IS NULL
        WHERE student_respondent.id = ${envelope.respondentUserId}
          AND student_respondent.account_domain = 'SCHOOL'
          AND student_respondent.role = 'STUDENT'
          AND ${usableRunAccountSql(Prisma.sql`student_respondent`)}
          AND NOT EXISTS (
            SELECT 1 FROM organization_access_denies deny
            WHERE deny.organization_id = ${envelope.organizationId}
              AND deny.user_id = student_respondent.id
              AND deny.lifted_at IS NULL
              AND ${teacherDenySql}
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM campus_activity_runs school_excl
        WHERE school_excl.organization_id = ${envelope.organizationId} AND school_excl.run_id = ${envelope.runId}
      )
      AND EXISTS (
        SELECT 1 FROM huiteacher_evaluation_run_links h
        JOIN huiteacher_evaluation_events event
          ON event.organization_id = h.organization_id
          AND event.id = h.event_id
          AND event.status IN ('OPEN', 'CLOSED')
          AND (event.status = 'OPEN' OR ${envelope.executionStatus} = 'COMPLETED')
        JOIN education_product_entitlements entitlement
          ON entitlement.organization_id = h.organization_id
          AND entitlement.product = 'HUITEACHER'
          AND entitlement.status = 'ACTIVE'
        JOIN huiteacher_student_eval_configs cfg
          ON cfg.organization_id = h.organization_id
          AND cfg.event_id = h.event_id
          AND cfg.class_unit_id = ${envelope.relationshipClassUnitId}
          AND cfg.staff_assignment_id = ${envelope.relationshipStaffClassAssignmentId}
        JOIN assessment_run_tracks track
          ON track.organization_id = h.organization_id
          AND track.run_id = h.run_id
          AND track.id = ${envelope.trackId}
          AND ${studentEvaluationTrackConfigSql(Prisma.sql`track`, Prisma.sql`cfg`)}
        JOIN huiteacher_evaluation_targets target
          ON target.organization_id = cfg.organization_id
          AND target.id = event.target_id
          AND target.kind = 'PERSON'
          AND target.subject_user_id = ${envelope.subjectUserId}
        JOIN organization_staff_class_assignments staff
          ON staff.id = cfg.staff_assignment_id
          AND staff.organization_id = cfg.organization_id
          AND staff.class_unit_id = cfg.class_unit_id
          AND staff.staff_role IN ('TEACHING', 'HOMEROOM')
          AND ${currentWindowSql(Prisma.sql`staff`)}
        JOIN organization_student_class_assignments placement
          ON placement.id = ${envelope.relationshipStudentClassAssignmentId}
          AND placement.organization_id = cfg.organization_id
          AND placement.class_unit_id = cfg.class_unit_id
          AND placement.membership_id = ${envelope.respondentMembershipId}
          AND ${currentWindowSql(Prisma.sql`placement`)}
        WHERE h.organization_id = ${envelope.organizationId} AND h.run_id = ${envelope.runId}
      )
    )`
  }

  return null
}

/** Load the single-execution structural envelope via primary key for flat authority evaluation. */
export const loadSingleExecutionAuthorityEnvelope = async (
  db: Pick<PlannerBoundReadDb, '$queryRaw'>,
  executionId: string,
): Promise<SingleExecutionAuthorityEnvelope | null> => {
  const rows = await db.$queryRaw<SingleExecutionAuthorityEnvelope[]>(Prisma.sql`
    SELECT e.id AS "executionId",
      e.organization_id AS "organizationId",
      e.run_id AS "runId",
      e.track_id AS "trackId",
      e.status AS "executionStatus",
      org.status AS "orgStatus",
      org.product_domain AS "orgProductDomain",
      e.subject_actor_snapshot_id AS "subjectActorSnapshotId",
      e.respondent_actor_snapshot_id AS "respondentActorSnapshotId",
      subject.user_id AS "subjectUserId",
      subject.actor_role AS "subjectRole",
      subject.provenance_kind AS "subjectProvenance",
      subject.membership_id AS "subjectMembershipId",
      subject.snapshot_payload->>'personaGrantId' AS "subjectPersonaGrantId",
      respondent.user_id AS "respondentUserId",
      respondent.actor_role AS "respondentRole",
      respondent.provenance_kind AS "respondentProvenance",
      respondent.membership_id AS "respondentMembershipId",
      respondent.snapshot_payload->>'personaGrantId' AS "respondentPersonaGrantId",
      relation.relationship_kind AS "relationshipKind",
      relation.relationship_ref AS "relationshipRef",
      relation.snapshot_payload->'facts'->>'courseId' AS "relationshipCourseId",
      relation.snapshot_payload->'facts'->>'studentClassAssignmentId' AS "relationshipStudentClassAssignmentId",
      relation.snapshot_payload->'facts'->>'staffClassAssignmentId' AS "relationshipStaffClassAssignmentId",
      relation.snapshot_payload->'facts'->>'classUnitId' AS "relationshipClassUnitId",
      t.resource_family AS "trackResourceFamily",
      t.resource_key AS "trackResourceKey",
      t.resource_version AS "trackResourceVersion"
    FROM assessment_run_executions e
    JOIN organizations org ON org.id = e.organization_id
    JOIN assessment_run_tracks t
      ON t.id = e.track_id AND t.organization_id = e.organization_id AND t.run_id = e.run_id
    JOIN assessment_run_relationship_snapshots relation ON relation.id = e.relationship_snapshot_id
    JOIN assessment_run_actor_snapshots subject ON subject.id = e.subject_actor_snapshot_id
    JOIN assessment_run_actor_snapshots respondent ON respondent.id = e.respondent_actor_snapshot_id
    WHERE e.id = ${executionId}
    LIMIT 1
  `)
  return rows[0] ?? null
}

/**
 * Evaluate current Run population authority for one execution using the flat,
 * plan-cache-friendly decomposed path when applicable, falling back to the
 * full bounded-planner `currentRunPopulationAuthoritySql` for rare shapes.
 */
export const checkSingleExecutionPopulationAuthority = async (
  db: PlannerBoundReadDb,
  input: {
    executionId: string
    envelope?: SingleExecutionAuthorityEnvelope | null
    purpose?: RunAuthorityPurpose
    productScope?: RunPopulationProductScope
  },
): Promise<boolean> => {
  const purpose = input.purpose ?? 'COLLECTION'
  const productScope = input.productScope ?? 'ALL'
  const envelope = input.envelope !== undefined
    ? input.envelope
    : await loadSingleExecutionAuthorityEnvelope(db, input.executionId)
  if (!envelope) return false
  const decomposed = buildDecomposedSingleExecutionAuthoritySql(envelope, purpose, productScope)
  if (decomposed) {
    const rows = await db.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`SELECT ${decomposed} AS "allowed"`)
    return rows[0]?.allowed === true
  }
  const runFallback = async (client: Pick<PlannerBoundReadDb, '$queryRaw'>) => {
    const rows = await client.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
      SELECT ${currentRunPopulationAuthoritySql(Prisma.sql`${input.executionId}`, purpose, productScope)} AS "allowed"
    `)
    return rows[0]?.allowed === true
  }
  if (typeof db.$transaction === 'function') {
    return withBoundedPlannerRead(db, runFallback)
  }
  if (typeof db.$executeRaw === 'function') {
    await applyBoundedPlannerControls(db as Pick<PlannerBoundReadDb, '$executeRaw'>)
  }
  return runFallback(db)
}
