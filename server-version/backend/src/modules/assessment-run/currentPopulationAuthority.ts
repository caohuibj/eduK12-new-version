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
   AND (org.product_domain<>'SCHOOL' OR (
    EXISTS(SELECT 1 FROM campus_activity_runs ar
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
