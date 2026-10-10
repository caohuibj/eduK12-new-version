import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveOrganizationAccessContext, contextHasCapability } from '../organization/access'
import { readOrganizationReportingArtifact } from '../reporting/pr4Service'
import { reportingFail } from '../reporting/types'

const hidden = (): never => reportingFail('CAMPUS_REPORT_NOT_FOUND', 'campus report not found', 404)

/** SCHOOL reports require current counselor persona AND a distinct psychology
 * capability; ORG_ADMIN, generic teacher and platform role are insufficient.
 * The source reader still checks the exact present client relationship.
 */
async function context(actor: AuthenticatedPrincipal, organizationId: string) {
  if (actor.accountDomain !== 'SCHOOL') hidden()
  const access = await resolveOrganizationAccessContext({ principal: actor, organizationId })
  if (!access || access.productDomain !== 'SCHOOL' || !access.membershipId
    || access.organizationStatus !== 'ACTIVE'
    || !access.personas.includes('COUNSELOR')
    || !contextHasCapability(access, 'PSYCHOLOGY_STAFF')
    || access.explicitDenies.some(d => ['*','REPORT_READ','REPORT_MEMBER_READ'].includes(d))) hidden()
  return access
}

/** A bounded index contains only the authorized student's campus pseudonym
 * and date. No score, answer, artifact payload or other student's data.
 */
export async function listCampusProfessionalReports(actor: AuthenticatedPrincipal, organizationId: string) {
  const access = await context(actor, organizationId)
  const rows = await prisma.$queryRaw<Array<{
    id:string;generatedAt:Date;subjectAlias:string;analysisKind:string;
  }>>`
    SELECT a.id,a.generated_at AS "generatedAt",student_alias.login_name AS "subjectAlias",
      a.analysis_kind AS "analysisKind"
    FROM reporting_analysis_artifacts a
    JOIN reporting_analysis_specs spec ON spec.id=a.spec_id AND spec.status='PUBLISHED'
    JOIN organizations o ON o.id=a.organization_id AND o.product_domain='SCHOOL' AND o.status='ACTIVE'
    JOIN users u ON u.id=COALESCE(a.subject_user_id,a.artifact_payload->'source'->>'subjectUserId')
      AND u.account_domain='SCHOOL' AND u.role='STUDENT' AND u.is_active=true AND u.is_frozen=false
      AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
    JOIN campus_accounts student_alias ON student_alias.user_id=u.id
    JOIN organization_memberships student_m ON student_m.organization_id=a.organization_id
      AND student_m.user_id=u.id
      AND student_m.valid_from<=statement_timestamp()
      AND (student_m.valid_until IS NULL OR student_m.valid_until>statement_timestamp())
    JOIN organization_persona_grants student_p ON student_p.organization_id=a.organization_id
      AND student_p.membership_id=student_m.id AND student_p.persona='CLIENT' AND student_p.revoked_at IS NULL
    JOIN organization_counselor_client_relationships counselor ON counselor.organization_id=a.organization_id
      AND counselor.counselor_membership_id=${access.membershipId}
      AND counselor.client_membership_id=student_m.id
      AND counselor.valid_from<=statement_timestamp()
      AND (counselor.valid_until IS NULL OR counselor.valid_until>statement_timestamp())
    WHERE a.organization_id=${organizationId}
      AND a.analysis_kind IN ('PROTECTED_FEEDBACK','INDIVIDUAL_LONGITUDINAL')
      AND NOT EXISTS (SELECT 1 FROM organization_access_denies d
        WHERE d.organization_id=a.organization_id AND d.lifted_at IS NULL
          AND d.user_id IN (${actor.userId},u.id)
          AND (d.permission IN ('*','REPORT_READ','REPORT_MEMBER_READ','PSYCHOLOGY_STAFF')
            OR d.permission=a.policy_domain))
    ORDER BY a.generated_at DESC,a.id DESC LIMIT 21
  `
  return {
    list: rows.slice(0,20).map(row=>({
      artifactId:row.id,subjectAlias:row.subjectAlias,
      analysisKind:row.analysisKind,generatedAt:row.generatedAt.toISOString(),
    })),
    hasMore: rows.length>20,
  }
}

/** The reporting engine, not a campus controller, remains the final metric,
 * scientific-contract, source and current professional relationship authority.
 */
export async function readCampusProfessionalReport(
  actor: AuthenticatedPrincipal, organizationId: string, artifactId: string,
) {
  await context(actor, organizationId)
  const valid = await prisma.$queryRaw<Array<{id:string}>>`
    SELECT id FROM reporting_analysis_artifacts
    WHERE id=${artifactId} AND organization_id=${organizationId}
      AND analysis_kind IN ('PROTECTED_FEEDBACK','INDIVIDUAL_LONGITUDINAL')
    LIMIT 1
  `
  if (!valid.length) hidden()
  return readOrganizationReportingArtifact({
    principal:{ userId:actor.userId, platformRole:actor.platformRole },
    organizationId, artifactId,
  })
}
