import { Prisma } from '@prisma/client'
import type { AuthenticatedPrincipal } from '../../types'
import { assertDisclosureOfficer } from './authorization'
import { fail, type ParentReportSource } from './contracts'
import { assertProtectedFeedbackManagerAccess } from '../reporting/protectedFeedback'
import { assertIndividualLongitudinalAccess } from '../reporting/individualAuthorization'
import { ReportingError } from '../reporting/types'
type Tx = Prisma.TransactionClient
type Principal = Pick<AuthenticatedPrincipal, 'userId' | 'role' | 'platformRole'>
/** Exact immutable source plus current disclosure AND source reader authority. */
export async function assertDisclosureSourceAccess(tx: Tx, actor: Principal, source: Pick<ParentReportSource, 'artifactId' | 'organizationId' | 'subjectUserId' | 'policyDomain'>): Promise<void> {
 const organizationId = source.organizationId ?? fail()
 await assertDisclosureOfficer(tx, actor, organizationId)
 const rows = await tx.$queryRaw<Array<{ kind: string }>>`
  SELECT analysis_kind AS kind FROM reporting_analysis_artifacts
  WHERE id=${source.artifactId} AND organization_id=${organizationId} AND policy_domain=${source.policyDomain} LIMIT 1
 `
 const input = { principal: actor, organizationId, subjectUserId: source.subjectUserId, tx }
 try {
  if (rows[0]?.kind === 'PROTECTED_FEEDBACK') await assertProtectedFeedbackManagerAccess(input)
  else if (rows[0]?.kind === 'INDIVIDUAL_LONGITUDINAL') await assertIndividualLongitudinalAccess(input)
  else fail()
 } catch (error) {
  if (error instanceof ReportingError && [403, 404, 409].includes(error.statusCode)) fail()
  throw error
 }
}
/** The same current-source contract inside the existing grant discovery query.
 * Aliases are fixed server SQL: officer (membership), a (source), g (grant).
 * Filtering here, before DISTINCT/pagination, preserves alternate valid grants.
 */
