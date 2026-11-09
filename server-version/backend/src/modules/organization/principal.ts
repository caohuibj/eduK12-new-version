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
   * REPORT_EXPORT). */
  needsMfa?: boolean
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
    SELECT
      "id" AS "userId",
      "username",
      "account_domain" AS "accountDomain",
      "role",
      "platform_role"::text AS "platformRole",
      "token_version" AS "tokenVersion",
      "must_change_password" AS "mustChangePassword",
      "is_active" AS "isActive",
      "is_frozen" AS "isFrozen",
      "expires_at" AS "expiresAt",
      "teacher_approved" AS "teacherApproved",
      COALESCE((SELECT json_agg(json_build_object('entry', g."entry", 'version', g."version") ORDER BY g."entry")
        FROM "admin_entry_grants" g WHERE g."user_id"="users"."id" AND g."revoked_at" IS NULL), '[]'::json) AS "entryGrants",
      CASE WHEN "users"."account_domain"='SCHOOL' THEN (
        "users"."role"::text='ADMIN' OR "users"."platform_role"::text='SYSTEM_ADMIN'
        OR EXISTS (
          SELECT 1 FROM "organization_memberships" m JOIN "organizations" o
            ON o."id"=m."organization_id" AND o."status"='ACTIVE'
          WHERE m."user_id"="users"."id" AND m."valid_from"<=statement_timestamp()
            AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
            AND m."org_role"='ORG_ADMIN'
        )
        OR EXISTS (
          SELECT 1 FROM "education_product_role_grants" r
          JOIN "organization_memberships" member ON member."id"=r."membership_id"
            AND member."organization_id"=r."organization_id"
            AND member."valid_from"<=statement_timestamp()
            AND (member."valid_until" IS NULL OR member."valid_until">statement_timestamp())
          JOIN "education_product_entitlements" entitlement
            ON entitlement."organization_id"=r."organization_id"
            AND entitlement."product"=r."product" AND entitlement."status"='ACTIVE'
          JOIN "organizations" organization ON organization."id"=r."organization_id"
            AND organization."status"='ACTIVE'
          WHERE member."user_id"="users"."id"
            AND r."role"='PRODUCT_ADMIN' AND r."revoked_at" IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM "organization_capability_grants" c
          JOIN "organization_memberships" m ON m."id"=c."membership_id"
            AND m."valid_from"<=statement_timestamp()
            AND (m."valid_until" IS NULL OR m."valid_until">statement_timestamp())
          JOIN "organizations" o ON o."id"=m."organization_id" AND o."status"='ACTIVE'
          WHERE m."user_id"="users"."id" AND c."revoked_at" IS NULL
            AND c."capability" IN ('PSYCHOLOGY_STAFF','PARENT_REPORT_DISCLOSURE','REPORT_MEMBER_EXPORT','REPORT_EXPORT')
        )
      ) ELSE false END AS "needsMfa"
    FROM "users"
    WHERE "id" = ${userId}
    LIMIT 1
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
