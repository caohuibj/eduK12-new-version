import { Prisma } from '@prisma/client'
import type { AuthenticatedPrincipal } from '../../types'
import { fail } from './contracts'
type Tx=Prisma.TransactionClient
type Principal=Pick<AuthenticatedPrincipal,'userId'|'role'|'platformRole'>
export async function assertDisclosureOfficer(tx:Tx,actor:Principal,organizationId:string) {
  const rows=await tx.$queryRaw<Array<{id:string}>>`
    SELECT m.id FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
    JOIN users u ON u.id=m.user_id
    JOIN organization_capability_grants c ON c.organization_id=m.organization_id AND c.membership_id=m.id
    WHERE m.organization_id=${organizationId} AND m.user_id=${actor.userId} AND o.status='ACTIVE'
      AND m.valid_from<=statement_timestamp() AND (m.valid_until IS NULL OR m.valid_until>statement_timestamp())
      AND c.capability='PARENT_REPORT_DISCLOSURE' AND c.revoked_at IS NULL
      AND u.is_active=true AND u.is_frozen=false AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
      AND NOT EXISTS (SELECT 1 FROM organization_access_denies d WHERE d.organization_id=m.organization_id AND d.user_id=m.user_id AND d.lifted_at IS NULL AND d.permission IN ('*','REPORT_READ','PARENT_REPORT_DISCLOSURE'))
    LIMIT 1 FOR SHARE OF m,c,u,o
  `
  if(!rows.length)fail()
}
