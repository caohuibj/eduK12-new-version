import {randomUUID} from 'node:crypto'
import {Prisma, type PrismaClient} from '@prisma/client'
import {canonicalHash} from '../../assessment-runtime/canonical'
import {
  approveStandardCombinationEntryPolicies,
  exactStandardCombinationEntryProducts,
  readApprovedToolEntryProducts,
} from '../../assessment-governance/tool-entry-policy'
import {getContentRelease} from '../../measurement-content/repository'
import type {Triplet} from '../../survey/standard-triplet.model'
import {
  assertGitScalePublisher, publishScaleRelease, type GitScalePublication, type StandardRelease,
} from '../../survey/standard-triplet.service'

export type GitScaleRelease = {
  releaseKey: string
  triplet: Triplet
  allowedEntries: unknown
  state: 'ONLINE' | 'WITHDRAWN'
  replaces?: string
  reviewNote?: string
}

type Products = ReturnType<typeof exactStandardCombinationEntryProducts>
type GitSyncReceipt = {
  releaseId: string
  releaseVersion: number
  gitCommitSha: string
  state: 'ONLINE' | 'WITHDRAWN'
  allowedEntries: Products
}
type SyncResult = {
  toolKey: string
  releaseKey: string
  releaseId: string
  action: 'PUBLISHED' | 'UNCHANGED' | 'RESTORED' | 'SCOPE_CHANGED' | 'WITHDRAWN' | 'MANUAL' | 'MANUAL_HOLD'
}
const gitOrigin = (row:StandardRelease) => (
  row.snapshot.reference.approvals as Array<{gitRelease?:GitScalePublication;requestId?:string;actorId?:string;versions?:string}>
).find(item=>item.requestId===row.id&&item.actorId===row.approved_by&&item.versions===row.combination_hash
  &&item.gitRelease?.source==='SYSTEM_GIT_RELEASE')?.gitRelease
const gitMarker=JSON.stringify([{gitRelease:{source:'SYSTEM_GIT_RELEASE'}}])
const conflict=(reason:string)=>{throw new Error('STANDARD_GIT_'+reason)}
const reason=(commit:string)=>'Git main '+commit

/** Named successors replace their declared ancestors. A reverted or omitted
 * successor leaves any remaining ONLINE declaration eligible for reactivation. */
export function activeGitScaleReleases(releases:readonly GitScaleRelease[], knownKeys:ReadonlySet<string> = new Set()){
  const byKey=new Map(releases.map(release=>[release.releaseKey,release]))
  if(byKey.size!==releases.length)conflict('DUPLICATE_RELEASE_KEY')
  const superseded=new Set<string>()
  for(const release of releases.filter(item=>item.state==='ONLINE')){
    const seen=new Set([release.releaseKey])
    let key=release.replaces
    while(key){
      if(seen.has(key))conflict('REPLACEMENT_CYCLE:'+key)
      seen.add(key)
      if(/^\d+\.\d+\.\d+\/default$/.test(key))break
      if(!byKey.has(key)&&!knownKeys.has(key))conflict('REPLACEMENT_NOT_FOUND:'+key)
      superseded.add(key)
      key=byKey.get(key)?.replaces
    }
  }
  const online=releases.filter(release=>release.state==='ONLINE'&&!superseded.has(release.releaseKey))
  if(new Set(online.map(item=>item.triplet.combinationHash)).size!==online.length)conflict('DUPLICATE_COMBINATION')
  return online
}

async function readSyncReceipts(tx:Prisma.TransactionClient,actorId:string,toolKey:string){
  const rows=await tx.$queryRaw<Array<{metadata:GitSyncReceipt}>>`SELECT DISTINCT ON (metadata->>'releaseId') metadata
    FROM survey_events WHERE actor_user_id=${actorId} AND action='GIT_STANDARD_RELEASE_SYNCED' AND metadata->>'toolKey'=${toolKey}
    ORDER BY metadata->>'releaseId',(metadata->>'releaseVersion')::int DESC`
  return new Map(rows.map(({metadata})=>[metadata.releaseId,metadata]))
}

