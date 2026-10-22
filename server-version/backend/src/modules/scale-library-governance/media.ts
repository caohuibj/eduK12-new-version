import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { assessmentAssetIdentitySchema } from '../assessment-media/assessment-asset-identity'
import { retainAssessmentAssetReferences } from '../assessment-media/assessment-asset'
import { lockStoredAssetRows } from '../../services/assetStorage'
import type { StoredRelease } from '../measurement-content/repository'
import type { LibrarySnapshot } from './source'
import { fail } from './contracts'

type Tx = Prisma.TransactionClient
const supported = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/ogg', 'text/vtt']
export const libraryMediaItemSchema = assessmentAssetIdentitySchema.extend({
  sizeBytes: z.number().int().positive(), assetVersion: z.string().datetime(),
  usages: z.array(z.string().min(1)).min(1).max(2000),
  rights: z.literal('AUTHOR_SHARED_FOR_BOUND_SCALE'),
  dependencyReleaseIds: z.array(z.string()).max(21),
}).strict()
export const libraryMediaManifestSchema = z.object({
  schemaVersion: z.literal(1), releaseIds: z.array(z.string()).max(21),
  items: z.array(libraryMediaItemSchema).max(300), manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type LibraryMediaManifest = z.infer<typeof libraryMediaManifestSchema>
export type LibraryMediaItem = LibraryMediaManifest['items'][number]
export const libraryMediaConsentSchema = z.object({manifestHash:z.string().regex(/^[a-f0-9]{64}$/),shareWithAuthorizedUsers:z.literal(true)}).strict()

/** Traverse only exact authored/release content, never provenance, answers, or arbitrary linked records.
 * All supported video dependencies (poster and caption) are embedded identity objects.
 * Unknown managed references fail closed rather than disappearing from the manifest. */
export function collectLibraryMediaIdentities(roots: Array<{value:unknown;path:string;releaseId:string}>, declared: Array<{releaseId:string;assetId:string;contentHash:string;mimeType:string}>=[]) {
  const refs = new Map<string, {assetId:string;contentHash:string;mimeType:string;usages:Set<string>;releaseIds:Set<string>}>()
  let nodes = 0
  const visit = (value:unknown,path:string,releaseId:string,depth:number):void => {
    if (++nodes > 50000 || depth > 40) fail('SCALE_LIBRARY_MEDIA_GRAPH_LIMIT',400)
    if (typeof value === 'string') {
      if ((/^(?:https?:|data:|blob:|asset:)/i.test(value) && /(?:image|video|poster|caption|media|\.src$)/i.test(path)) || /<(?:img|video|source)\b|!\[[^\]]*\]\(/i.test(value))
        fail('SCALE_LIBRARY_EXTERNAL_MEDIA_NOT_SUPPORTED',400)
      return
    }
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach((v,i)=>visit(v,`${path}.${i}`,releaseId,depth+1)); return }
    const obj=value as Record<string,unknown>
    if ('assetId' in obj) {
      // Declarative REPORT ASSET blocks carry only an ID; resolve them only
      // against that exact release's frozen assetRefs, never the live user's library.
      const indirect=obj.type==='ASSET'&&obj.contentHash===undefined&&obj.sha256===undefined&&obj.mimeType===undefined&&obj.mediaType===undefined
        ?declared.find(a=>a.releaseId===releaseId&&a.assetId===obj.assetId):undefined
      const parsed=assessmentAssetIdentitySchema.safeParse({assetId:obj.assetId,contentHash:obj.contentHash??obj.sha256??indirect?.contentHash,mimeType:obj.mimeType??obj.mediaType??indirect?.mimeType})
      if (!parsed.success || !supported.includes(parsed.data.mimeType)) fail('SCALE_LIBRARY_MEDIA_IDENTITY_OR_TYPE_NOT_SUPPORTED',400)
      const ref=parsed.data, prior=refs.get(ref.assetId)
      if (prior && (prior.contentHash!==ref.contentHash||prior.mimeType!==ref.mimeType)) fail('SCALE_LIBRARY_MEDIA_IDENTITY_CONFLICT')
      const entry=prior??{...ref,usages:new Set<string>(),releaseIds:new Set<string>()}
      entry.usages.add(path); entry.releaseIds.add(releaseId); refs.set(ref.assetId,entry)
      if (refs.size > 300 || entry.usages.size > 2000) fail('SCALE_LIBRARY_MEDIA_GRAPH_LIMIT',400)
    }
    for (const [key,v] of Object.entries(obj)) {
      if (/^(?:imageId|videoId|attachmentId)$/i.test(key) && v) fail('SCALE_LIBRARY_INDIRECT_MEDIA_NOT_SUPPORTED',400)
      visit(v,`${path}.${key}`,releaseId,depth+1)
    }
  }
  roots.forEach(root=>visit(root.value,root.path,root.releaseId,0))
  return [...refs.values()].sort((a,b)=>a.assetId.localeCompare(b.assetId))
}
export function assertLibraryMediaManifest(raw:unknown):LibraryMediaManifest {
  const manifest=libraryMediaManifestSchema.parse(raw)
  const {manifestHash,...body}=manifest
  if (canonicalHash(body)!==manifestHash || new Set(manifest.items.map(i=>i.assetId)).size!==manifest.items.length)
    fail('SCALE_LIBRARY_MEDIA_MANIFEST_MISMATCH')
  return manifest
}
export async function buildLibraryMediaManifest(tx:Tx,actorId:string,snapshot:LibrarySnapshot,release:StoredRelease,dependencies:StoredRelease[]=[]):Promise<LibraryMediaManifest> {
  if (dependencies.length>20) fail('SCALE_LIBRARY_MEDIA_GRAPH_LIMIT',400)
  const releases=[release,...dependencies]
  const refs=collectLibraryMediaIdentities([
    {value:snapshot.definition,path:'definition',releaseId:release.releaseId},
    {value:snapshot.compiledDefinition,path:'compiledDefinition',releaseId:release.releaseId},
    ...releases.flatMap(r=>[{value:r.content,path:`release.${r.releaseId}.content`,releaseId:r.releaseId},
      {value:r.assetRefs,path:`release.${r.releaseId}.assets`,releaseId:r.releaseId}]),
  ],releases.flatMap(r=>r.assetRefs.map(a=>({releaseId:r.releaseId,assetId:a.assetId,contentHash:a.sha256,mimeType:a.mediaType}))))
  await lockStoredAssetRows(tx,refs.map(r=>r.assetId))
  const assets=refs.length?await tx.storedAsset.findMany({where:{id:{in:refs.map(r=>r.assetId)}}}):[]
  const byId=new Map(assets.map(a=>[a.id,a]))
  const items:LibraryMediaItem[]=refs.map(ref=>{
    const asset=byId.get(ref.assetId)
    // Ownership is necessary but author consent (checked by submit) is also mandatory.
    // PUBLIC/COURSE/participant attachments and third-party assets cannot be laundered here.
    if (!asset||asset.deletedAt||asset.ownerId!==actorId||asset.accessScope!=='PRIVATE') fail('SCALE_LIBRARY_MEDIA_AUTHOR_RIGHTS_REQUIRED',403)
    if (asset.sha256!==ref.contentHash||asset.mimeType!==ref.mimeType||asset.sizeBytes<=0||!asset.objectKey||!['cos','local'].includes(asset.provider))
      fail('SCALE_LIBRARY_MEDIA_IDENTITY_MISMATCH')
    return {assetId:ref.assetId,contentHash:ref.contentHash,mimeType:ref.mimeType,sizeBytes:asset.sizeBytes,
      assetVersion:asset.createdAt.toISOString(),usages:[...ref.usages].sort(),rights:'AUTHOR_SHARED_FOR_BOUND_SCALE',dependencyReleaseIds:[...ref.releaseIds].sort()}
  })
  const body={schemaVersion:1 as const,releaseIds:[...new Set(releases.map(r=>r.releaseId))].sort(),items}
  return {...body,manifestHash:canonicalHash(body)}
}
export function assertLibraryMediaConsent(manifest:LibraryMediaManifest,consent:unknown) {
  if (!manifest.items.length && consent===undefined) return
  const parsed=libraryMediaConsentSchema.safeParse(consent)
  if (!parsed.success||parsed.data.manifestHash!==manifest.manifestHash) fail('SCALE_LIBRARY_MEDIA_EXPLICIT_CONSENT_REQUIRED',400)
}
export async function retainLibrarySubmissionMedia(tx:Tx,submissionId:string,raw:LibraryMediaManifest) {
  const manifest=assertLibraryMediaManifest(raw)
  await retainAssessmentAssetReferences({owner:{entityType:'ScaleLibrarySubmission',entityId:submissionId,field:'media'},references:manifest.items,db:tx})
}
export async function approveLibraryMedia(tx:Tx,entryId:string,submissionId:string,raw:LibraryMediaManifest) {
  const manifest=assertLibraryMediaManifest(raw)
  await assertManifestAssetVersions(tx,manifest)
  await retainAssessmentAssetReferences({owner:{entityType:'ScaleLibraryMedia',entityId:entryId,field:'media'},references:manifest.items,db:tx})
  // No external copy/job is needed: one DB transaction publishes all immutable logical
  // catalog records and their retention pins, or none. READY is never claimed for a queued copy.
  for (const item of manifest.items) await tx.$executeRaw(Prisma.sql`
    INSERT INTO scale_library_media(id,entry_id,asset_id,manifest_hash,identity,state)
    VALUES(${randomUUID()}::uuid,${entryId},${item.assetId},${manifest.manifestHash},${JSON.stringify(item)}::jsonb,'READY')`)
  const pins=manifest.items.length?await tx.assetReference.count({where:{entityType:'ScaleLibrarySubmission',entityId:submissionId,field:'media',assetId:{in:manifest.items.map(i=>i.assetId)}}}):0
  if (pins!==manifest.items.length) fail('SCALE_LIBRARY_SUBMISSION_MEDIA_NOT_RETAINED')
}
async function assertManifestAssetVersions(tx:Tx,manifest:LibraryMediaManifest) {
  const ids=manifest.items.map(i=>i.assetId)
  await lockStoredAssetRows(tx,ids)
  const assets=ids.length?await tx.storedAsset.findMany({where:{id:{in:ids}}}):[]
  if(assets.length!==ids.length||manifest.items.some(item=>!assets.some(a=>a.id===item.assetId&&!a.deletedAt&&a.accessScope==='PRIVATE'&&a.sha256===item.contentHash&&a.mimeType===item.mimeType&&a.sizeBytes===item.sizeBytes&&a.createdAt.toISOString()===item.assetVersion)))
    fail('SCALE_LIBRARY_MEDIA_FROZEN_VERSION_MISMATCH')
}
export async function assertLibraryMediaReady(tx:Tx,entryId:string,raw:LibraryMediaManifest) {
  const manifest=assertLibraryMediaManifest(raw)
  await assertManifestAssetVersions(tx,manifest)
  const rows=await tx.$queryRaw<Array<{asset_id:string;identity:unknown;manifest_hash:string;state:string}>>(Prisma.sql`
    SELECT asset_id,identity,manifest_hash,state FROM scale_library_media WHERE entry_id=${entryId} FOR SHARE`)
  if(rows.length!==manifest.items.length||manifest.items.some(item=>!rows.some(row=>row.asset_id===item.assetId&&row.state==='READY'&&row.manifest_hash===manifest.manifestHash&&canonicalHash(row.identity)===canonicalHash(item))))
    fail('SCALE_LIBRARY_MEDIA_NOT_READY')
}
