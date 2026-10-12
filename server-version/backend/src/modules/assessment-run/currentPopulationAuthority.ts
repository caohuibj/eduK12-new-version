import { Prisma } from '@prisma/client'
import { currentRunActorAuthoritySql, currentWindowSql } from './currentActorAuthority'

/** Shared current population gate. Intake deadlines do not remove own history.
 * executionId is a static SQL expression supplied by the caller, never user SQL.
 */
export const currentRunPopulationAuthoritySql = (executionId: Prisma.Sql): Prisma.Sql => Prisma.sql`
 EXISTS (
  SELECT 1 FROM assessment_run_executions x JOIN organizations org ON org.id=x.organization_id
  JOIN assessment_run_relationship_snapshots relation ON relation.id=x.relationship_snapshot_id
  JOIN assessment_run_actor_snapshots subject ON subject.id=x.subject_actor_snapshot_id
  JOIN assessment_run_actor_snapshots respondent ON respondent.id=x.respondent_actor_snapshot_id
  WHERE x.id=${executionId} AND org.status='ACTIVE'
   AND NOT EXISTS (
    SELECT 1 FROM assessment_run_actor_snapshots actor
    WHERE actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
      AND NOT (${currentRunActorAuthoritySql({ userId: Prisma.sql`actor.user_id`, organizationId: Prisma.sql`org.id`,
        provenance: Prisma.sql`actor.provenance_kind`, membershipId: Prisma.sql`actor.membership_id`,
        personaGrantId: Prisma.sql`actor.snapshot_payload->>'personaGrantId'`, role: Prisma.sql`actor.actor_role` })})
   )
   AND (relation.relationship_kind='SELF'
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
   )
   -- A campus respondent may only use a published Run while its Activity is
   -- OPEN and every STUDENT actor remains independently approved and selected.
   -- No original training Run is affected by this product-domain predicate.
   -- Shared education identity does not imply that every School-domain Run
   -- belongs to Huischool. Teacher Form Runs use a different authorized event
   -- and must not depend on psychology enrollment or a Campus Activity.
   AND (org.product_domain<>'SCHOOL' OR (
    EXISTS(
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
            AND deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START')
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
              AND track.resource_family='FORM'
              AND track.resource_key='huiteacher-student-form:'||cfg.form_id
              AND track.resource_version=cfg.definition_digest
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
              AND deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS','RUN_START')
          )
        )
        )
    )
   ) OR (
    NOT EXISTS(SELECT 1 FROM huiteacher_evaluation_run_links h
      WHERE h.organization_id=org.id AND h.run_id=x.run_id)
    AND EXISTS(SELECT 1 FROM campus_activity_runs ar
      JOIN campus_activities activity ON activity.course_id=ar.course_id
        AND activity.organization_id=ar.organization_id
      WHERE ar.organization_id=org.id AND ar.run_id=x.run_id
        AND activity.status='OPEN')
    AND EXISTS(
      SELECT 1 FROM assessment_run_actor_snapshots student_actor
      WHERE student_actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
        AND student_actor.actor_role='STUDENT')
    AND NOT EXISTS(
      SELECT 1 FROM assessment_run_actor_snapshots student_actor
      WHERE student_actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
        AND student_actor.actor_role='STUDENT'
        AND NOT EXISTS(
          SELECT 1 FROM campus_activity_runs ar
          JOIN campus_activities activity ON activity.course_id=ar.course_id
            AND activity.organization_id=ar.organization_id AND activity.status='OPEN'
          JOIN campus_activity_participants member ON member.course_id=ar.course_id
            AND member.organization_id=ar.organization_id AND member.status='ACTIVE'
            AND member.membership_id=student_actor.membership_id
          JOIN organization_memberships membership ON membership.id=member.membership_id
            AND membership.organization_id=member.organization_id
            AND membership.user_id=student_actor.user_id
            AND ${currentWindowSql(Prisma.sql`membership`)}
          JOIN campus_student_enrollments enrollment ON enrollment.user_id=student_actor.user_id
            AND enrollment.organization_id=member.organization_id AND enrollment.status='APPROVED'
          JOIN campus_class_admissions admission ON admission.organization_id=enrollment.organization_id
            AND admission.class_unit_id=enrollment.class_unit_id AND admission.status='APPROVED'
          JOIN organization_student_class_assignments class_assignment
            ON class_assignment.organization_id=member.organization_id
            AND class_assignment.membership_id=member.membership_id
            AND class_assignment.class_unit_id=enrollment.class_unit_id
            AND ${currentWindowSql(Prisma.sql`class_assignment`)}
          JOIN users campus_student ON campus_student.id=student_actor.user_id
            AND campus_student.account_domain='SCHOOL'
            AND campus_student.is_active=TRUE AND campus_student.is_frozen=FALSE
          WHERE ar.organization_id=org.id AND ar.run_id=x.run_id
        )
    )
    AND NOT EXISTS(
      SELECT 1 FROM assessment_run_actor_snapshots foreign_actor
      JOIN users actor_user ON actor_user.id=foreign_actor.user_id
      WHERE foreign_actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
        AND actor_user.account_domain<>'SCHOOL'
    )
   ))
   AND (relation.snapshot_payload->'facts'->>'courseId' IS NULL OR EXISTS (
    SELECT 1 FROM courses course JOIN course_students student ON student.course_id=course.id AND student.status IN ('ACTIVE','APPROVED')
    WHERE course.id=relation.snapshot_payload->'facts'->>'courseId' AND course.status='PUBLISHED' AND course.ended_at IS NULL
     AND course.creator_id=CASE WHEN subject.actor_role='TEACHER' THEN subject.user_id ELSE respondent.user_id END
     AND student.student_id=CASE WHEN subject.actor_role='STUDENT' THEN subject.user_id ELSE respondent.user_id END
   ))
 )
`
