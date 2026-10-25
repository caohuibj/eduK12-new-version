import type {CatalogDiscoveryFilters} from '../scale/library/catalog-discovery'
import {packageBoundCatalogSnapshots,assertNotTechnicalPackageGrant} from './governed-package.service'
import {isGovernedSource} from './governed-tool.model'
import {assertGovernedEntryAllowed} from './governed-tool.service'
import {assertSurveyToolPolicy,snapshotPolicyIdentity,readToolPolicy} from './tool-policy'
import {assertLibraryUseGrantCurrent} from '../scale-library-governance/usage'
import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {assertSurveyManager} from './admin-role'
import {SurveyGovernanceError} from './governance.service'
import {getCatalogSourceSnapshot,listCatalogSources,assertCatalogSourcesCurrent,recheckCatalogSjtSourceAuthority,type CatalogSourceRef} from './catalog.sources'
import type {ResearchFrozenUnit} from './publication.service'

type Tx=Prisma.TransactionClient
const fail=(status:number,message:string):never=>{throw new SurveyGovernanceError(status,message)}
export type CatalogSnapshot=Awaited<ReturnType<typeof getCatalogSourceSnapshot>>
type Grant={id:string;createdBy:string;userId:string;status:string;snapshot:CatalogSnapshot;snapshotDigest:string;createdAt:Date;revokedAt:Date|null}
const view=(r:Grant)=>({id:r.id,title:r.snapshot.title,kind:r.snapshot.ref.kind,status:r.status,
  sourceRef:r.snapshot.ref,sourceProvenance:{...r.snapshot.provenance,originalSource:r.snapshot.provenance.source??null,source:r.snapshot.ref,
    definitionDigest:r.snapshot.definitionDigest,adapterVersion:r.snapshot.adapterVersion},createdAt:r.createdAt,revokedAt:r.revokedAt})
