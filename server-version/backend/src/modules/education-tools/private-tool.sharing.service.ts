import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {publishContentRelease} from '../measurement-content/repository'
import {authorizePrivateTool,privateToolScope} from './private-tool.access'
import {privateToolId,privateToolFail,type PrivateToolContext} from './private-tool.contracts'
import {readPrivateScaleVersionIdentity,privateScaleMeasurementInput} from './private-tool.runtime-source'
import {submissionSource} from '../scale-library-governance/source'
import {submissionInput,transitionInput,fail} from '../scale-library-governance/contracts'
import {sourceMetadataDefaults,submissionView,submitInTransaction,event,type SubmissionRow} from '../scale-library-governance/service'
import {buildLibraryMediaManifest,assertLibraryMediaManifest} from '../scale-library-governance/media'
import {libraryActor} from '../scale-library-governance/authority'
import {libraryCompatibility} from '../scale-library-governance/catalog-adapter'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'

type Tx=Prisma.TransactionClient
const hash=z.string().regex(/^[a-f0-9]{64}$/)
export const sharingPrepareInput=z.object({contentHash:hash}).strict()
export const sharingSubmissionInput=submissionInput.extend({contentHash:hash,dependencyReleaseIds:z.array(z.string().guid()).max(0).default([])}).strict()
const transact=<T>(fn:(tx:Tx)=>Promise<T>)=>prisma.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted})
const boundary={canRequestLibraryShare:true,canShare:false,canPublish:false,visibility:'AUTHOR_PRIVATE'} as const
const sharingView=(row:SubmissionRow)=>({...submissionView(row),versionId:row.snapshot.educationSource?.versionId,privateContentHash:row.snapshot.educationSource?.contentHash})
async function ownedTool(tx:Tx,c:PrivateToolContext,toolId:string,mutation=false){
 privateToolId.parse(toolId)
 await authorizePrivateTool(tx,c,mutation)
 const tool=await tx.educationPrivateTool.findFirst({where:{id:toolId,...privateToolScope(c),kind:'SCALE'}})
 if(!tool)privateToolFail('PRIVATE_TOOL_NOT_FOUND',404)
 return tool
}
async function ownedVersion(tx:Tx,c:PrivateToolContext,toolId:string,versionId:string,contentHash:string){
 await ownedTool(tx,c,toolId,true);privateToolId.parse(versionId)
 const scoped=await tx.educationPrivateToolVersion.findFirst({where:{id:versionId,toolId,...privateToolScope(c),kind:'SCALE'}})
 if(!scoped||scoped.contentHash!==contentHash)privateToolFail('PRIVATE_TOOL_VERSION_NOT_FOUND',404)
 return readPrivateScaleVersionIdentity(tx,versionId)
}
/** Explicit preparation publishes ONLY a private immutable release, never a
 * task, runtime wrapper, library entry or use grant. GET has no publication side effect. */
