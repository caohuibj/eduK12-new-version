/** Unified directory only. Mutation and execution stay with the source-owned
 * STANDARD authorization/runtime and approved authored exact-release services. */
import { matchesScaleLibraryClassification, scaleLibraryClassificationFilterSchema, type ScaleLibraryClassificationFilters } from '../scale/library/scale-library-read-model'
import { prisma } from '../../config/database'
import { UserRole } from '../../types'
import { readStandardScaleLibraryForActor } from '../scale/library/standard-catalog-reader'
import { libraryActor } from './authority'
import { fail, type LibraryProduct } from './contracts'
import { listEntries } from './service'
import { authoredCatalogRecord, combinePlatformCatalog, platformCatalogPagePlan, standardCatalogRecord } from './unified-catalog-model'

async function readStandard(actorId: string) {
  const actor = await prisma.$transaction(tx => libraryActor(tx, actorId))
  const role = actor.systemAdmin ? UserRole.ADMIN : actor.role === 'TEACHER' ? UserRole.TEACHER : UserRole.STUDENT
  return readStandardScaleLibraryForActor({ userId: actorId, role })
}

export async function readUnifiedCatalog(actorId: string, product: LibraryProduct, pagination: { page: number; pageSize: number } & ScaleLibraryClassificationFilters = { page: 1, pageSize: 25 }) {
  if (!Number.isSafeInteger(pagination.page) || pagination.page < 1 || pagination.page > Math.floor(Number.MAX_SAFE_INTEGER / 100)
    || !Number.isInteger(pagination.pageSize) || pagination.pageSize < 1 || pagination.pageSize > 100) {
    return fail('量表库分页参数不合法', 400)
  }
  const parsed = scaleLibraryClassificationFilterSchema.safeParse(pagination)
  if (!parsed.success) return fail('量表库分类筛选参数不合法', 400)
  const filters = parsed.data
  const classificationActive = filters.constructDomain !== undefined || filters.overlapTag !== undefined
  const standard = await readStandard(actorId)
  // Filter the complete actor-visible STANDARD projection, never a page or a runtime definition.
  const visibleStandard = classificationActive
    ? standard.entries.filter(entry => matchesScaleLibraryClassification(entry.construct, filters))
    : standard.entries
  const plan = platformCatalogPagePlan(visibleStandard, pagination.page, pagination.pageSize)
  // AUTHORED has no declared construct classification. Do not infer it or fetch it when filtering.
  const authored = classificationActive
    ? { list: [], hasMore: false }
    : await listEntries(actorId, undefined, { offset: plan.authoredOffset, limit: plan.authoredLimit })
  return {
    ...combinePlatformCatalog(plan.standardPage, authored.list, product),
    generatedAt: standard.generatedAt, page: pagination.page, pageSize: pagination.pageSize,
    hasMore: plan.standardHasMore || authored.hasMore,
  }
}

export async function readUnifiedStandardCatalogEntry(actorId: string, product: LibraryProduct, instrumentKey: string, instrumentVersion: string) {
  const catalog = await readStandard(actorId)
  const entry = catalog.entries.find(row => row.identity.instrumentKey === instrumentKey && row.identity.instrumentVersion === instrumentVersion)
  if (!entry) return fail('量表库精确版本不存在', 404)
  return { entry: standardCatalogRecord(entry, product) }
}

export async function readUnifiedAuthoredCatalogEntry(actorId: string, product: LibraryProduct, entryId: string) {
  // Same visibility predicate as the directory, filtered before its list limit.
  const catalog = await listEntries(actorId, entryId)
  const entry = catalog.list.find(row => row.id === entryId)
  if (!entry) return fail('量表库精确版本不存在或无权访问', 404)
  return { entry: authoredCatalogRecord(entry, product) }
}
