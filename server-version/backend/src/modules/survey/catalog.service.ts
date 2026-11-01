import {catalogDiscoveryRecords,standardDiscoveryMetadataJoin,discoveryPageSql,discoveryJoin,jsonTagIds,sjtMetadataTagIds} from './catalog-discovery'
import {isSurveyCognitiveProfileRef,parseSurveyCognitiveProfileRef,readSurveyCognitiveProfileSource,hydrateSurveyCognitiveProfileSource} from './cognitive-profile.source'
import {catalogTagFacets,type CatalogClassificationTag,type CatalogDiscoveryFilters} from '../scale/library/catalog-discovery'
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
import {surveyStandardUseInput,readSurveyStandardUse,readSurveyStandardSupersedes,assertSurveyStandardUseAuthority,surveyStandardSourceForRecheck} from '../assessment-authorization/survey-standard-use'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {standardConfigurationIdentity,selectedConfigurationPointer} from '../assessment-authorization/standard-configuration-binding'
import {sealSelectedConfigurationBinding} from '../assessment-authorization/selected-configuration'

type Tx=Prisma.TransactionClient
const fail=(status:number,message:string):never=>{throw new SurveyGovernanceError(status,message)}
export type CatalogSnapshot=Awaited<ReturnType<typeof getCatalogSourceSnapshot>>
type Grant={id:string;createdBy:string;userId:string;status:string;snapshot:CatalogSnapshot;snapshotDigest:string;createdAt:Date;revokedAt:Date|null}
const view=(r:Grant)=>{const selected=readSurveyStandardUse(r),supersedes=selected?readSurveyStandardSupersedes(r.snapshot.provenance.configurationSupersedes):null;return {id:r.id,title:r.snapshot.title,kind:r.snapshot.ref.kind,status:r.status,
  ...(selected?{recipientId:r.userId,issuerId:r.createdBy,configurationName:r.snapshot.provenance.configurationName,selectedBinding:selectedConfigurationPointer(selected),...(supersedes?{supersedes}:{})}:{}),
  sourceRef:r.snapshot.ref,sourceProvenance:{...r.snapshot.provenance,originalSource:r.snapshot.provenance.source??null,source:r.snapshot.ref,
    definitionDigest:r.snapshot.definitionDigest,adapterVersion:r.snapshot.adapterVersion},createdAt:r.createdAt,revokedAt:r.revokedAt}}
