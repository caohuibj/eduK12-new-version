import type { Prisma, PrismaClient } from '@prisma/client'
import { GIT_RELEASE_ACTOR_ID, GIT_RELEASE_USERNAME } from '../../../utils/gitReleaseIdentity'

// Deliberately outside all supported password hash formats. There is no password to hand off.
const NO_PASSWORD = '!noninteractive:git-scale-release:v1'

export async function isProvisionedGitScalePublisher(db: Pick<Prisma.TransactionClient, '$queryRaw'>, actor: string) {
  if (actor !== GIT_RELEASE_ACTOR_ID) return false
  const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM users
    WHERE id=${actor} AND username=${GIT_RELEASE_USERNAME} AND password_hash=${NO_PASSWORD}
      AND account_domain='TRAINING' AND platform_role='STANDARD' AND role='STUDENT'
      AND NOT is_active AND NOT is_frozen AND NOT must_change_password AND expires_at IS NULL
    FOR SHARE`
  return rows.length === 1
}

export function ensureGitScalePublisher(db: Pick<PrismaClient, '$transaction'>): Promise<string> {
  return db.$transaction(async tx => {
    // Both the reserved username and ID must be free, or already identify this exact actor.
    // ON CONFLICT DO NOTHING never rewrites a same-named account, even on a concurrent retry.
    await tx.user.createMany({ skipDuplicates: true, data: [{
      id: GIT_RELEASE_ACTOR_ID, username: GIT_RELEASE_USERNAME, passwordHash: NO_PASSWORD,
      role: 'STUDENT', platformRole: 'STANDARD', accountDomain: 'TRAINING', isActive: false,
    }] })
    if (!await isProvisionedGitScalePublisher(tx, GIT_RELEASE_ACTOR_ID)) {
      throw new Error('Git release identity conflicts with an existing or disabled account. No account was changed.')
    }
    return GIT_RELEASE_ACTOR_ID
  })
}
