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
import {ensureStandardNativeScale} from './standard-release-native'
import {scaleDeclarationStates} from '../declarative/replacement'

export type GitScaleRelease = {
  releaseKey: string
  triplet: Triplet
  allowedEntries: unknown
  state: 'ONLINE' | 'HOLD' | 'WITHDRAWN'
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

async function readSyncReceipts(tx:Prisma.TransactionClient,actorId:string,toolKey:string){
  const rows=await tx.$queryRaw<Array<{metadata:GitSyncReceipt}>>`SELECT DISTINCT ON (metadata->>'releaseId') metadata
    FROM survey_events WHERE actor_user_id=${actorId} AND action='GIT_STANDARD_RELEASE_SYNCED' AND metadata->>'toolKey'=${toolKey}
    ORDER BY metadata->>'releaseId',(metadata->>'releaseVersion')::int DESC`
  return new Map(rows.map(({metadata})=>[metadata.releaseId,metadata]))
}

async function syncTool(tx:Prisma.TransactionClient,input:{actorId:string;gitCommitSha:string},toolKey:string,releases:readonly GitScaleRelease[],states:ReturnType<typeof scaleDeclarationStates>):Promise<SyncResult[]>{
  const {actorId,gitCommitSha}=input
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
  const retainedHashes=new Set(releases.filter(release=>{
    const state=states.get(release.releaseKey)
    return state==='ONLINE'||state==='HOLD'
  }).map(release=>release.triplet.combinationHash))
  const changes:SyncResult[]=[]
  const record=async(releaseKey:string,releaseId:string,releaseVersion:number,state:GitSyncReceipt['state'],allowedEntries:Products,
    action:SyncResult['action'],extra={})=>{
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actorId,action:'GIT_STANDARD_RELEASE_SYNCED',
      metadata:{toolKey,releaseKey,releaseId,releaseVersion,state,allowedEntries,source:'SYSTEM_GIT_RELEASE',gitCommitSha,action,...extra}}})
    changes.push({toolKey,releaseKey,releaseId,action})
  }
  for(const release of releases.filter(release=>states.get(release.releaseKey)==='ONLINE')){
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
    if(allowedEntries.some(product=>product!=='SURVEY'))await ensureStandardNativeScale(tx,actorId,prior.snapshot,true)
    await approveStandardCombinationEntryPolicies(tx,identity,allowedEntries,actorId,reason(gitCommitSha),{preservePause:true})
    await tx.$executeRaw`UPDATE survey_standard_releases SET state='ONLINE',version=version+1,updated_at=clock_timestamp() WHERE id=${prior.id}`
    await record(releaseKey,prior.id,prior.version+1,'ONLINE',allowedEntries,prior.state==='WITHDRAWN'?'RESTORED':'SCOPE_CHANGED')
  }
  for(const row of owned.filter(row=>row.state==='ONLINE'&&!retainedHashes.has(row.combination_hash))){
    await tx.$executeRaw`UPDATE survey_standard_releases SET state='WITHDRAWN',version=version+1,updated_at=clock_timestamp() WHERE id=${row.id}`
    await record(gitOrigin(row)!.releaseKey,row.id,row.version+1,'WITHDRAWN',receipts.get(row.id)?.allowedEntries??[],'WITHDRAWN',{preserveHistory:true})
  }
  return changes
}

/** The deployment adapter submits the complete manifest snapshot of its
 * verified main revision. Omission withdraws only releases owned by Git. */
type GitScaleSyncInput = {actorId:string;gitCommitSha:string;releases:readonly GitScaleRelease[]}

export function syncGitScaleReleases(db:PrismaClient,input:GitScaleSyncInput){
  return db.$transaction(tx=>syncGitScaleReleasesInTransaction(tx,input),{timeout:120000})
}

export async function syncGitScaleReleasesInTransaction(tx:Prisma.TransactionClient,input:GitScaleSyncInput){
  if(!/^[a-f0-9]{40}$/.test(input.gitCommitSha))conflict('INVALID_COMMIT')
  const byTool=new Map<string,GitScaleRelease[]>()
  for(const release of input.releases){
    exactStandardCombinationEntryProducts(release.allowedEntries)
    const key=release.triplet.toolKey
    const tool=byTool.get(key)??[]
    tool.push(release)
    byTool.set(key,tool)
  }
  const states=new Map([...byTool].map(([key,releases])=>{
    if(new Set(releases.map(item=>item.triplet.combinationHash)).size!==releases.length)conflict('DUPLICATE_COMBINATION:'+key)
    return [key,scaleDeclarationStates(releases)]
  }))
  await assertGitScalePublisher(tx,input.actorId)
  // A release commit represents a single desired state. Keep discovery under
  // the same lock so two simultaneous syncs cannot merge unrelated commits.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('standard-git-release-sync'))`
  const previous=await tx.$queryRaw<Array<{tool_key:string}>>`SELECT DISTINCT tool_key FROM survey_standard_releases
    WHERE state='ONLINE' AND (reference->'approvals') @> ${gitMarker}::jsonb`
  const results:SyncResult[]=[]
  const toolKeys=[...new Set([...byTool.keys(),...previous.map(row=>row.tool_key)])].sort()
  for(const toolKey of toolKeys)results.push(...await syncTool(tx,input,toolKey,byTool.get(toolKey)??[],states.get(toolKey)??new Map()))
  return results
}
