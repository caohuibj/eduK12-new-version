import { UserRole, type Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AdminEntry } from '../admin-permissions/service'

export type PlatformRole = 'SYSTEM_ADMIN' | 'STANDARD'

export interface CurrentPrincipal {
  userId: string
  username: string
  accountDomain: 'LEGACY' | 'TRAINING' | 'SCHOOL' | 'SURVEY'
  role: UserRole
  platformRole: PlatformRole
  tokenVersion: number
  mustChangePassword: boolean
  isActive: boolean
  isFrozen: boolean
  expiresAt: Date | null
  teacherApproved: boolean
  entryGrants?: Array<{ entry: AdminEntry; version: number }>
  businessRole?: UserRole
  /** Same database facts the standalone MFA cascade evaluated, resolved in
   * this same roundtrip (X-05B L-Fast V1): true only for SCHOOL-domain
   * accounts holding an admin role, ORG_ADMIN membership, an active
   * PRODUCT_ADMIN grant, or a sensitive capability grant
   * (PSYCHOLOGY_STAFF, PARENT_REPORT_DISCLOSURE, REPORT_MEMBER_EXPORT,
   * REPORT_EXPORT). Required: the auth middleware fails closed when absent. */
  needsMfa: boolean
}

/** Select an existing business identity; this can only remove the Training
 * compatibility ADMIN projection, never manufacture a participant role. */
export function asBusinessPrincipal<T extends {role:UserRole;businessRole?:UserRole;teacherApproved?:boolean}>(principal:T):T|null {
  const role=principal.businessRole??principal.role
  return role===UserRole.ADMIN||(role===UserRole.TEACHER&&principal.teacherApproved===false)?null:{...principal,role}
}

type PrincipalRow = Omit<CurrentPrincipal, 'userId'> & {
  userId?: string
  id?: string
}

export async function loadCurrentPrincipal(userId: string, db: Pick<Prisma.TransactionClient, '$queryRaw'> = prisma): Promise<CurrentPrincipal | null> {
  const rows = await db.$queryRaw<PrincipalRow[]>`
    WITH target_user AS MATERIALIZED (
      SELECT
        "id",
        "username",
        "account_domain",
        "role",
        "platform_role",
        "token_version",
        "must_change_password",
        "is_active",
        "is_frozen",
        "expires_at",
        "teacher_approved"
      FROM "users"
      WHERE "id" = ${userId}
      LIMIT 1
    ),
    active_memberships AS MATERIALIZED (
      SELECT m."id", m."organization_id", m."org_role"
      FROM target_user u
      JOIN "organization_memberships" m ON m."user_id" = u."id"
      JOIN "organizations" o ON o."id" = m."organization_id" AND o."status" = 'ACTIVE'
      WHERE u."account_domain" = 'SCHOOL'
        AND m."valid_from" <= statement_timestamp()
        AND (m."valid_until" IS NULL OR m."valid_until" > statement_timestamp())
    )
    SELECT
      u."id" AS "userId",
      u."username",
      u."account_domain" AS "accountDomain",
      u."role",
      u."platform_role"::text AS "platformRole",
      u."token_version" AS "tokenVersion",
      u."must_change_password" AS "mustChangePassword",
      u."is_active" AS "isActive",
      u."is_frozen" AS "isFrozen",
      u."expires_at" AS "expiresAt",
      u."teacher_approved" AS "teacherApproved",
      CASE WHEN u."account_domain" IN ('LEGACY','TRAINING') THEN COALESCE((SELECT json_agg(json_build_object('entry', g."entry", 'version', g."version") ORDER BY g."entry")
        FROM "admin_entry_grants" g WHERE g."user_id"=u."id" AND g."revoked_at" IS NULL), '[]'::json) ELSE '[]'::json END AS "entryGrants",
      CASE WHEN u."account_domain"='SCHOOL' THEN (
        u."role"::text='ADMIN' OR u."platform_role"::text='SYSTEM_ADMIN'
        OR EXISTS (
          SELECT 1 FROM active_memberships m
          WHERE m."org_role"='ORG_ADMIN'
        )
        OR EXISTS (
          SELECT 1 FROM active_memberships m
          JOIN "education_product_role_grants" r
            ON r."membership_id"=m."id" AND r."organization_id"=m."organization_id"
            AND r."role"='PRODUCT_ADMIN' AND r."revoked_at" IS NULL
          JOIN "education_product_entitlements" entitlement
            ON entitlement."organization_id"=m."organization_id"
            AND entitlement."product"=r."product" AND entitlement."status"='ACTIVE'
        )
        OR EXISTS (
          SELECT 1 FROM active_memberships m
          JOIN "organization_capability_grants" c
            ON c."membership_id"=m."id" AND c."revoked_at" IS NULL
            AND c."capability" IN ('PSYCHOLOGY_STAFF','PARENT_REPORT_DISCLOSURE','REPORT_MEMBER_EXPORT','REPORT_EXPORT')
        )
      ) ELSE false END AS "needsMfa"
    FROM target_user u
  `

  const row = rows[0]
  if (!row) return null
  const resolvedUserId = row.userId ?? row.id
  if (!resolvedUserId) return null
  // Legacy ADMIN is only a historical business label. Project the compatibility
  // ADMIN role exclusively inside Training, from a current explicit grant.
  const training = ['LEGACY','TRAINING'].includes(row.accountDomain)
  const role = training ? row.platformRole==='STANDARD'&&row.entryGrants?.some(g => g.entry === 'TRAINING') ? UserRole.ADMIN
    : row.role === UserRole.ADMIN ? UserRole.STUDENT : row.role : row.role
  return { ...row, userId: resolvedUserId, businessRole: row.role, role }
}

export function toRequestPrincipal(principal: CurrentPrincipal) {
  return {
    userId: principal.userId,
    username: principal.username,
    accountDomain: principal.accountDomain,
    role: principal.role,
    platformRole: principal.platformRole,
    tokenVersion: principal.tokenVersion,
    mustChangePassword: principal.mustChangePassword,
    entryGrants: principal.entryGrants ?? [],
    businessRole: principal.businessRole ?? principal.role,
    teacherApproved: principal.teacherApproved,
  }
}
