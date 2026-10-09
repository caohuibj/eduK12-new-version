import { prisma } from '../config/database'
import {
  AccountAuthorityError,
  assertAccountUsabilityMutationSafe,
  assertCurrentSystemAdmin,
} from './accountAuthorityService'

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
  try {
    return await prisma.$transaction(async (tx) => {
      await assertCurrentSystemAdmin(tx, input.actorUserId)

      const targets = await tx.$queryRaw<UserStateRow[]>`
        SELECT "id", "is_active" AS "isActive"
        FROM "users"
        WHERE "id" = ${input.targetUserId} AND "account_domain" <> 'SCHOOL'
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
        await assertAccountUsabilityMutationSafe(tx, input.targetUserId)
      }

      const rows = await tx.$queryRaw<UserStateRow[]>`
        UPDATE "users"
        SET "is_active" = ${input.isActive},
            "token_version" = "token_version" + 1,
            "updated_at" = transaction_timestamp()
        WHERE "id" = ${input.targetUserId} AND "account_domain" <> 'SCHOOL'
        RETURNING "id", "is_active" AS "isActive"
      `
      return rows[0]
    })
  } catch (err) {
    if (err instanceof AccountAuthorityError) {
      throw new UserLifecycleError(err.code, err.message, err.statusCode)
    }
    throw err
  }
}