export async function sourceCatalog(actorUserId:string,input:{kind?:CatalogSourceRef['kind'];organizationId?:string;page:number;discovery?:CatalogDiscoveryFilters}){
  await assertSurveyManager(prisma,actorUserId)
  const result=await listCatalogSources({actorUserId,...input},prisma)
  const list=[]
  for(const row of result.list){
    if(isSurveyCognitiveProfileRef(row.ref)){list.push(row);continue}
    if(row.ref.kind!=='SCALE'||!row.available){
      if(isGovernedSource(row.ref.sourceId)&&row.available){try{await assertGovernedEntryAllowed(prisma,row.ref.sourceId.slice(12),row.ref.sourceVersion);list.push(row)}catch(e){list.push({...row,available:false,unsupportedReason:e instanceof Error?e.message:'尚未准入 Survey'})}}
      else list.push(row.ref.kind!=='SCALE'&&row.available?{...row,available:false,unsupportedReason:'此原来源尚未经过系统三版本审批；请先在工具库审批中提交精确版本'}:row)
      continue}
    const snapshot=await getCatalogSourceSnapshot({actorUserId,ref:row.ref},prisma)
    const policy=await readToolPolicy(prisma,await snapshotPolicyIdentity(prisma,snapshot))
    const available=policy.decision==='APPROVED'&&!policy.paused
    list.push({...row,available,unsupportedReason:available?row.unsupportedReason:policy.paused?'Survey 新增分配和投放已暂停：'+policy.reason:'尚未通过 Survey 范围审批；请先在工具库审批中核对精确版本',surveyPolicy:policy,
     ...(snapshot.provenance.surveyStandardReleaseId?{configuration:{toolKey:snapshot.provenance.code,instrumentVersion:snapshot.provenance.standardInstrumentVersion,
      axes:snapshot.provenance.triplet,report:(snapshot.compiledDefinition as {report?:{reportVersion?:string}}).report?.reportVersion??null}}:{})})
  }
  // Display-only version labels, batched for this page. Do not add these fields
  // to the source snapshot/provenance: existing immutable grants must retain
  // their complete original adapter identity.
  const ids=list.flatMap(row=>'configuration'in row&&row.configuration?[row.ref.sourceId.slice('survey-standard:'.length)]:[])
  const versions=ids.length?await prisma.$queryRaw<Array<{id:string;hash:string;CONTENT:string;PARAMETERS:string;REPORT:string}>>(Prisma.sql`
    SELECT id,combination_hash AS hash,snapshot#>>'{parts,CONTENT,version}' AS "CONTENT",
      snapshot#>>'{parts,PARAMETERS,version}' AS "PARAMETERS",snapshot#>>'{parts,REPORT,version}' AS "REPORT"
    FROM survey_standard_releases WHERE id=ANY(${ids}::text[])`):[]
  const labelled=list.map(row=>{
    if(!('configuration'in row)||!row.configuration)return row
    const header=versions.find(value=>row.ref.sourceId==='survey-standard:'+value.id&&row.ref.sourceVersion===value.hash)
    if(!header||!header.CONTENT||!header.PARAMETERS||!header.REPORT)return row
    return {...row,configuration:{...row.configuration,axisVersions:{CONTENT:header.CONTENT,PARAMETERS:header.PARAMETERS,REPORT:header.REPORT}}}
  })
  return {...result,list:labelled,pageSize:25,actorId:actorUserId}
}
async function target(tx:Tx,id:string){
  const rows=await tx.$queryRaw<{id:string}[]>`SELECT u.id FROM users u
    JOIN survey_researcher_grants g ON g.user_id=u.id JOIN survey_accounts a ON a.user_id=u.id
    WHERE u.id=${id} AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
    AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
    AND g.status IN ('ACTIVE','PENDING_MFA') FOR SHARE OF u,g`
  if(!rows.length)fail(404,'研究者不存在或资格不可用')
}
export async function grantCatalogSource(actorUserId:string,userId:string,ref:CatalogSourceRef,exact?:unknown){
  const precise=exact===undefined?null:surveyStandardUseInput.parse(exact)
  if(isSurveyCognitiveProfileRef(ref)){if(!precise)fail(400,'精确 profile 分配必须带原请求编号及业务配置名称');return grantSurveyCognitiveProfileSource(actorUserId,userId,ref,precise!)}
  if(precise&&(ref.kind!=='SCALE'||!/^survey-standard:[a-f0-9-]{36}$/.test(ref.sourceId)||ref.organizationId))fail(409,'固定配置授权须选择已批准的精确标准量表组合')
  return prisma.$transaction(async tx=>{
    const manager=await assertSurveyManager(tx,actorUserId);await target(tx,userId)
    if(isGovernedSource(ref.sourceId))await assertGovernedEntryAllowed(tx,ref.sourceId.slice(12),ref.sourceVersion)
    else if(ref.kind!=='SCALE')fail(409,'新的使用授权须选择已通过系统审批和自动试运行的精确工具版本')
    if(ref.kind==='SCALE'){
      const [source]=await tx.$queryRaw<Array<{instrument_class:string}>>`SELECT instrument_class::text FROM scales WHERE id=${ref.sourceId} FOR SHARE`
      if(source?.instrument_class==='CUSTOM_DESCRIPTIVE')fail(403,'自编量表新分配必须通过已批准的共用库精确版本；旧授权不能扩大')
    }
    const snapshot=await getCatalogSourceSnapshot({actorUserId,ref},tx)
    // Intake approval includes entry scope; ONLINE alone is not entry admission.
    if(!isGovernedSource(ref.sourceId))await assertSurveyToolPolicy(tx,await snapshotPolicyIdentity(tx,snapshot),true)
    if(precise){
      const source=await readCurrentStandardCombination(tx,{releaseId:ref.sourceId.slice('survey-standard:'.length),combinationHash:ref.sourceVersion})
      if(precise.replaces?.grantId===precise.requestId)fail(409,'新授权不能替换自身请求编号')
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-standard-use:'+precise.requestId}))`
      // One recipient/tool lock precedes any predecessor row lock. Opposing
      // replacements cannot acquire two uses in opposite order.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-standard-use-name:'+userId+':'+source.row.tool_key}))`
      let predecessor:Grant|undefined,supersedes:ReturnType<typeof readSurveyStandardSupersedes>=null
      if(precise.replaces){
        await assertNotTechnicalPackageGrant(tx,precise.replaces.grantId)
        ;[predecessor]=await tx.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"
          FROM survey_tool_grants WHERE id=${precise.replaces.grantId} AND user_id=${userId} AND created_by=${actorUserId} FOR UPDATE`
        if(!predecessor||canonicalHash(predecessor.snapshot)!==predecessor.snapshotDigest)return fail(409,'只能替换本人为同一研究者发行的可信原精确配置')
        const original=readSurveyStandardUse(predecessor),configuration=original?.binding.configuration
        if(!original||!configuration||configuration.kind!=='STANDARD_COMBINATION'||configuration.toolKey!==source.row.tool_key)return fail(409,'替换须保留同一工具和原精确授权身份')
        const priorSource=await readCurrentStandardCombination(tx,{releaseId:configuration.combinationId,combinationHash:configuration.combinationHash},'HISTORY')
        if(canonicalHash(standardConfigurationIdentity(priorSource))!==canonicalHash(configuration))fail(409,'前一配置与原精确来源不一致')
        supersedes={selectedBinding:selectedConfigurationPointer(original),reason:precise.replaces.reason}
      }
      const selected=sealSelectedConfigurationBinding({product:'SURVEY',configuration:standardConfigurationIdentity(source),authorization:{kind:'SURVEY_TOOL_USE',
       id:precise.requestId,revision:1,issuerId:actorUserId,recipientId:userId,organizationId:null,authority:[{kind:'ENTRY_ADMIN',id:manager.grantId,revision:manager.grantVersion}]}})
      const intent=canonicalHash({schemaVersion:1,actorUserId,userId,ref,...precise})
      snapshot.provenance={...snapshot.provenance,selectedBinding:selected,configurationName:precise.configurationName,configurationRequestIntentHash:intent,...(supersedes?{configurationSupersedes:supersedes}:{})}
      const digest=canonicalHash(snapshot)
      const prior=await tx.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt" FROM survey_tool_grants WHERE id=${precise.requestId} FOR SHARE`
      if(prior.length){
       const row=prior[0]
       if(row.createdBy!==actorUserId||row.userId!==userId||row.snapshotDigest!==digest||canonicalHash(row.snapshot)!==digest
        ||row.snapshot.provenance.configurationRequestIntentHash!==intent)fail(409,'原请求编号已用于不同研究配置、接收者或权限依据')
       return {...view(row),replayed:true}
      }
      if(predecessor&&predecessor.status!=='ACTIVE')fail(409,'原配置授权已撤销，请重新读取后明确选择后续修订')
      const duplicate=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM survey_tool_grants WHERE user_id=${userId} AND status='ACTIVE'
       AND snapshot#>>'{provenance,selectedBinding,binding,configuration,toolKey}'=${source.row.tool_key}
       AND snapshot#>>'{provenance,configurationName}'=${precise.configurationName} ${predecessor?Prisma.sql`AND id<>${predecessor.id}`:Prisma.empty} LIMIT 1`
      if(duplicate.length)fail(409,'同一工具已有此配置名称，请管理员使用不同业务名称或先撤销原授权')
      await assertSurveyManager(tx,actorUserId);await target(tx,userId)
      const rows=await tx.$queryRaw<Grant[]>`INSERT INTO survey_tool_grants(id,user_id,status,snapshot,snapshot_digest,created_by)
       VALUES(${precise.requestId},${userId},'ACTIVE',${JSON.stringify(snapshot)}::jsonb,${digest},${actorUserId})
       RETURNING id,user_id AS "userId",created_by AS "createdBy",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"`
      await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId,targetUserId:userId,action:'CATALOG_TOOL_GRANTED',
       metadata:{grantId:precise.requestId,source:ref,snapshotDigest:digest,selectedBinding:selected,configurationName:precise.configurationName,requestIntentHash:intent,selfGrant:actorUserId===userId,...(supersedes?{supersedes}:{})}}})
      if(predecessor&&supersedes){
        const changed=await tx.$queryRaw<Array<{id:string}>>`UPDATE survey_tool_grants SET status='REVOKED',revoked_at=statement_timestamp()
          WHERE id=${predecessor.id} AND status='ACTIVE' RETURNING id`
        if(changed.length!==1)fail(409,'原配置授权已变化，本次替换未保存')
        await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId,targetUserId:userId,action:'CATALOG_TOOL_CONFIGURATION_REPLACED',
          metadata:{previous:supersedes.selectedBinding,next:selectedConfigurationPointer(selected),reason:supersedes.reason,policy:'STOP_NEW_ADMISSION_AND_COLLECTION_KEEP_SAVED_DATA'}}})
      }
      return {...view(rows[0]),replayed:false}
    }
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
  const rows=await prisma.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,jsonb_build_object('title',snapshot->'title','ref',snapshot->'ref','provenance',jsonb_build_object('license',snapshot#>'{provenance,license}','reuseAuthority',snapshot#>'{provenance,reuseAuthority}','cognitiveProfile',snapshot#>'{provenance,cognitiveProfile}','selectedBinding',snapshot#>'{provenance,selectedBinding}','configurationName',snapshot#>'{provenance,configurationName}','triplet',snapshot#>'{provenance,triplet}','sourceMeasurementRelease',snapshot#>'{provenance,sourceMeasurementRelease}','surveyStandardReleaseId',snapshot#>'{provenance,surveyStandardReleaseId}','code',snapshot#>'{provenance,code}','standardInstrumentVersion',snapshot#>'{provenance,standardInstrumentVersion}'),
      'definitionDigest',snapshot->'definitionDigest','adapterVersion',snapshot->'adapterVersion') AS snapshot,snapshot_digest AS "snapshotDigest",
    created_at AS "createdAt",revoked_at AS "revokedAt" FROM survey_tool_grants WHERE user_id=${userId} AND NOT EXISTS(SELECT 1 FROM survey_package_members pm WHERE pm.technical_grant_id=survey_tool_grants.id)
    ORDER BY created_at DESC,id LIMIT 25 OFFSET ${(page-1)*25}`
  return {page,pageSize:25,list:rows.map(view)}
}
/** Own exact request readback remains possible after ordinary source/use
 * withdrawal. It does not confer access to researcher response data. */
export async function readExactToolGrantRequest(actorUserId:string,userId:string,requestId:string){
  surveyStandardUseInput.shape.requestId.parse(requestId)
  await assertSurveyManager(prisma,actorUserId)
  const [row]=await prisma.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"
    FROM survey_tool_grants WHERE id=${requestId} AND user_id=${userId} AND created_by=${actorUserId}
    AND NOT EXISTS(SELECT 1 FROM survey_package_members pm WHERE pm.technical_grant_id=survey_tool_grants.id)`
  if(!row)return null
  if(canonicalHash(row.snapshot)!==row.snapshotDigest||!readSurveyStandardUse(row))fail(409,'原请求缺少可信固定配置身份')
  const supersedes=readSurveyStandardSupersedes(row.snapshot.provenance.configurationSupersedes)
  const request={requestId:row.id,userId:row.userId,configurationName:row.snapshot.provenance.configurationName,source:row.snapshot.ref,
    ...(supersedes?{replaces:{grantId:supersedes.selectedBinding.authorizationId,expectedVersion:1,reason:supersedes.reason}}:{})}
  if(canonicalHash({schemaVersion:1,actorUserId,userId,ref:row.snapshot.ref,requestId:row.id,configurationName:request.configurationName,
    ...(request.replaces?{replaces:request.replaces}:{})})!==row.snapshot.provenance.configurationRequestIntentHash)fail(409,'原授权完整意图摘要不匹配')
  return {grant:view(row),request}
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
    readSurveyStandardUse(row)
    map.set(row.id,row.snapshot)
  }
  if(map.size!==new Set(ids).size)fail(403,'工具来源不属于当前研究者授权')
  if(active){
    for(const row of rows){await assertSurveyToolPolicy(tx,await snapshotPolicyIdentity(tx,row.snapshot),false);const entryId=row.snapshot.provenance.libraryEntryId
      if(typeof entryId==='string')await assertLibraryUseGrantCurrent(tx,{entryId,userId,product:'SURVEY'})
    }
    await assertCatalogSourcesCurrent(rows.filter(r=>typeof r.snapshot.provenance.libraryEntryId!=='string'&&!r.snapshot.provenance.packageBindingIdentity).map(r=>({snapshot:surveyStandardSourceForRecheck(r),actorUserId:r.createdBy})),tx)
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
  if(active)await assertSurveyStandardUseAuthority(tx,rows)
  const resolved=await packageBoundCatalogSnapshots(tx,userId,map,active)
  for(const [key,snapshot] of resolved)if(isSurveyCognitiveProfileRef(snapshot.ref))resolved.set(key,await hydrateSurveyCognitiveProfileSource(tx,snapshot))
  return resolved
}
export function compileCatalogUnit(draft:{id:string;instrumentKey:string;kind:string;title:string;revision:number;definition:unknown;catalogGrantId?:string|null},snapshot:CatalogSnapshot):ResearchFrozenUnit{
  const packageBinding=snapshot.provenance.surveyPackage as {draftId:string}|undefined
  if(packageBinding&&packageBinding.draftId!==draft.id)fail(403,'整包组件不能拆出复制或重新导入')
  if(draft.kind!==snapshot.ref.kind||canonicalHash(draft.definition)!==canonicalHash(snapshot.displayDefinition))
    fail(409,'只读来源工具的定义已经变化')
  return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind:snapshot.ref.kind,title:draft.title,
    draftRevision:draft.revision,sourceDigest:snapshot.definitionDigest,scoringDigest:snapshot.scoringDigest,
    compiledDefinition:snapshot.compiledDefinition,displayDefinition:snapshot.displayDefinition,
    ...(snapshot.instruction?{instruction:snapshot.instruction}:{}),
    ...(snapshot.nativeSituational?{executionProtocol:snapshot.nativeSituational.protocol,
      nativeSituational:snapshot.nativeSituational}:{}),
    sourceProvenance:{...snapshot.provenance,...(draft.catalogGrantId?{sourceGrantId:draft.catalogGrantId}:{}),originalSource:snapshot.provenance.source??null,source:snapshot.ref,definitionDigest:snapshot.definitionDigest,
      adapterVersion:snapshot.adapterVersion},...(snapshot.answerMapping?{sourceAnswerMapping:snapshot.answerMapping}:{})}
}
export async function researcherCatalog(tx:Tx,userId:string,page:number,filters:CatalogDiscoveryFilters={}){
  const records=catalogDiscoveryRecords()
  const [catalog]=await tx.$queryRaw<Array<{list:Array<Grant&{classification_tags:CatalogClassificationTag[]}>;facetTags:CatalogClassificationTag[]}>>(discoveryPageSql({source:Prisma.sql`SELECT discovery.ids,discovery.terms,discovery.tags AS classification_tags,g.id,g.created_by AS "createdBy",user_id AS "userId",status,jsonb_build_object('title',snapshot->'title','ref',snapshot->'ref','provenance',jsonb_build_object('license',snapshot#>'{provenance,license}','reuseAuthority',snapshot#>'{provenance,reuseAuthority}','cognitiveProfile',snapshot#>'{provenance,cognitiveProfile}','selectedBinding',snapshot#>'{provenance,selectedBinding}','configurationName',snapshot#>'{provenance,configurationName}','triplet',snapshot#>'{provenance,triplet}','sourceMeasurementRelease',snapshot#>'{provenance,sourceMeasurementRelease}','surveyStandardReleaseId',snapshot#>'{provenance,surveyStandardReleaseId}','code',snapshot#>'{provenance,code}','standardInstrumentVersion',snapshot#>'{provenance,standardInstrumentVersion}'),
      'definitionDigest',snapshot->'definitionDigest','adapterVersion',snapshot->'adapterVersion') AS snapshot,snapshot_digest AS "snapshotDigest",
    created_at AS "createdAt",revoked_at AS "revokedAt" FROM survey_tool_grants g ${standardDiscoveryMetadataJoin(Prisma.sql`g.snapshot#>>'{provenance,code}'`,Prisma.sql`COALESCE(g.snapshot#>>'{provenance,standardInstrumentVersion}',g.snapshot#>>'{ref,sourceVersion}')`,Prisma.sql`g.snapshot#>>'{ref,kind}'`)} ${discoveryJoin(records,{kind:Prisma.sql`g.snapshot#>>'{ref,kind}'`,metadata:Prisma.sql`imported_discovery_source.metadata`,locale:Prisma.sql`imported_discovery_source.locale`,key:Prisma.sql`CASE WHEN g.snapshot#>>'{ref,kind}'='SCALE' THEN g.snapshot#>>'{provenance,code}' ELSE COALESCE(g.snapshot#>>'{compiledDefinition,sessionSnapshot,testType}',g.snapshot#>>'{provenance,cognitiveProfile,configuration,testType}') END`,version:Prisma.sql`COALESCE(g.snapshot#>>'{provenance,standardInstrumentVersion}',g.snapshot#>>'{ref,sourceVersion}')`,engine:Prisma.sql`COALESCE(g.snapshot#>>'{compiledDefinition,sessionSnapshot,engineVersion}',g.snapshot#>>'{provenance,cognitiveProfile,configuration,engineVersion}')`,scoring:Prisma.sql`COALESCE(g.snapshot#>>'{compiledDefinition,sessionSnapshot,scoringVersion}',g.snapshot#>>'{provenance,cognitiveProfile,configuration,scoringVersion}')`},Prisma.sql`${jsonTagIds(Prisma.sql`g.snapshot#>'{provenance,toolReference,metadata,tags}'`)} || CASE WHEN g.snapshot#>>'{ref,kind}'='SJT' THEN ${sjtMetadataTagIds(Prisma.sql`g.snapshot->'compiledDefinition'`)} ELSE '[]'::jsonb END`)}
    WHERE user_id=${userId} AND status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM survey_package_members pm WHERE pm.technical_grant_id=g.id) `,filters,text:[Prisma.sql`v.snapshot->>'title'`,Prisma.sql`v.snapshot#>>'{provenance,configurationName}'`],order:Prisma.sql`v."createdAt" DESC,v.id`,limit:26,offset:(page-1)*25,tagColumn:Prisma.sql`v.classification_tags`}))
  const rows=catalog.list
  return {page,pageSize:25,hasMore:rows.length>25,tagFacets:catalogTagFacets([catalog.facetTags]),list:rows.slice(0,25).map(row=>({...view(row),classificationTags:row.classification_tags}))}
}

/** Same immutable SurveyToolGrant path, explicit native profile identity. No
 * Training permission, new ledger or technical choice by the researcher. */
async function grantSurveyCognitiveProfileSource(actorUserId:string,userId:string,ref:CatalogSourceRef,input:ReturnType<typeof surveyStandardUseInput.parse>){
 const source=parseSurveyCognitiveProfileRef(ref),intent=canonicalHash({schemaVersion:1,actorUserId,userId,ref,...input})
 if(input.replaces?.grantId===input.requestId)fail(409,'新修订不能替换自身请求编号')
 return prisma.$transaction(async tx=>{
  const manager=await assertSurveyManager(tx,actorUserId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-profile-request:'+input.requestId}))`
  const [prior]=await tx.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"
   FROM survey_tool_grants WHERE id=${input.requestId} FOR SHARE`
  if(prior){
   if(prior.createdBy!==actorUserId||prior.userId!==userId||canonicalHash(prior.snapshot)!==prior.snapshotDigest||!readSurveyStandardUse(prior)
    ||prior.snapshot.provenance.configurationRequestIntentHash!==intent)fail(409,'原请求编号已用于其他 profile、接收者或完整意图')
   return {...view(prior),replayed:true}
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'survey-profile-recipient:'+userId+':'+source.configId}))`
  await target(tx,userId)
  const snapshot=await readSurveyCognitiveProfileSource(tx,ref)
  const active=await tx.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"
   FROM survey_tool_grants WHERE user_id=${userId} AND status='ACTIVE'
    AND (snapshot#>>'{provenance,selectedBinding,binding,configuration,configId}'=${source.configId} OR snapshot#>>'{ref,sourceId}'=${source.configId}) ORDER BY id LIMIT 2 FOR UPDATE`
  if(active.length>1)fail(409,'同工具存在多个原使用配置，请管理员先明确处理')
  if(active.some(row=>row.createdBy!==actorUserId))fail(403,'不能接管另一发行者的认知使用配置')
  if(active.length&&input.replaces?.grantId!==active[0].id)fail(409,'请明确原授权修订和替换原因；旧来源不静默升级')
  let supersedes:ReturnType<typeof readSurveyStandardSupersedes>=null
  if(input.replaces){
   const [previous]=await tx.$queryRaw<Grant[]>`SELECT id,created_by AS "createdBy",user_id AS "userId",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"
    FROM survey_tool_grants WHERE id=${input.replaces.grantId} FOR UPDATE`
   if(!previous||previous.userId!==userId||previous.createdBy!==actorUserId||previous.status!=='ACTIVE'||canonicalHash(previous.snapshot)!==previous.snapshotDigest)fail(409,'原配置已经失效或不属于本次替换身份')
   const selected=readSurveyStandardUse(previous),c=selected?.binding.configuration
   if(!selected||c?.kind!=='COGNITIVE_PROFILE'||c.configId!==source.configId)fail(409,'旧来源不具备同工具的精确 profile 证据，请明确撤销后再分配')
   supersedes={selectedBinding:selectedConfigurationPointer(selected!),reason:input.replaces.reason}
  }
  const configuration=(snapshot.provenance.cognitiveProfile as {configuration:unknown}).configuration as Parameters<typeof sealSelectedConfigurationBinding>[0]['configuration']
  const selected=sealSelectedConfigurationBinding({product:'SURVEY',configuration,authorization:{kind:'COGNITIVE_PROFILE_USE',id:input.requestId,revision:1,issuerId:actorUserId,recipientId:userId,organizationId:null,
   authority:[{kind:'ENTRY_ADMIN',id:manager.grantId,revision:manager.grantVersion}]}})
  snapshot.provenance={...snapshot.provenance,selectedBinding:selected,configurationName:input.configurationName,configurationRequestIntentHash:intent,...(supersedes?{configurationSupersedes:supersedes}:{})}
  const digest=canonicalHash(snapshot)
  const [row]=await tx.$queryRaw<Grant[]>`INSERT INTO survey_tool_grants(id,user_id,status,snapshot,snapshot_digest,created_by)
   VALUES(${input.requestId},${userId},'ACTIVE',${JSON.stringify(snapshot)}::jsonb,${digest},${actorUserId})
   RETURNING id,user_id AS "userId",created_by AS "createdBy",status,snapshot,snapshot_digest AS "snapshotDigest",created_at AS "createdAt",revoked_at AS "revokedAt"`
  await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId,targetUserId:userId,action:'CATALOG_TOOL_GRANTED',metadata:{grantId:input.requestId,source:ref,snapshotDigest:digest,selectedBinding:selected,
   configurationName:input.configurationName,requestIntentHash:intent,selfGrant:actorUserId===userId,...(supersedes?{supersedes}:{})}}})
  if(supersedes){
   const changed=await tx.$executeRaw`UPDATE survey_tool_grants SET status='REVOKED',revoked_at=clock_timestamp() WHERE id=${supersedes.selectedBinding.authorizationId} AND status='ACTIVE'`
   if(changed!==1)fail(409,'原配置已变化，本次替换没有保存')
   await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId,targetUserId:userId,action:'CATALOG_TOOL_CONFIGURATION_REPLACED',metadata:{previous:supersedes.selectedBinding,next:selectedConfigurationPointer(selected),reason:supersedes.reason,policy:'STOP_NEW_ADMISSION_AND_COLLECTION_KEEP_SAVED_DATA'}}})
  }
  return {...view(row),replayed:false}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000})
}
/** Selected configuration preview only; no grant, trial or participant data. */
export async function previewSurveyCognitiveProfileSource(actorUserId:string,ref:CatalogSourceRef){
 return prisma.$transaction(async tx=>{
  await assertSurveyManager(tx,actorUserId)
  const source=await readSurveyCognitiveProfileSource(tx,ref),snapshot=await hydrateSurveyCognitiveProfileSource(tx,source)
  const frozen=(await import('./cognitive.definition')).parseFrozenSurveyCognitive(snapshot.compiledDefinition)
  if(frozen.schemaVersion!==2)return fail(409,'所选来源不是精确 profile')
  const report=frozen.artifact.resolvedReport
  return {source:ref,artifactHash:frozen.artifactHash,profile:frozen.artifact.identity.profile,reportStyle:{title:report.reportDefinition.title,
   caveats:report.reportCaveats,disclaimer:report.reportDefinition.disclaimer,
   headline:report.reportDefinition.primaryMetrics.map(key=>({key,label:report.metricDefinitions[key]?.label??key})),
   detail:report.reportDefinition.secondaryMetrics.map(key=>({key,label:report.metricDefinitions[key]?.label??key}))}}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000})
}