export const currentOfficerSourceSql = Prisma.sql`
 a.analysis_kind IN ('PROTECTED_FEEDBACK','INDIVIDUAL_LONGITUDINAL')
 AND officer.user_id <> g.student_user_id
 AND NOT EXISTS (
  SELECT 1 FROM organization_access_denies source_deny
  WHERE source_deny.organization_id=officer.organization_id AND source_deny.user_id=officer.user_id
   AND source_deny.lifted_at IS NULL
   AND (source_deny.permission IN ('*','REPORT_READ','REPORT_MEMBER_READ','PARENT_REPORT_DISCLOSURE') OR source_deny.permission=a.policy_domain)
 )
 AND (

  (
   EXISTS(SELECT 1 FROM organizations school_org
     WHERE school_org.id=officer.organization_id AND school_org.product_domain='SCHOOL')
   AND EXISTS(SELECT 1 FROM organization_capability_grants school_cap
     WHERE school_cap.organization_id=officer.organization_id AND school_cap.membership_id=officer.id
       AND school_cap.capability='PSYCHOLOGY_STAFF' AND school_cap.revoked_at IS NULL)
   AND EXISTS(SELECT 1 FROM organization_persona_grants school_persona
     WHERE school_persona.organization_id=officer.organization_id AND school_persona.membership_id=officer.id
       AND school_persona.persona='COUNSELOR' AND school_persona.revoked_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM organization_access_denies professional_deny
     WHERE professional_deny.organization_id=officer.organization_id AND professional_deny.user_id=officer.user_id
       AND professional_deny.lifted_at IS NULL AND professional_deny.permission='PSYCHOLOGY_STAFF')
   AND EXISTS(
     SELECT 1 FROM organization_counselor_client_relationships current_relation
     JOIN organization_memberships child_member
       ON child_member.organization_id=current_relation.organization_id
       AND child_member.id=current_relation.client_membership_id
       AND child_member.user_id=g.student_user_id
       AND child_member.valid_from<=statement_timestamp()
       AND (child_member.valid_until IS NULL OR child_member.valid_until>statement_timestamp())
     JOIN organization_persona_grants child_persona
       ON child_persona.organization_id=child_member.organization_id
       AND child_persona.membership_id=child_member.id
       AND child_persona.persona='CLIENT' AND child_persona.revoked_at IS NULL
     WHERE current_relation.organization_id=officer.organization_id
       AND current_relation.counselor_membership_id=officer.id
       AND current_relation.valid_from<=statement_timestamp()
       AND (current_relation.valid_until IS NULL OR current_relation.valid_until>statement_timestamp())
   )
  )
  OR (
   NOT EXISTS(SELECT 1 FROM organizations school_org WHERE school_org.id=officer.organization_id AND school_org.product_domain='SCHOOL')
   AND (
  EXISTS (SELECT 1 FROM organization_capability_grants source_cap WHERE source_cap.organization_id=officer.organization_id AND source_cap.membership_id=officer.id AND source_cap.capability='PSYCHOLOGY_STAFF' AND source_cap.revoked_at IS NULL)
  OR (a.analysis_kind='PROTECTED_FEEDBACK' AND officer.org_role='ORG_ADMIN')
  OR (
   EXISTS (SELECT 1 FROM organization_persona_grants source_persona WHERE source_persona.organization_id=officer.organization_id AND source_persona.membership_id=officer.id AND source_persona.persona='TEACHER' AND source_persona.revoked_at IS NULL)
   AND EXISTS (
    SELECT 1 FROM organization_staff_class_assignments staff
    JOIN organization_student_class_assignments student ON student.organization_id=staff.organization_id AND student.class_unit_id=staff.class_unit_id
    JOIN organization_memberships subject_m ON subject_m.id=student.membership_id AND subject_m.organization_id=student.organization_id AND subject_m.user_id=g.student_user_id
    JOIN organization_persona_grants subject_p ON subject_p.membership_id=subject_m.id AND subject_p.organization_id=subject_m.organization_id AND subject_p.persona='STUDENT' AND subject_p.revoked_at IS NULL
    WHERE staff.organization_id=officer.organization_id AND staff.membership_id=officer.id
     AND (CASE WHEN a.analysis_kind='PROTECTED_FEEDBACK' THEN staff.valid_until IS NULL AND student.valid_until IS NULL AND subject_m.valid_until IS NULL
      ELSE subject_m.valid_from<=statement_timestamp() AND (subject_m.valid_until IS NULL OR subject_m.valid_until>statement_timestamp()) AND staff.valid_from<=statement_timestamp() AND (staff.valid_until IS NULL OR staff.valid_until>statement_timestamp()) AND student.valid_from<=statement_timestamp() AND (student.valid_until IS NULL OR student.valid_until>statement_timestamp()) END)
   )
  )
  OR (
   EXISTS (SELECT 1 FROM organization_persona_grants source_persona WHERE source_persona.organization_id=officer.organization_id AND source_persona.membership_id=officer.id AND source_persona.persona='COUNSELOR' AND source_persona.revoked_at IS NULL)
   AND EXISTS (
    SELECT 1 FROM organization_counselor_client_relationships relation
    JOIN organization_memberships subject_m ON subject_m.id=relation.client_membership_id AND subject_m.organization_id=relation.organization_id AND subject_m.user_id=g.student_user_id
    JOIN organization_persona_grants subject_p ON subject_p.membership_id=subject_m.id AND subject_p.organization_id=subject_m.organization_id AND subject_p.persona='CLIENT' AND subject_p.revoked_at IS NULL
    WHERE relation.organization_id=officer.organization_id AND relation.counselor_membership_id=officer.id
     AND (CASE WHEN a.analysis_kind='PROTECTED_FEEDBACK' THEN relation.valid_until IS NULL AND subject_m.valid_until IS NULL
      ELSE subject_m.valid_from<=statement_timestamp() AND (subject_m.valid_until IS NULL OR subject_m.valid_until>statement_timestamp()) AND relation.valid_from<=statement_timestamp() AND (relation.valid_until IS NULL OR relation.valid_until>statement_timestamp()) END)
   )
  )
   )
  )
 )
`
