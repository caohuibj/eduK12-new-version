import { createHash } from 'node:crypto'
import { prisma } from '../../config/database'

export type CampusRegistrationEntry =
  | { kind: 'STUDENT'; organizationId: string; classUnitId: string }
  | { kind: 'PARENT' }
  | { kind: 'STAFF'; role: 'TEACHER' | 'COUNSELOR' | 'ADMIN' }
export class CampusRegistrationCodeError extends Error {
  readonly statusCode = 404
  readonly code = 'CAMPUS_REGISTRATION_CODE_UNAVAILABLE'
  constructor() { super('注册码暂不可用，请核实或联系学校') }
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Public, read-only form discovery from an unguessable bearer code.
 * No student/account/issuer identity, report, capability or MFA state is returned.
 * Discovery does not consume a code or authorize an account: original register
 * endpoints re-check all current authority and atomically consume on submission.
 */
export async function resolveCampusRegistrationCode(raw: string): Promise<CampusRegistrationEntry> {
  const code = raw.trim()
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(code)) throw new CampusRegistrationCodeError()
  // Query all domains; do not infer identity from token length, spelling or a UI choice.
  const [students, parents, staff] = await Promise.all([
    prisma.$queryRaw<Array<{ organizationId: string; classUnitId: string }>>`
      SELECT c.organization_id AS "organizationId",c.class_unit_id AS "classUnitId"
      FROM campus_activation_codes c
      JOIN organizations o ON o.id=c.organization_id AND o.product_domain='SCHOOL' AND o.status='ACTIVE'
      JOIN campus_class_admissions a ON a.organization_id=c.organization_id AND a.class_unit_id=c.class_unit_id
        AND a.status='OPEN' AND a.window_closes_at>statement_timestamp() AND a.roster_version=c.roster_version
      WHERE c.code_digest=${hash(code)} AND c.expires_at>statement_timestamp()
        AND c.revoked_at IS NULL AND c.consumed_at IS NULL LIMIT 2
    `,
    prisma.$queryRaw<Array<{ available: boolean }>>`
      SELECT TRUE AS available FROM parent_invite_codes i
      JOIN organizations o ON o.id=i.organization_id AND o.product_domain='SCHOOL' AND o.status='ACTIVE'
      JOIN users u ON u.id=i.student_user_id AND u.account_domain='SCHOOL' AND u.role='STUDENT'
        AND u.is_active=TRUE AND u.is_frozen=FALSE AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      JOIN campus_student_enrollments e ON e.user_id=u.id AND e.organization_id=o.id AND e.status='APPROVED'
      JOIN campus_class_admissions a ON a.class_unit_id=e.class_unit_id AND a.organization_id=o.id AND a.status='APPROVED'
      JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=o.id
        AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      WHERE i.code_hash=${hash('parent-invite-v1:'+code)} AND i.course_id IS NULL AND i.status='ACTIVE'
        AND i.consumed_at IS NULL AND i.expires_at>statement_timestamp()
        AND EXISTS (SELECT 1 FROM organization_persona_grants p WHERE p.membership_id=m.id
          AND p.organization_id=o.id AND p.persona='STUDENT' AND p.revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=o.id
          AND d.user_id=u.id AND d.lifted_at IS NULL AND d.permission IN ('*','PARENT_LINK')) LIMIT 2
    `,
    prisma.$queryRaw<Array<{ persona: string; adminRole: boolean }>>`
      SELECT DISTINCT i.id,i.persona,i.admin_role AS "adminRole" FROM campus_staff_invitations i
      JOIN organizations o ON o.id=i.organization_id AND o.product_domain='SCHOOL' AND o.status='ACTIVE'
      JOIN users u ON u.id=i.invited_by_user_id AND u.account_domain='SCHOOL' AND u.role IN ('ADMIN','TEACHER')
        AND u.is_active=TRUE AND u.is_frozen=FALSE AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=o.id AND m.org_role='ORG_ADMIN'
        AND m.valid_from<=i.created_at AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      WHERE i.token_hash=${hash('school-staff-invite:v1:'+code)} AND i.consumed_at IS NULL
        AND i.expires_at>statement_timestamp() AND i.persona IN ('TEACHER','COUNSELOR')
        AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=o.id
          AND d.user_id=u.id AND d.permission IN ('*','ORGANIZATION_GOVERNANCE')
          AND (d.lifted_at IS NULL OR d.denied_at>=i.created_at)) LIMIT 2
    `,
  ])
  // Ambiguous data never chooses a higher-privilege form or falls back to a role.
  if (students.length + parents.length + staff.length !== 1) throw new CampusRegistrationCodeError()
  if (students.length) return { kind: 'STUDENT', organizationId: students[0].organizationId, classUnitId: students[0].classUnitId }
  if (parents.length) return { kind: 'PARENT' }
  const match = staff[0]
  if (!['TEACHER', 'COUNSELOR'].includes(match.persona)) throw new CampusRegistrationCodeError()
  return { kind: 'STAFF', role: match.adminRole ? 'ADMIN' : match.persona as 'TEACHER' | 'COUNSELOR' }
}
