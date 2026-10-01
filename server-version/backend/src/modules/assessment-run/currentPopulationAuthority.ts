import { Prisma } from '@prisma/client'

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
    SELECT 1 FROM assessment_run_actor_snapshots actor JOIN users account ON account.id=actor.user_id
    WHERE actor.id IN (x.subject_actor_snapshot_id,x.respondent_actor_snapshot_id)
     AND (NOT account.is_active OR account.is_frozen OR account.must_change_password
      OR (account.role='TEACHER' AND NOT account.teacher_approved)
      OR (account.expires_at IS NOT NULL AND account.expires_at<=statement_timestamp())
      OR EXISTS(SELECT 1 FROM organization_access_denies deny WHERE deny.organization_id=org.id
       AND deny.user_id=actor.user_id AND deny.lifted_at IS NULL AND deny.permission IN ('*','RUN_START'))
      OR NOT (
       (actor.provenance_kind='ORG_MEMBER' AND EXISTS (
        SELECT 1 FROM organization_memberships member JOIN organization_persona_grants persona
         ON persona.membership_id=member.id AND persona.organization_id=member.organization_id
        WHERE member.id=actor.membership_id AND member.user_id=actor.user_id AND member.organization_id=org.id
         AND member.valid_from<=statement_timestamp() AND member.valid_until IS NULL
         AND persona.id=actor.snapshot_payload->>'personaGrantId' AND persona.persona=actor.actor_role AND persona.revoked_at IS NULL
       )) OR (actor.provenance_kind='EXTERNAL_PARENT' AND actor.actor_role='PARENT' AND EXISTS (
        SELECT 1 FROM parent_student_relationships parent_link JOIN organization_memberships child
         ON child.user_id=parent_link.student_user_id AND child.organization_id=org.id
        JOIN organization_persona_grants child_persona ON child_persona.membership_id=child.id AND child_persona.organization_id=child.organization_id
        WHERE parent_link.parent_user_id=actor.user_id AND parent_link.status='ACTIVE' AND parent_link.approved_at IS NOT NULL
         AND child.valid_from<=statement_timestamp() AND child.valid_until IS NULL
         AND child_persona.persona='STUDENT' AND child_persona.revoked_at IS NULL
       ))
      ))
   )
   AND (relation.relationship_kind='SELF'
    OR (relation.relationship_kind='PARENT_CHILD' AND EXISTS (
     SELECT 1 FROM parent_student_relationships parent_link WHERE parent_link.id=relation.relationship_ref
      AND parent_link.status='ACTIVE' AND parent_link.approved_at IS NOT NULL
    ))
    OR (relation.relationship_kind='COUNSELOR_CLIENT' AND EXISTS (
     SELECT 1 FROM organization_counselor_client_relationships client_link WHERE client_link.id=relation.relationship_ref
      AND client_link.organization_id=org.id AND client_link.valid_until IS NULL
    ))
    OR (relation.relationship_kind IN ('CLASS_TEACHER_STUDENT','COURSE_TEACHER_STUDENT') AND EXISTS (
     SELECT 1 FROM organization_student_class_assignments student_class JOIN organization_staff_class_assignments staff_class
      ON staff_class.organization_id=student_class.organization_id AND staff_class.class_unit_id=student_class.class_unit_id
     WHERE student_class.id=relation.snapshot_payload->'facts'->>'studentClassAssignmentId'
      AND staff_class.id=relation.snapshot_payload->'facts'->>'staffClassAssignmentId'
      AND student_class.organization_id=org.id AND student_class.valid_until IS NULL AND staff_class.valid_until IS NULL
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
