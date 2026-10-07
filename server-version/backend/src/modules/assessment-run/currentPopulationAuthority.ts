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
   AND (relation.snapshot_payload->'facts'->>'courseId' IS NULL OR EXISTS (
    SELECT 1 FROM courses course JOIN course_students student ON student.course_id=course.id AND student.status IN ('ACTIVE','APPROVED')
    WHERE course.id=relation.snapshot_payload->'facts'->>'courseId' AND course.status='PUBLISHED' AND course.ended_at IS NULL
     AND course.creator_id=CASE WHEN subject.actor_role='TEACHER' THEN subject.user_id ELSE respondent.user_id END
     AND student.student_id=CASE WHEN subject.actor_role='STUDENT' THEN subject.user_id ELSE respondent.user_id END
   ))
 )
`
