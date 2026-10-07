import { prisma } from '../../config/database'
import { requireIsolatedReleaseDatabase } from './integration-env'

/** Production governance fixtures use an actual second administrator, rather
 * than relabelling the creator as an independent reviewer. */
export async function independentReviewer(actor: { userId: string; platformRole: string }) {
  requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
  const username = 'independent-review-' + actor.userId
  const reviewer = await prisma.user.upsert({ where: { username }, update: {}, create: {
    username, passwordHash: 'synthetic-review-fixture-only', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN',
  } })
  return { userId: reviewer.id, platformRole: 'SYSTEM_ADMIN' }
}