export async function preparePrivateScaleSharing(c:PrivateToolContext,toolId:string,versionId:string,raw:unknown){
 const input=sharingPrepareInput.parse(raw)
 return transact(async tx=>{
  // Account writers lock user before organization. Hold the same ordering.
  await libraryActor(tx,c.principal.userId)
  const {version,definition}=await ownedVersion(tx,c,toolId,versionId,input.contentHash)
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'private-scale:'+version.id}))`)
  const release=await publishContentRelease(tx,privateScaleMeasurementInput(version,definition),c.principal.userId)
  if(release.status!=='PUBLISHED')fail('EDUCATION_LIBRARY_SOURCE_NOT_AVAILABLE')
  await assertScaleLibraryCollectionAllowed(tx,[release.releaseId])
  const source=await submissionSource(tx,c.principal.userId,c.entry,release.releaseId)
  const mediaManifest=await buildLibraryMediaManifest(tx,c.principal.userId,source.snapshot,release)
  return {sourceId:toolId,versionId,sourceRevision:version.sourceRevision,privateContentHash:version.contentHash,
   product:c.entry,releaseId:release.releaseId,version:release.version,contentHash:release.contentHash,publishedAt:release.publishedAt,
   title:version.title,defaults:sourceMetadataDefaults(source.snapshot),mediaManifest,...libraryCompatibility(source.snapshot),...boundary}
 })
}
export async function submitPrivateScaleSharing(c:PrivateToolContext,toolId:string,versionId:string,raw:unknown){
 const {contentHash,...input}=sharingSubmissionInput.parse(raw)
 return transact(async tx=>{
  // Keep current-account and organization authority in this one transaction.
  await libraryActor(tx,c.principal.userId)
  await ownedVersion(tx,c,toolId,versionId,contentHash)
  const source=await submissionSource(tx,c.principal.userId,c.entry,input.releaseId)
  if(source.sourceId!==toolId||source.snapshot.educationSource?.versionId!==versionId
   ||source.snapshot.educationSource.organizationId!==c.organizationId||source.snapshot.educationSource.contentHash!==contentHash)
   fail('EDUCATION_LIBRARY_SOURCE_IDENTITY_MISMATCH',403)
  return {...await submitInTransaction(tx,c.principal.userId,c.entry,input),versionId,privateContentHash:contentHash}
 })
}
async function ownedSubmission(tx:Tx,c:PrivateToolContext,toolId:string,submissionId:string,write=false){
 await ownedTool(tx,c,toolId,write);privateToolId.parse(submissionId)
 const [row]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions
  WHERE id=${submissionId} AND author_id=${c.principal.userId} AND product=${c.entry} AND source_id=${toolId}
  ${write?Prisma.sql`FOR UPDATE`:Prisma.sql`FOR SHARE`}`)
 if(!row||row.snapshot.educationSource?.organizationId!==c.organizationId||row.snapshot.educationSource.toolId!==toolId
  ||row.snapshot.educationSource.entry!==c.entry)fail('EDUCATION_LIBRARY_SUBMISSION_NOT_FOUND',404)
 if(canonicalHash(row.snapshot)!==row.snapshot_hash)fail('EDUCATION_LIBRARY_SNAPSHOT_INVALID')
 return row
}
export async function listPrivateScaleSharing(c:PrivateToolContext,toolId:string){
 return transact(async tx=>{
  await ownedTool(tx,c,toolId)
  const rows=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`SELECT * FROM scale_library_submissions
   WHERE author_id=${c.principal.userId} AND product=${c.entry} AND source_id=${toolId}
    AND snapshot#>>'{educationSource,organizationId}'=${c.organizationId}
   ORDER BY created_at DESC,id LIMIT 101`)
  for(const row of rows)if(canonicalHash(row.snapshot)!==row.snapshot_hash)fail('EDUCATION_LIBRARY_SNAPSHOT_INVALID')
  return {list:rows.slice(0,100).map(sharingView),hasMore:rows.length>100,...boundary}
 })
}
export async function readPrivateScaleSharing(c:PrivateToolContext,toolId:string,submissionId:string){
 return transact(async tx=>{const row=await ownedSubmission(tx,c,toolId,submissionId)
  return {...sharingView(row),snapshot:row.snapshot,mediaManifest:assertLibraryMediaManifest(row.snapshot.mediaManifest)}})
}
export async function withdrawPrivateScaleSharing(c:PrivateToolContext,toolId:string,submissionId:string,raw:unknown){
 const input=transitionInput.parse(raw)
 return transact(async tx=>{
  const row=await ownedSubmission(tx,c,toolId,submissionId,true)
  if(row.status!=='SUBMITTED'||row.version!==input.expectedVersion)fail('申请已处理或版本已变化')
  const [updated]=await tx.$queryRaw<SubmissionRow[]>(Prisma.sql`UPDATE scale_library_submissions
   SET status='WITHDRAWN',reason=${input.reason},version=version+1,updated_at=clock_timestamp()
   WHERE id=${row.id} AND status='SUBMITTED' AND version=${input.expectedVersion} RETURNING *`)
  if(!updated)fail('申请已处理或版本已变化')
  await event(tx,c.principal.userId,'SUBMISSION_WITHDRAWN',input.reason,row.id,null)
  return sharingView(updated)
 })
}
/** Source preview rechecks the original scoped version and release. It does
 * not prepare/publish a release, and never accepts an arbitrary media ID alone. */
export async function readPrivateScaleSharingMedia(c:PrivateToolContext,toolId:string,versionId:string,releaseId:string){
 privateToolId.parse(versionId);privateToolId.parse(releaseId)
 return transact(async tx=>{
  await ownedTool(tx,c,toolId)
  const source=await submissionSource(tx,c.principal.userId,c.entry,releaseId)
  if(source.sourceId!==toolId||source.snapshot.educationSource?.versionId!==versionId
   ||source.snapshot.educationSource.organizationId!==c.organizationId)fail('EDUCATION_LIBRARY_SOURCE_IDENTITY_MISMATCH',403)
  return buildLibraryMediaManifest(tx,c.principal.userId,source.snapshot,source.release)
 })
}
