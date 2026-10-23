import { prisma } from '../../config/database'
import { canUseScale } from '../../services/materialGrant'
import type { UserRole } from '@prisma/client'

/** Selector metadata only. This does not authorize adding or publishing a scale;
 * those operations retain their current, transaction-scoped grant checks. */
export async function listQuestionnaireScaleResources(actor: { userId: string; role: UserRole }) {
  const scales = await prisma.scale.findMany({
    where: { status: 'PUBLISHED' }, orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, instrumentVersion: true,
      creatorId: true, status: true, libraryEntryId: true },
  })
  const usable = []
  for (const row of scales) {
    // The same fresh row already proves this first canUseScale branch. Governed
    // entries (including one's own) and other owners still use its full checks.
    const ownedPrivate = row.creatorId === actor.userId && row.libraryEntryId === null
    if (ownedPrivate || await canUseScale(actor.userId, actor.role, row)) {
      usable.push({ id: row.id, name: row.name, code: row.code, version: row.instrumentVersion })
    }
  }
  return usable
}
