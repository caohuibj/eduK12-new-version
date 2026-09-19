import { Prisma } from '@prisma/client'
import { OrganizationDomainError } from './types'

type Tx = Prisma.TransactionClient

/**
 * Lock every organization where the user currently holds an ORG_ADMIN
 * membership. Deterministic ordering prevents lock-order inversions when a
 * single account governs multiple organizations.
 */
export async function lockOrganizationsForCurrentOrgAdmin(
  tx: Tx,
  userId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<Array<{ organizationId: string }>>`
    SELECT o."id" AS "organizationId"
    FROM "organizations" o
    JOIN "organization_memberships" m
      ON m."organization_id" = o."id"
    WHERE m."user_id" = ${userId}
      AND m."org_role" = 'ORG_ADMIN'
      AND m."valid_from" <= statement_timestamp()
      AND m."valid_until" IS NULL
    ORDER BY o."id"
    FOR UPDATE OF o
  `
  return rows.map((row) => row.organizationId)
}

/**
 * A usable ORG_ADMIN is both a current admin membership and an account that
 * can pass the shared account-status authority checks. Legacy User.role only
 * participates here in the existing TEACHER approval lifecycle; it never
 * grants Organization authority. Forced-password state is also unusable for
 * Organization governance until the user completes the required password
 * change.
 */
export async function countUsableCurrentOrgAdmins(
  tx: Tx,
  organizationId: string,
  excludedUserId?: string,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM "organization_memberships" m
    JOIN "users" u ON u."id" = m."user_id"
    WHERE m."organization_id" = ${organizationId}
      AND m."org_role" = 'ORG_ADMIN'
      AND m."valid_from" <= statement_timestamp()
      AND m."valid_until" IS NULL
      AND (${excludedUserId ?? null}::text IS NULL OR m."user_id" <> ${excludedUserId ?? null})
      AND u."is_active" = TRUE
      AND u."is_frozen" = FALSE
      AND u."must_change_password" = FALSE
      AND (u."expires_at" IS NULL OR u."expires_at" > statement_timestamp())
      AND (u."role" <> 'TEACHER' OR u."teacher_approved" = TRUE)
  `
  return rows[0]?.count ?? 0
}

/**
 * Call only while the Organization row is locked. This preserves the I-05
 * serialization guarantee while applying the stronger "usable admin"
 * definition consistently across demote, membership end, deactivation,
 * freezing, and forced credential reset.
 */
export async function assertAlternativeUsableOrgAdmin(
  tx: Tx,
  organizationId: string,
  removedUserId: string,
): Promise<void> {
  const alternatives = await countUsableCurrentOrgAdmins(tx, organizationId, removedUserId)
  if (alternatives === 0) {
    throw new OrganizationDomainError(
      'LAST_ORG_ADMIN',
      '组织必须至少保留一个可用的组织管理员',
      409,
    )
  }
}