export async function sourceCatalog(actorUserId:string,input:{kind?:CatalogSourceRef['kind'];organizationId?:string;page:number;discovery?:CatalogDiscoveryFilters}){
  await assertSurveyManager(prisma,actorUserId)
  const result=await listCatalogSources({actorUserId,...input},prisma)
  const list=[]
  for(const row of result.list){
    if(row.ref.kind!=='SCALE'||!row.available){
      if(isGovernedSource(row.ref.sourceId)&&row.available){try{await assertGovernedEntryAllowed(prisma,row.ref.sourceId.slice(12),row.ref.sourceVersion);list.push(row)}catch(e){list.push({...row,available:false,unsupportedReason:e instanceof Error?e.message:'尚未准入 Survey'})}}
      else list.push(row.ref.kind!=='SCALE'&&row.available?{...row,available:false,unsupportedReason:'此原来源尚未经过系统三版本审批；请先在工具库审批中提交精确版本'}:row)
      continue}
    const snapshot=await getCatalogSourceSnapshot({actorUserId,ref:row.ref},prisma)
    const policy=await readToolPolicy(prisma,await snapshotPolicyIdentity(prisma,snapshot))
    const available=(snapshot.provenance.surveyStandardReleaseId?policy.decision!=='RETURNED':policy.decision==='APPROVED')&&!policy.paused
    list.push({...row,available,unsupportedReason:available?row.unsupportedReason:policy.paused?'Survey 新增分配和投放已暂停：'+policy.reason:'尚未通过 Survey 范围审批；请先在工具库审批中核对精确版本',surveyPolicy:policy})
  }
  return {...result,list,pageSize:25}
}
async function target(tx:Tx,id:string){
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT u.id FROM users u
    JOIN survey_researcher_grants g ON g.user_id=u.id JOIN survey_accounts a ON a.user_id=u.id
    WHERE u.id=${id} AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
    AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
    AND g.status IN ('ACTIVE','PENDING_MFA') FOR SHARE OF u,g`
  if(!rows.length)fail(404,'研究者不存在或资格不可用')
}
export async function grantCatalogSource(actorUserId:string,userId:string,ref:CatalogSourceRef){
  return prisma.$transaction(async tx=>{
    await assertSurveyManager(tx,actorUserId);await target(tx,userId)
    if(isGovernedSource(ref.sourceId))await assertGovernedEntryAllowed(tx,ref.sourceId.slice(12),ref.sourceVersion)
    else if(ref.kind!=='SCALE')fail(409,'新的使用授权须选择已通过系统审批和自动试运行的精确工具版本')
    if(ref.kind==='SCALE'){
      const [source]=await tx.$queryRaw<Array<{instrument_class:string}>>`SELECT instrument_class::text FROM scales WHERE id=${ref.sourceId} FOR SHARE`
      if(source?.instrument_class==='CUSTOM_DESCRIPTIVE')fail(403,'自编量表新分配必须通过已批准的共用库精确版本；旧授权不能扩大')
    }
    const snapshot=await getCatalogSourceSnapshot({actorUserId,ref},tx)
    await assertSurveyToolPolicy(tx,await snapshotPolicyIdentity(tx,snapshot),ref.kind==='SCALE'&&!snapshot.provenance.surveyStandardReleaseId)
    const snapshotDigest=canonicalHash(snapshot)
    const rows=await tx.$queryRaw<Grant[]>`INSERT INTO survey_tool_grants
      (id,user_id,status,snapshot,snapshot_digest,created_by)
      VALUES (${randomUUID()},${userId},'ACTIVE',${JSON.stringify(snapshot)}::jsonb,${snapshotDigest},${actorUserId})
      ON CONFLICT (user_id,snapshot_digest) WHERE status='ACTIVE' DO UPDATE SET status='ACTIVE'
      RETURNING id,user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"`
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId,targetUserId:userId,
      action:'CATALOG_TOOL_GRANTED',metadata:{grantId:rows[0].id,source:ref,snapshotDigest}}})
    await recheckCatalogSjtSourceAuthority(tx,[snapshot])
    return view(rows[0])
  })
}
export async function listToolGrants(actorUserId:string,userId:string,page=1){
  await assertSurveyManager(prisma,actorUserId)
  const rows=await prisma.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,jsonb_build_object('title',snapshot->'title','ref',snapshot->'ref','provenance',jsonb_build_object('license',snapshot#>'{provenance,license}','reuseAuthority',snapshot#>'{provenance,reuseAuthority}'),
      'definitionDigest',snapshot->'definitionDigest','adapterVersion',snapshot->'adapterVersion') AS snapshot,snapshot_digest AS "snapshotDigest",
    created_at AS "createdAt",revoked_at AS "revokedAt" FROM survey_tool_grants WHERE user_id=${userId} AND NOT EXISTS(SELECT 1 FROM survey_package_members pm WHERE pm.technical_grant_id=survey_tool_grants.id)
    ORDER BY created_at DESC,id LIMIT 25 OFFSET ${(page-1)*25}`
  return {page,pageSize:25,list:rows.map(view)}
}
export async function revokeToolGrant(actorUserId:string,id:string){
  return prisma.$transaction(async tx=>{
    await assertSurveyManager(tx,actorUserId)
    await assertNotTechnicalPackageGrant(tx,id)
    const rows=await tx.$queryRaw<{userId:string}[]>`UPDATE survey_tool_grants SET status='REVOKED',revoked_at=statement_timestamp()
      WHERE id=${id} AND status='ACTIVE' RETURNING user_id AS "userId"`
    if(!rows.length)fail(404,'授权不存在或已撤销')
    await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId,targetUserId:rows[0].userId,
      action:'CATALOG_TOOL_REVOKED',metadata:{grantId:id,policy:'STOP_NEW_ADMISSION_AND_COLLECTION_KEEP_SAVED_DATA'}}})
    return {revoked:true}
  })
}
/** One bulk source/grant read, only for sourced drafts. Never on participant/scorer paths. */
export async function catalogSnapshotsForDrafts(tx:Tx,userId:string,ids:readonly string[],active=true){
  if(!ids.length)return new Map<string,CatalogSnapshot>()
  const rows=await tx.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",
    created_at AS "createdAt",revoked_at AS "revokedAt" FROM survey_tool_grants
    WHERE id IN (${Prisma.join([...new Set(ids)])}) AND user_id=${userId} ORDER BY id`
  const map=new Map<string,CatalogSnapshot>()
  for(const row of rows){
    if(active&&row.status!=='ACTIVE')fail(409,'工具复用授权已撤销，不能继续导入或冻结新的研究版本')
    if(canonicalHash(row.snapshot)!==row.snapshotDigest)fail(409,'授权工具来源摘要不匹配')
    map.set(row.id,row.snapshot)
  }
  if(map.size!==new Set(ids).size)fail(403,'工具来源不属于当前研究者授权')
  if(active){
    for(const row of rows){await assertSurveyToolPolicy(tx,await snapshotPolicyIdentity(tx,row.snapshot),false);const entryId=row.snapshot.provenance.libraryEntryId
      if(typeof entryId==='string')await assertLibraryUseGrantCurrent(tx,{entryId,userId,product:'SURVEY'})
    }
    await assertCatalogSourcesCurrent(rows.filter(r=>typeof r.snapshot.provenance.libraryEntryId!=='string'&&!r.snapshot.provenance.packageBindingIdentity).map(r=>({snapshot:r.snapshot,actorUserId:r.createdBy})),tx)
  }
  // Match governance revocation's use-grant -> tool-grant lock order. Reading
  // the immutable identity first must not hold tool SHARE while waiting for use.
  const locked=await tx.$queryRaw<Grant[]>`SELECT id,status,snapshot,snapshot_digest AS "snapshotDigest" FROM survey_tool_grants
    WHERE id IN (${Prisma.join([...new Set(ids)])}) AND user_id=${userId} ORDER BY id FOR SHARE`
  if(locked.length!==rows.length)fail(403,'工具来源授权已变化')
  for(const row of locked){
    const original=rows.find(r=>r.id===row.id)
    if(!original||row.snapshotDigest!==original.snapshotDigest||canonicalHash(row.snapshot)!==row.snapshotDigest
      ||active&&row.status!=='ACTIVE')fail(409,'工具来源授权已变化，请重新载入')
  }
  return packageBoundCatalogSnapshots(tx,userId,map,active)
}
export function compileCatalogUnit(draft:{id:string;instrumentKey:string;kind:string;title:string;revision:number;definition:unknown;catalogGrantId?:string|null},snapshot:CatalogSnapshot):ResearchFrozenUnit{
  const packageBinding=snapshot.provenance.surveyPackage as {draftId:string}|undefined
  if(packageBinding&&packageBinding.draftId!==draft.id)fail(403,'整包组件不能拆出复制或重新导入')
  if(draft.kind!==snapshot.ref.kind||canonicalHash(draft.definition)!==canonicalHash(snapshot.displayDefinition))
    fail(409,'只读来源工具的定义已经变化')
  return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind:snapshot.ref.kind,title:draft.title,
    draftRevision:draft.revision,sourceDigest:snapshot.definitionDigest,scoringDigest:snapshot.scoringDigest,
    compiledDefinition:snapshot.compiledDefinition,displayDefinition:snapshot.displayDefinition,
    ...(snapshot.nativeSituational?{executionProtocol:snapshot.nativeSituational.protocol,
      nativeSituational:snapshot.nativeSituational}:{}),
    sourceProvenance:{...snapshot.provenance,...(draft.catalogGrantId?{sourceGrantId:draft.catalogGrantId}:{}),originalSource:snapshot.provenance.source??null,source:snapshot.ref,definitionDigest:snapshot.definitionDigest,
      adapterVersion:snapshot.adapterVersion},...(snapshot.answerMapping?{sourceAnswerMapping:snapshot.answerMapping}:{})}
}
export async function researcherCatalog(tx:Tx,userId:string,page:number){
  const rows=await tx.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,jsonb_build_object('title',snapshot->'title','ref',snapshot->'ref','provenance',jsonb_build_object('license',snapshot#>'{provenance,license}','reuseAuthority',snapshot#>'{provenance,reuseAuthority}'),
      'definitionDigest',snapshot->'definitionDigest','adapterVersion',snapshot->'adapterVersion') AS snapshot,snapshot_digest AS "snapshotDigest",
    created_at AS "createdAt",revoked_at AS "revokedAt" FROM survey_tool_grants
    WHERE user_id=${userId} AND status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM survey_package_members pm WHERE pm.technical_grant_id=survey_tool_grants.id) ORDER BY created_at DESC,id LIMIT 25 OFFSET ${(page-1)*25}`
  return {page,pageSize:25,list:rows.map(view)}
}
