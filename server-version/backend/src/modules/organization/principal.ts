import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'

export type PlatformRole = 'SYSTEM_ADMIN' | 'STANDARD'

export interface CurrentPrincipal {
  userId: string
  username: string
  role: UserRole
  platformRole: PlatformRole
  tokenVersion: number
  mustChangePassword: boolean
  isActive: boolean
  isFrozen: boolean
  expiresAt: Date | null
  teacherApproved: boolean
}

type PrincipalRow = CurrentPrincipal

export async function loadCurrentPrincipal(userId: string): Promise<CurrentPrincipal | null> {
  const rows = await prisma.$queryRaw<PrincipalRow[]>`
    SELECT
      "id" AS "userId",
      "username",
      "role",
      "platform_role"::text AS "platformRole",
      "token_version" AS "tokenVersion",
      "must_change_password" AS "mustChangePassword",
      "is_active" AS "isActive",
      "is_frozen" AS "isFrozen",
      "expires_at" AS "expiresAt",
      "teacher_approved" AS "teacherApproved"
    FROM "users"
    WHERE "id" = ${userId}
    LIMIT 1
  `

  return rows[0] ?? null
}

export function toRequestPrincipal(principal: CurrentPrincipal) {
  return {
    userId: principal.userId,
    username: principal.username,
    role: principal.role,
    platformRole: principal.platformRole,
    tokenVersion: principal.tokenVersion,
    mustChangePassword: principal.mustChangePassword,
  }
}
