import { prisma } from '../config/database'

/** Current content references, once per assignment/checkin, excluding library ownership. */
export async function documentUsageCounts(assetIds: Array<string | null>): Promise<Map<string, number>> {
  const ids = [...new Set(assetIds.filter((id): id is string => Boolean(id)))]
  const counts = new Map<string, number>()
  if (!ids.length) return counts
  const references = await prisma.assetReference.groupBy({
    by: ['assetId', 'entityType', 'entityId'],
    where: { assetId: { in: ids }, entityType: { in: ['Assignment', 'Checkin'] }, field: { startsWith: 'documents.' } },
  })
  for (const reference of references) counts.set(reference.assetId, (counts.get(reference.assetId) ?? 0) + 1)
  return counts
}