async function syncTool(tx:Prisma.TransactionClient,input:{actorId:string;gitCommitSha:string},toolKey:string,releases:readonly GitScaleRelease[]):Promise<SyncResult[]>{
  const {actorId,gitCommitSha}=input
  await assertGitScalePublisher(tx,actorId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'standard-git-release:'+toolKey}))`
  // The shared publisher takes this lock before any release row lock. Taking the
  // same locks in order also serializes concurrent admin publication of a match.
  for(const hash of [...new Set(releases.map(release=>release.triplet.combinationHash))].sort()){
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-standard:'+hash}))`
  }
  const rows=await tx.$queryRaw<StandardRelease[]>(Prisma.sql`SELECT * FROM survey_standard_releases WHERE tool_key=${toolKey}
    AND ((reference->'approvals') @> ${gitMarker}::jsonb
      ${releases.length?Prisma.sql`OR combination_hash IN (${Prisma.join(releases.map(release=>release.triplet.combinationHash))})`:Prisma.empty})
    ORDER BY id FOR UPDATE`)
  const owned=rows.filter(row=>gitOrigin(row))
  if(owned.some(row=>row.approved_by!==actorId))conflict('DEPLOYMENT_IDENTITY_CHANGED:'+toolKey)
  const receipts=await readSyncReceipts(tx,actorId,toolKey)
  const desired=activeGitScaleReleases(releases,new Set(owned.map(row=>gitOrigin(row)!.releaseKey)))
  const desiredHashes=new Set(desired.map(release=>release.triplet.combinationHash))
  const changes:SyncResult[]=[]
  const record=async(releaseKey:string,releaseId:string,releaseVersion:number,state:GitSyncReceipt['state'],allowedEntries:Products,
    action:SyncResult['action'],extra={})=>{
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actorId,action:'GIT_STANDARD_RELEASE_SYNCED',
      metadata:{toolKey,releaseKey,releaseId,releaseVersion,state,allowedEntries,source:'SYSTEM_GIT_RELEASE',gitCommitSha,action,...extra}}})
    changes.push({toolKey,releaseKey,releaseId,action})
  }
  for(const release of desired){
    const {releaseKey,triplet,replaces,reviewNote}=release
    const allowedEntries=exactStandardCombinationEntryProducts(release.allowedEntries)
    const prior=rows.find(row=>row.combination_hash===triplet.combinationHash)
    if(!prior){
      const previous=owned.find(row=>row.state==='ONLINE'&&gitOrigin(row)!.releaseKey===(replaces??releaseKey))
      const published=await publishScaleRelease(tx,{
        toolKey,requestId:randomUUID(),expectedCombinationHash:triplet.combinationHash,
        CONTENT:triplet.parts.CONTENT.hash,PARAMETERS:triplet.parts.PARAMETERS.hash,REPORT:triplet.parts.REPORT.hash,
        reason:reason(gitCommitSha),allowedProducts:allowedEntries,
      },triplet,{actor:actorId,source:'SYSTEM_GIT_RELEASE',gitCommitSha,releaseKey,replaces,reviewNote})
      if(published.state!=='ONLINE')conflict('PUBLICATION_INCOMPLETE:'+releaseKey)
      await record(releaseKey,published.id,published.version,'ONLINE',allowedEntries,'PUBLISHED',{
        combinationHash:published.combinationHash,
        rollbackTo:previous?{releaseId:previous.id,combinationHash:previous.combination_hash}:replaces??null,
      })
      continue
    }
    const identity={resourceKey:'standard-release:'+prior.id,fingerprint:prior.combination_hash}
    const origin=gitOrigin(prior)
    if(!origin){
      const entry=await readApprovedToolEntryProducts(tx,identity)
      if(prior.state==='ONLINE'&&canonicalHash(entry.approvedProducts)===canonicalHash(allowedEntries)){
        changes.push({toolKey,releaseKey,releaseId:prior.id,action:'MANUAL'})
        continue
      }
      conflict('ADMIN_OWNED_COMBINATION:'+releaseKey)
    }
    if(origin!.releaseKey!==releaseKey)conflict('COMBINATION_ALREADY_NAMED:'+releaseKey)
    const last=receipts.get(prior.id)
    if(prior.state==='WITHDRAWN'&&(last?.state!=='WITHDRAWN'||last.releaseVersion!==prior.version)){
      changes.push({toolKey,releaseKey,releaseId:prior.id,action:'MANUAL_HOLD'})
      continue
    }
    if(prior.state==='ONLINE'&&canonicalHash(last?.allowedEntries??null)===canonicalHash(allowedEntries)){
      changes.push({toolKey,releaseKey,releaseId:prior.id,action:'UNCHANGED'})
      continue
    }
    const measurement=prior.measurement_release&&await getContentRelease(tx,prior.measurement_release.releaseId,true)
    if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.status!=='PUBLISHED'
      ||measurement.contentHash!==prior.measurement_release?.contentHash)conflict('RECOVERY_MEASUREMENT_UNAVAILABLE:'+releaseKey)
    await approveStandardCombinationEntryPolicies(tx,identity,allowedEntries,actorId,reason(gitCommitSha),{preservePause:true})
    await tx.$executeRaw`UPDATE survey_standard_releases SET state='ONLINE',version=version+1,updated_at=clock_timestamp() WHERE id=${prior.id}`
    await record(releaseKey,prior.id,prior.version+1,'ONLINE',allowedEntries,prior.state==='WITHDRAWN'?'RESTORED':'SCOPE_CHANGED')
  }
  for(const row of owned.filter(row=>row.state==='ONLINE'&&!desiredHashes.has(row.combination_hash))){
    await tx.$executeRaw`UPDATE survey_standard_releases SET state='WITHDRAWN',version=version+1,updated_at=clock_timestamp() WHERE id=${row.id}`
    await record(gitOrigin(row)!.releaseKey,row.id,row.version+1,'WITHDRAWN',receipts.get(row.id)?.allowedEntries??[],'WITHDRAWN',{preserveHistory:true})
  }
  return changes
}

/** The deployment adapter submits the complete manifest snapshot of its
 * verified main revision. Omission withdraws only releases owned by Git. */
export async function syncGitScaleReleases(db:PrismaClient,input:{actorId:string;gitCommitSha:string;releases:readonly GitScaleRelease[]}){
  if(!/^[a-f0-9]{40}$/.test(input.gitCommitSha))conflict('INVALID_COMMIT')
  await assertGitScalePublisher(db,input.actorId)
  const byTool=new Map<string,GitScaleRelease[]>()
  for(const release of input.releases){
    exactStandardCombinationEntryProducts(release.allowedEntries)
    const key=release.triplet.toolKey
    const tool=byTool.get(key)??[]
    tool.push(release)
    byTool.set(key,tool)
  }
  const previous=await db.$queryRaw<Array<{tool_key:string}>>`SELECT DISTINCT tool_key FROM survey_standard_releases
    WHERE state='ONLINE' AND (reference->'approvals') @> ${gitMarker}::jsonb`
  const results:SyncResult[]=[]
  const toolKeys=[...new Set([...byTool.keys(),...previous.map(row=>row.tool_key)])].sort()
  for(const toolKey of toolKeys)results.push(...await db.$transaction(tx=>syncTool(tx,input,toolKey,byTool.get(toolKey)??[]),{timeout:30000}))
  return results
}
