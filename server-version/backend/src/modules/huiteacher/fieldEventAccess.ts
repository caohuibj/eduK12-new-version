import { Prisma } from '@prisma/client'

/** Accepted external observers retain event authority without membership, but
 * current organization/product access denies still revoke that authority. */
export const fieldEventAccessAllowed = (organizationId: string | Prisma.Sql, userId: string) => Prisma.sql`
  NOT EXISTS (
    SELECT 1 FROM organization_access_denies access_deny
    WHERE access_deny.organization_id=${organizationId}
      AND access_deny.user_id=${userId} AND access_deny.lifted_at IS NULL
      AND access_deny.permission IN ('*','EDUCATION_ACCESS','HUITEACHER_ACCESS')
  )
`
