import {catalogTagFacets,matchesCatalogDiscovery,scaleEntryClassificationTags,type CatalogDiscoveryFilters} from '../scale/library/catalog-discovery'
import {standardPolicyIdentity} from '../survey/tool-policy'
/** Unified directory only. Mutation and execution stay with the source-owned
 * STANDARD authorization/runtime and approved authored exact-release services. */
import { prisma } from '../../config/database'
import { UserRole } from '../../types'
import { readStandardScaleLibraryForActor } from '../scale/library/standard-catalog-reader'
import { libraryActor,libraryCapabilities } from './authority'
import { fail, type LegacyLibraryProduct } from './contracts'
import { listEntries } from './service'
import { authoredCatalogRecord, combinePlatformCatalog, platformCatalogPagePlan, standardCatalogRecord } from './unified-catalog-model'

async function readStandard(actorId: string,product:LegacyLibraryProduct) {
  const actor = await prisma.$transaction(tx => libraryActor(tx, actorId))
  const role = actor.systemAdmin ? UserRole.ADMIN : actor.role === 'TEACHER' ? UserRole.TEACHER : UserRole.STUDENT
  const catalog=await readStandardScaleLibraryForActor({ userId: actorId, role })
  if(actor.systemAdmin)return catalog
  // The global registry remains available to system intake. Other users see
  // only exact usable versions or the admitted scope they can administer.
  const visible=await prisma.$transaction(async tx=>{
    const caps=await libraryCapabilities(tx,actorId)
    const rows=await tx.$queryRaw<Array<{code:string;instrument_version:string}>>`SELECT s.code,s.instrument_version FROM scales s
      WHERE s.instrument_class='STANDARD' AND s.status='PUBLISHED' AND
        (s.creator_id=${actorId} OR EXISTS(SELECT 1 FROM material_grants m WHERE m.teacher_id=${actorId} AND m.resource_type='SCALE' AND m.resource_id=s.id))`
    const admitted=caps.entryAdminProducts.includes(product)?await tx.$queryRaw<Array<{resource_key:string;fingerprint:string}>>`SELECT resource_key,fingerprint FROM survey_tool_policies
      WHERE product=${product} AND decision='APPROVED' AND resource_key LIKE 'standard:%'`:[]
    return {pairs:new Set(rows.map(r=>r.code+':'+r.instrument_version)),keys:new Set(admitted.map(r=>r.resource_key+':'+r.fingerprint))}
  })
  return {...catalog,entries:catalog.entries.filter(row=>visible.pairs.has(row.identity.instrumentKey+':'+row.identity.instrumentVersion)
    ||visible.keys.has('standard:'+row.identity.instrumentKey+':'+row.identity.instrumentVersion+':'+standardPolicyIdentity(row.identity.instrumentKey,row.identity.instrumentVersion).fingerprint))}
}

export async function readUnifiedCatalog(actorId: string, product: LegacyLibraryProduct, pagination: {page:number;pageSize:number;origin?:'ALL'|'STANDARD_REGISTRY'|'AUTHORED'} & CatalogDiscoveryFilters = { page: 1, pageSize: 25 }) {
  if (!Number.isSafeInteger(pagination.page) || pagination.page < 1 || pagination.page > Math.floor(Number.MAX_SAFE_INTEGER / 100)
    || !Number.isInteger(pagination.pageSize) || pagination.pageSize < 1 || pagination.pageSize > 100) {
    return fail('量表库分页参数不合法', 400)
  }
  const standard = await readStandard(actorId,product)
  const filtered=(pagination.origin==='AUTHORED'?[]:standard.entries).filter(row=>matchesCatalogDiscovery([row.identity.canonicalName,row.identity.instrumentKey,row.identity.instrumentVersion,row.construct.constructDefinition],scaleEntryClassificationTags(row),pagination))
  const plan = platformCatalogPagePlan(filtered, pagination.page, pagination.pageSize)
  const authored = pagination.origin==='STANDARD_REGISTRY'?{list:[],hasMore:false,tagFacets:catalogTagFacets([])}:await listEntries(actorId, undefined, { offset: plan.authoredOffset, limit: plan.authoredLimit, ...(pagination.keyword?{keyword:pagination.keyword}:{}),...(pagination.tags?.length?{tags:pagination.tags}:{}) },product)
  const tagFacets=catalogTagFacets(standard.entries.map(scaleEntryClassificationTags))
  for(const facet of Object.keys(tagFacets) as Array<keyof typeof tagFacets>)
    tagFacets[facet]=[...new Map([...tagFacets[facet],...(authored.tagFacets?.[facet]??[])].map(tag=>[tag.id,tag])).values()].sort((a,b)=>a.label.localeCompare(b.label,'zh-CN')||a.id.localeCompare(b.id))
  return {
    ...combinePlatformCatalog(plan.standardPage, authored.list, product),
    generatedAt: standard.generatedAt, page: pagination.page, pageSize: pagination.pageSize,
    hasMore: plan.standardHasMore || authored.hasMore, tagFacets,
  }
}

export async function readUnifiedStandardCatalogEntry(actorId: string, product: LegacyLibraryProduct, instrumentKey: string, instrumentVersion: string) {
  const catalog = await readStandard(actorId,product)
  const entry = catalog.entries.find(row => row.identity.instrumentKey === instrumentKey && row.identity.instrumentVersion === instrumentVersion)
  if (!entry) return fail('量表库精确版本不存在', 404)
  return { entry: standardCatalogRecord(entry, product) }
}

export async function readUnifiedAuthoredCatalogEntry(actorId: string, product: LegacyLibraryProduct, entryId: string) {
  // Same visibility predicate as the directory, filtered before its list limit.
  const catalog = await listEntries(actorId, entryId,undefined,product)
  const entry = catalog.list.find(row => row.id === entryId)
  if (!entry) return fail('量表库精确版本不存在或无权访问', 404)
  return { entry: authoredCatalogRecord(entry, product) }
}
