import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { resolveOrganizationAccessContext } from '../organization/access'
import type { ReportingPrincipal } from './authorization'
import { reportingFail } from './types'

export type IndividualScopeInput = { principal: ReportingPrincipal; organizationId: string; tx?: Prisma.TransactionClient }
const hidden = (): never => reportingFail('REPORT_NOT_FOUND', 'reporting resource not found', 404)

/** Shared SQL scope for discovery and access; aliases m (membership), never client-supplied. */
export async function individualSubjectScope(input: IndividualScopeInput): Promise<Prisma.Sql> {
  const context = await resolveOrganizationAccessContext(input,input.tx)
  if (!context?.membershipId || context.explicitDenies.some(d => ['*', 'REPORT_READ', 'REPORT_MEMBER_READ', 'ORG_INDIVIDUAL_REPORT_V1'].includes(d))) return hidden()
  if (context.organizationStatus !== 'ACTIVE') reportingFail('ORGANIZATION_SUSPENDED', 'organization is suspended', 409)
  const manager = context.capabilities.includes('PSYCHOLOGY_STAFF')
  if (!manager && !context.personas.some(p => p === 'TEACHER' || p === 'COUNSELOR')) return hidden()
  return Prisma.sql`m.user_id <> ${input.principal.userId} AND (
    ${manager} OR (m.valid_from <= statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until > statement_timestamp()) AND (
      (${context.personas.includes('TEACHER')} AND EXISTS (
        SELECT 1 FROM organization_staff_class_assignments staff
        JOIN organization_student_class_assignments student ON student.organization_id=staff.organization_id AND student.class_unit_id=staff.class_unit_id
        JOIN organization_persona_grants persona ON persona.organization_id=m.organization_id AND persona.membership_id=m.id AND persona.persona='STUDENT' AND persona.revoked_at IS NULL
        WHERE staff.organization_id=m.organization_id AND staff.membership_id=${context.membershipId} AND student.membership_id=m.id
          AND staff.valid_from <= statement_timestamp() AND (staff.valid_until IS NULL OR staff.valid_until > statement_timestamp())
          AND student.valid_from <= statement_timestamp() AND (student.valid_until IS NULL OR student.valid_until > statement_timestamp())
      )) OR (${context.personas.includes('COUNSELOR')} AND EXISTS (
        SELECT 1 FROM organization_counselor_client_relationships relation
        JOIN organization_persona_grants persona ON persona.organization_id=m.organization_id AND persona.membership_id=m.id AND persona.persona='CLIENT' AND persona.revoked_at IS NULL
        WHERE relation.organization_id=m.organization_id AND relation.counselor_membership_id=${context.membershipId} AND relation.client_membership_id=m.id
          AND relation.valid_from <= statement_timestamp() AND (relation.valid_until IS NULL OR relation.valid_until > statement_timestamp())
      ))
    ))
  )`
}

export async function assertIndividualLongitudinalAccess(input: IndividualScopeInput & { subjectUserId: string }) {
  const scope = await individualSubjectScope(input)
  const rows = await (input.tx??prisma).$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT m.id FROM organization_memberships m
    WHERE m.organization_id=${input.organizationId} AND m.user_id=${input.subjectUserId} AND (${scope}) LIMIT 1
  `)
  if (!rows.length) hidden()
}
