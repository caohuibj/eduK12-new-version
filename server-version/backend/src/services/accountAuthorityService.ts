import { PlatformRole, Prisma } from '@prisma/client'
import { prisma } from '../config/database'
import {
  assertAlternativeUsableOrgAdmin,
  lockOrganizationsForCurrentOrgAdmin,
} from '../modules/organization/adminInvariant'
import { OrganizationDomainError } from '../modules/organization/types'

type Tx = Prisma.TransactionClient

type ResetTargetRow = {
  id: string
  username: string
}

export class AccountAuthorityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'AccountAuthorityError'
  }
}

/** Current database PlatformRole is the only authority for platform lifecycle commands. */
export async function assertCurrentSystemAdmin(tx: Tx, actorUserId: string): Promise<void> {
  const actors = await tx.$queryRaw<Array<{ platformRole: PlatformRole }>>`
    SELECT "platform_role"::text AS "platformRole"
    FROM "users"
    WHERE "id" = ${actorUserId}
      AND "is_active" = true AND "is_frozen" = false
      AND ("expires_at" IS NULL OR "expires_at" > statement_timestamp())
    LIMIT 1
  `
  if (actors[0]?.platformRole !== PlatformRole.SYSTEM_ADMIN) {
    throw new AccountAuthorityError(
      'SYSTEM_ADMIN_REQUIRED',
      '只有系统管理员可以执行平台账号权限变更',
      403,
    )
  }
}

/**
 * Legacy Course / product / tenant authority must never make a SYSTEM_ADMIN
 * account unusable. Such mutations belong to an explicit platform lifecycle
 * surface instead.
 */
export function assertNonPlatformAuthorityTargetCanBecomeUnusable(platformRole: PlatformRole): void {
  if (platformRole === PlatformRole.SYSTEM_ADMIN) {
    throw new AccountAuthorityError(
      'SYSTEM_ADMIN_ACCOUNT_PROTECTED',
      '系统管理员账号只能通过平台账号生命周期接口变更可用状态',
      403,
    )
  }
}

/**
 * Any mutation that changes an account from normally usable to unusable must
 * preserve at least one alternative usable ORG_ADMIN in every affected tenant.
 */
export async function assertAccountUsabilityMutationSafe(tx: Tx, targetUserId: string): Promise<void> {
  try {
    const organizationIds = await lockOrganizationsForCurrentOrgAdmin(tx, targetUserId)
    for (const organizationId of organizationIds) {
      await assertAlternativeUsableOrgAdmin(tx, organizationId, targetUserId)
    }
  } catch (err) {
    if (err instanceof OrganizationDomainError) {
      throw new AccountAuthorityError(err.code, err.message, err.statusCode)
    }
    throw err
  }
}

/**
 * Platform-authoritative forced password reset persistence. The caller owns
 * temporary-password generation and protected credential handoff; this service
 * owns current PlatformRole authorization, locking, tenant survivability, and
 * the credential mutation itself.
 */
export async function forceResetPasswordBySystemAdmin(input: {
  actorUserId: string
  targetUserId: string
  passwordHash: string
}): Promise<ResetTargetRow> {
  return prisma.$transaction(async (tx) => {
    await assertCurrentSystemAdmin(tx, input.actorUserId)

    const targets = await tx.$queryRaw<ResetTargetRow[]>`
      SELECT "id", "username"
      FROM "users"
      WHERE "id" = ${input.targetUserId}
      FOR UPDATE
    `
    const target = targets[0]
    if (!target) {
      throw new AccountAuthorityError('USER_NOT_FOUND', '用户不存在', 404)
    }

    await assertAccountUsabilityMutationSafe(tx, target.id)

    await tx.user.update({
      where: { id: target.id },
      data: {
        passwordHash: input.passwordHash,
        tokenVersion: { increment: 1 },
        mustChangePassword: true,
      },
    })

    return target
  })
}
