import { prisma } from '../config/database'
import {
  assertAlternativeUsableOrgAdmin,
  lockOrganizationsForCurrentOrgAdmin,
} from '../modules/organization/adminInvariant'

export class UserLifecycleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'UserLifecycleError'
  }
}

type PlatformRoleRow = { platformRole: 'SYSTEM_ADMIN' | 'STANDARD' }
type UserStateRow = { id: string; isActive: boolean }

/**
 * Platform account activation/deactivation authority.
 *
 * This service is the only production write path for users.is_active. It uses
 * current DB platform_role rather than legacy User.role, and deactivation is
 * serialized against Organization governance so the last usable ORG_ADMIN
 * cannot be removed through an account-status change.
 */
export async function setUserActiveState(input: {
  actorUserId: string
  targetUserId: string
  isActive: boolean
}): Promise<{ id: string; isActive: boolean }> {
  return prisma.$transaction(async (tx) => {
    const actors = await tx.$queryRaw<PlatformRoleRow[]>`
      SELECT "platform_role"::text AS "platformRole"
      FROM "users"
      WHERE "id" = ${input.actorUserId}
      LIMIT 1
    `
    if (actors[0]?.platformRole !== 'SYSTEM_ADMIN') {
      throw new UserLifecycleError(
        'SYSTEM_ADMIN_REQUIRED',
        '只有系统管理员可以修改账号启停状态',
        403,
      )
    }

    const targets = await tx.$queryRaw<UserStateRow[]>`
      SELECT "id", "is_active" AS "isActive"
      FROM "users"
      WHERE "id" = ${input.targetUserId}
      FOR UPDATE
    `
    const target = targets[0]
    if (!target) {
      throw new UserLifecycleError('USER_NOT_FOUND', '用户不存在', 404)
    }

    if (target.isActive === input.isActive) {
      return { id: target.id, isActive: target.isActive }
    }

    if (!input.isActive) {
      const organizationIds = await lockOrganizationsForCurrentOrgAdmin(tx, input.targetUserId)
      for (const organizationId of organizationIds) {
        await assertAlternativeUsableOrgAdmin(tx, organizationId, input.targetUserId)
      }
    }

    const rows = await tx.$queryRaw<UserStateRow[]>`
      UPDATE "users"
      SET "is_active" = ${input.isActive},
          "token_version" = "token_version" + 1,
          "updated_at" = transaction_timestamp()
      WHERE "id" = ${input.targetUserId}
      RETURNING "id", "is_active" AS "isActive"
    `
    return rows[0]
  })
}
