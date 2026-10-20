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
        FROM "admin_entry_grants" g WHERE g."user_id"="users"."id" AND g."revoked_at" IS NULL), '[]'::json) AS "entryGrants"
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
  const role = training ? row.entryGrants?.some(g => g.entry === 'TRAINING') ? UserRole.ADMIN
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
  }
}
