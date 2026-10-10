import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { listAssignedRunTasks } from '../assessment-run/productRead'
import { CampusActivityError } from './activity.service'
import { campusStudentReference } from './studentReference'

type EligibleTeacherExecution={
  executionId:string;runId:string;organizationId:string;activityId:string
  activityTitle:string;studentUserId:string
}

/** Every item is an existing frozen Run execution, not a new campus scoring
 * path. The eligibility query requires a live teacher->class->student chain.
 * The canonical task reader independently rechecks present Run authority.
 */
export async function listCampusTeacherRunTasks(actor: AuthenticatedPrincipal) {
  if(actor.accountDomain!=='SCHOOL'||actor.role!=='TEACHER')
    throw new CampusActivityError('CAMPUS_TEACHER_REQUIRED',403)
  const candidates=await prisma.$queryRaw<EligibleTeacherExecution[]>`
    SELECT e.id AS "executionId",e.run_id AS "runId",
      ar.organization_id AS "organizationId",ar.course_id AS "activityId",
      course.title AS "activityTitle",s.user_id AS "studentUserId"
    FROM assessment_run_executions e
    JOIN assessment_run_actor_snapshots r ON r.organization_id=e.organization_id
      AND r.run_id=e.run_id AND r.id=e.respondent_actor_snapshot_id
      AND r.user_id=${actor.userId} AND r.actor_role='TEACHER' AND r.provenance_kind='ORG_MEMBER'
    JOIN assessment_run_actor_snapshots s ON s.organization_id=e.organization_id
      AND s.run_id=e.run_id AND s.id=e.subject_actor_snapshot_id
      AND s.actor_role='STUDENT' AND s.provenance_kind='ORG_MEMBER'
    JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id
      AND a.relationship_kind='CLASS_TEACHER_STUDENT' AND a.policy_domain='ORGANIZATION_RUN'
    JOIN campus_activity_runs ar ON ar.organization_id=e.organization_id AND ar.run_id=e.run_id
    JOIN campus_activities activity ON activity.organization_id=ar.organization_id
      AND activity.course_id=ar.course_id AND activity.status='OPEN'
    JOIN courses course ON course.id=activity.course_id AND course.course_type='CAMPUS_ACTIVITY'
    JOIN organizations org ON org.id=ar.organization_id AND org.status='ACTIVE' AND org.product_domain='SCHOOL'
    JOIN assessment_runs run ON run.id=e.run_id AND run.organization_id=e.organization_id
      AND run.status='PUBLISHED'
    JOIN organization_memberships teacher ON teacher.id=r.membership_id
      AND teacher.organization_id=e.organization_id AND teacher.user_id=${actor.userId}
      AND teacher.valid_from<=statement_timestamp()
      AND (teacher.valid_until IS NULL OR teacher.valid_until>statement_timestamp())
    JOIN organization_persona_grants teacher_role ON teacher_role.organization_id=teacher.organization_id
      AND teacher_role.membership_id=teacher.id AND teacher_role.persona='TEACHER'
      AND teacher_role.revoked_at IS NULL
    JOIN organization_memberships student ON student.id=s.membership_id
      AND student.organization_id=e.organization_id AND student.user_id=s.user_id
      AND student.valid_from<=statement_timestamp()
      AND (student.valid_until IS NULL OR student.valid_until>statement_timestamp())
    JOIN organization_persona_grants student_role ON student_role.organization_id=student.organization_id
      AND student_role.membership_id=student.id AND student_role.persona='STUDENT'
      AND student_role.revoked_at IS NULL
    JOIN users teacher_user ON teacher_user.id=teacher.user_id AND teacher_user.account_domain='SCHOOL'
      AND teacher_user.is_active=TRUE AND teacher_user.is_frozen=FALSE
    JOIN users student_user ON student_user.id=student.user_id AND student_user.account_domain='SCHOOL'
      AND student_user.is_active=TRUE AND student_user.is_frozen=FALSE
    WHERE EXISTS (
      SELECT 1 FROM campus_student_enrollments enrollment
      JOIN campus_class_admissions admission ON admission.organization_id=enrollment.organization_id
        AND admission.class_unit_id=enrollment.class_unit_id AND admission.status='APPROVED'
      JOIN organization_student_class_assignments student_class
        ON student_class.organization_id=enrollment.organization_id AND student_class.membership_id=student.id
        AND student_class.class_unit_id=enrollment.class_unit_id
        AND student_class.valid_from<=statement_timestamp()
        AND (student_class.valid_until IS NULL OR student_class.valid_until>statement_timestamp())
      JOIN organization_staff_class_assignments staff_class
        ON staff_class.organization_id=enrollment.organization_id AND staff_class.membership_id=teacher.id
        AND staff_class.class_unit_id=student_class.class_unit_id
        AND staff_class.valid_from<=statement_timestamp()
        AND (staff_class.valid_until IS NULL OR staff_class.valid_until>statement_timestamp())
      JOIN campus_activity_participants selected
        ON selected.organization_id=enrollment.organization_id
        AND selected.course_id=ar.course_id AND selected.membership_id=student.id
        AND selected.status='ACTIVE'
      WHERE enrollment.organization_id=e.organization_id
        AND enrollment.user_id=student.user_id AND enrollment.status='APPROVED'
    )
      AND NOT EXISTS (SELECT 1 FROM organization_access_denies d
        WHERE d.organization_id=e.organization_id AND d.user_id IN (${actor.userId},s.user_id)
          AND d.lifted_at IS NULL AND d.permission IN ('*','RUN_START','ACTIVITY_READ'))
    ORDER BY e.created_at DESC,e.id DESC LIMIT 101
  `
  const allowed=candidates.slice(0,100)
  if(!allowed.length)return {list:[],truncated:candidates.length>100}
  const official=await listAssignedRunTasks(actor.userId,{
    runIds:[...new Set(allowed.map(t=>t.runId))],
  })
  const byExecution=new Map(allowed.map(row=>[row.executionId,row]))
  const list=official.list.flatMap(row=>{
    const access=byExecution.get(row.executionId)
    if(!access || row.organizationId!==access.organizationId
      || row.respondentRole!=='TEACHER'||row.subjectRole!=='STUDENT'
      || row.relationship!=='CLASS_TEACHER_STUDENT')return []
    return [{
      executionId:row.executionId,runId:row.runId,
      organizationId:access.organizationId,activityId:access.activityId,
      activityTitle:access.activityTitle,runTitle:row.runName,
      studentReference:campusStudentReference(access.organizationId,access.studentUserId),
      status:row.status,deadline:row.deadline?.toISOString()??null,
      consentRequired:row.consentRequired,consentPurpose:row.consentPurpose,
      consentVisibility:row.consentVisibility,
    }]
  })
  return {list,truncated:candidates.length>100||official.truncated}
}
