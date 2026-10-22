/** Unified directory only. Mutation and execution stay with the source-owned
 * STANDARD authorization/runtime and approved authored exact-release services. */
import { prisma } from '../../config/database'
import { UserRole } from '../../types'
import { readStandardScaleLibraryForActor } from '../scale/library/standard-catalog-reader'
import { libraryActor } from './authority'
import { fail, type LegacyLibraryProduct } from './contracts'
import { listEntries } from './service'
import { authoredCatalogRecord, combinePlatformCatalog, platformCatalogPagePlan, standardCatalogRecord } from './unified-catalog-model'

async function readStandard(actorId: string) {
  const actor = await prisma.$transaction(tx => libraryActor(tx, actorId))
  const role = actor.systemAdmin ? UserRole.ADMIN : actor.role === 'TEACHER' ? UserRole.TEACHER : UserRole.STUDENT
  return readStandardScaleLibraryForActor({ userId: actorId, role })
}

export async function readUnifiedCatalog(actorId: string, product: LegacyLibraryProduct, pagination = { page: 1, pageSize: 25 }) {
  if (!Number.isSafeInteger(pagination.page) || pagination.page < 1 || pagination.page > Math.floor(Number.MAX_SAFE_INTEGER / 100)
    || !Number.isInteger(pagination.pageSize) || pagination.pageSize < 1 || pagination.pageSize > 100) {
    return fail('量表库分页参数不合法', 400)
  }
  const standard = await readStandard(actorId)
  const plan = platformCatalogPagePlan(standard.entries, pagination.page, pagination.pageSize)
  const authored = await listEntries(actorId, undefined, { offset: plan.authoredOffset, limit: plan.authoredLimit })
  return {
    ...combinePlatformCatalog(plan.standardPage, authored.list, product),
    generatedAt: standard.generatedAt, page: pagination.page, pageSize: pagination.pageSize,
    hasMore: plan.standardHasMore || authored.hasMore,
  }
}

export async function readUnifiedStandardCatalogEntry(actorId: string, product: LegacyLibraryProduct, instrumentKey: string, instrumentVersion: string) {
  const catalog = await readStandard(actorId)
  const entry = catalog.entries.find(row => row.identity.instrumentKey === instrumentKey && row.identity.instrumentVersion === instrumentVersion)
  if (!entry) return fail('量表库精确版本不存在', 404)
  return { entry: standardCatalogRecord(entry, product) }
}

export async function readUnifiedAuthoredCatalogEntry(actorId: string, product: LegacyLibraryProduct, entryId: string) {
  // Same visibility predicate as the directory, filtered before its list limit.
  const catalog = await listEntries(actorId, entryId)
  const entry = catalog.list.find(row => row.id === entryId)
  if (!entry) return fail('量表库精确版本不存在或无权访问', 404)
  return { entry: authoredCatalogRecord(entry, product) }
}
