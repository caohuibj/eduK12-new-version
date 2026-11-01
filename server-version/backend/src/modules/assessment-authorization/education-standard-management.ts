import {catalogDiscoveryRecords,importedStandardDiscoveryRecords,discoveryJoin,discoverySqlFilter,discoveryFacets} from '../survey/catalog-discovery'
import {catalogDiscoveryQueryFields,type CatalogClassificationTag} from '../scale/library/catalog-discovery'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError,assertEntryAdmin} from '../admin-permissions/service'
import {libraryActor} from '../scale-library-governance/authority'
import {readCurrentStandardCombination} from '../measurement-content/standard-combination-source'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {EDUCATION_STANDARD_USE_ACTION,EDUCATION_STANDARD_REVOKE_ACTION,educationStandardUseMetadata,readEducationStandardUseBinding,type EducationConfigurationScope} from './education-standard-use'
import {selectedConfigurationPointer} from './standard-configuration-binding'
import {readSelectedConfigurationBinding} from './selected-configuration'
import {listEducationAuthoringMemberCandidates} from '../organization/educationProductAccess'

const id=z.string().guid(),query=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),q:z.string().trim().max(120).default('')}).strict()
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000}
export async function assertEducationConfigurationManager(tx:Prisma.TransactionClient,actorId:string,scope:EducationConfigurationScope){
 id.parse(scope.organizationId)
 if(!['SCHOOL','TEACHER'].includes(scope.product))throw new AdminPermissionError(403,'教育入口不合法')
 const actor=await libraryActor(tx,actorId)
 if(actor.systemAdmin||!['TRAINING','LEGACY'].includes(actor.account_domain))throw new AdminPermissionError(403,'需要独立的教育入口管理身份')
 await assertEntryAdmin(tx,actorId,scope.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER')
}
export const educationConfigurationDistributionRoots=(actorId:string,scope:EducationConfigurationScope,measurement:Prisma.Sql)=>Prisma.sql`
 SELECT g.id,g.version,g.valid_from,g.expires_at FROM content_capability_grants g
 WHERE g.subject_id=${actorId} AND g.product=${scope.product} AND g.scope_kind='ORGANIZATION' AND g.scope_id=${scope.organizationId}
  AND g.resource_kind='material' AND g.resource_keys@>ARRAY[${measurement}]::text[] AND g.capabilities=ARRAY['material.distribute']::text[]
  AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[] AND g.delegable_capabilities=ARRAY[]::text[] AND g.remaining_delegation_depth=0
  AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AT TIME ZONE 'UTC' AND g.expires_at>clock_timestamp() AT TIME ZONE 'UTC'`

/** Bounded management headers. Historical own issuances stay readable for
 * reconciliation/revocation; they never make an unavailable source assignable. */
export async function educationStandardManagementCatalog(actorId:string,scope:EducationConfigurationScope,raw:unknown){
 const input=query.extend(catalogDiscoveryQueryFields).parse(raw),size=25
 return prisma.$transaction(async tx=>{
  await assertEducationConfigurationManager(tx,actorId,scope)
  const records=[...catalogDiscoveryRecords(),...await importedStandardDiscoveryRecords(tx)]
  const rows=await tx.$queryRaw<Array<{id:string;title:string;toolKey:string;instrumentVersion:string;combinationHash:string;state:string;
   contentVersion:string;parametersVersion:string;reportVersion:string;approved:boolean;nativeStatus:string|null;measurementId:string|null;measurementAvailable:boolean;organizationAvailable:boolean;
   authorities:Array<{id:string;version:number;validFrom:string;expiresAt:string}>;classificationTags:CatalogClassificationTag[]}>>(Prisma.sql`
   SELECT COALESCE(discovery.tags,'[]'::jsonb) AS "classificationTags",s.id,s.snapshot->>'title' AS title,s.tool_key AS "toolKey",s.snapshot->>'instrumentVersion' AS "instrumentVersion",s.combination_hash AS "combinationHash",s.state,
    s.snapshot#>>'{parts,CONTENT,version}' AS "contentVersion",s.snapshot#>>'{parts,PARAMETERS,version}' AS "parametersVersion",s.snapshot#>>'{parts,REPORT,version}' AS "reportVersion",
    COALESCE(p.decision='APPROVED' AND NOT p.paused,false) AS approved,native.status::text AS "nativeStatus",s.measurement_release->>'releaseId' AS "measurementId",
    COALESCE(m.layer='MEASUREMENT' AND m.family='SCALE' AND m.status='PUBLISHED' AND m.content_hash=s.measurement_release->>'contentHash',false) AS "measurementAvailable",
    EXISTS(SELECT 1 FROM organizations o JOIN education_product_entitlements ent ON ent.organization_id=o.id
     AND ent.product=${scope.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'} AND ent.status='ACTIVE' WHERE o.id=${scope.organizationId} AND o.product_domain='SCHOOL' AND o.status='ACTIVE') AS "organizationAvailable",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'validFrom',r.valid_from AT TIME ZONE 'UTC','expiresAt',r.expires_at AT TIME ZONE 'UTC'))
     FROM (${educationConfigurationDistributionRoots(actorId,scope,Prisma.sql`s.measurement_release->>'releaseId'`)} ORDER BY g.id LIMIT 129) r),'[]'::jsonb) AS authorities
   FROM survey_standard_releases s LEFT JOIN survey_tool_policies p ON p.product=${scope.product} AND p.resource_key='standard-release:'||s.id AND p.fingerprint=s.combination_hash
   LEFT JOIN measurement_content_releases m ON m.id=s.measurement_release->>'releaseId'
   LEFT JOIN scales native ON native.code=s.tool_key AND native.instrument_version=s.snapshot->>'instrumentVersion' AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL
   ${discoveryJoin(records,{kind:Prisma.sql`'SCALE'`,key:Prisma.sql`s.tool_key`,version:Prisma.sql`s.snapshot->>'instrumentVersion'`,engine:Prisma.sql`NULL`,scoring:Prisma.sql`NULL`})}
   WHERE (EXISTS(${educationConfigurationDistributionRoots(actorId,scope,Prisma.sql`s.measurement_release->>'releaseId'`)}) OR EXISTS(
    SELECT 1 FROM content_capability_grants own JOIN assessment_management_events e ON e.id=own.id AND e.action=${EDUCATION_STANDARD_USE_ACTION}
    WHERE own.issuer_id=${actorId} AND own.product=${scope.product} AND own.scope_kind='ORGANIZATION' AND own.scope_id=${scope.organizationId} AND e.resource_id=s.id))
    AND ${discoverySqlFilter([Prisma.sql`s.snapshot->>'title'`,Prisma.sql`s.tool_key`],{...input,keyword:[input.q,input.keyword].filter(Boolean).join(' ')})}
   ORDER BY s.tool_key,s.created_at,s.id LIMIT ${size+1} OFFSET ${(input.page-1)*size}`)
  return {page:input.page,hasMore:rows.length>size,tagFacets:discoveryFacets(records,'SCALE'),list:rows.slice(0,size).map(row=>({
   id:row.id,title:row.title,toolKey:row.toolKey,classificationTags:row.classificationTags,instrumentVersion:row.instrumentVersion,combinationHash:row.combinationHash,
   versions:{CONTENT:row.contentVersion,PARAMETERS:row.parametersVersion,REPORT:row.reportVersion},authorities:row.authorities.length<=128?row.authorities:[],
   assignable:row.organizationAvailable&&row.state==='ONLINE'&&row.approved&&row.nativeStatus==='PUBLISHED'&&row.measurementAvailable&&row.authorities.length>0&&row.authorities.length<=128,
   unavailableReason:!row.organizationAvailable?'本校当前产品已暂停或尚未开通':row.state!=='ONLINE'?'该配置已停止新增使用':!row.approved?'该配置未获当前入口批准或已暂停':row.nativeStatus!=='PUBLISHED'?'原生量表尚未装载或发布':
    !row.measurementAvailable?'已批准测量版本不可用':!row.authorities.length?'当前缺少本校、本来源的精确分发委托':row.authorities.length>128?'精确分发委托过多，请整理后选择':null,
  }))}
 },options)
}

async function assertSelectable(tx:Prisma.TransactionClient,actorId:string,scope:EducationConfigurationScope,combinationId:string,combinationHash:string){
 await assertEducationConfigurationManager(tx,actorId,scope)
 const source=await readCurrentStandardCombination(tx,{releaseId:id.parse(combinationId),combinationHash})
 await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+combinationId,fingerprint:combinationHash},scope.product)
 const found=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`${educationConfigurationDistributionRoots(actorId,scope,Prisma.sql`${source.measurement.releaseId}`)} LIMIT 1`)
 if(!found.length)throw new AdminPermissionError(403,'缺少本校、本来源的精确分发委托')
 return source
}
export async function educationStandardManagementPreview(actorId:string,scope:EducationConfigurationScope,combinationId:string,combinationHash:string){
 return prisma.$transaction(async tx=>{
  const source=await assertSelectable(tx,actorId,scope,combinationId,z.string().regex(/^[a-f0-9]{64}$/).parse(combinationHash))
  return {title:source.row.snapshot.title,report:source.row.snapshot.definition.report,versions:Object.fromEntries(
   Object.entries(source.row.snapshot.parts).map(([axis,part])=>[axis,part.version])),previewOnly:true}
 },options)
}

export async function educationStandardManagementGrants(actorId:string,scope:EducationConfigurationScope,combinationId:string,raw:unknown){
 const input=z.object({page:query.shape.page,userId:id.optional(),requestId:id.optional()}).strict().parse(raw),size=100
 id.parse(combinationId)
 return prisma.$transaction(async tx=>{
  await assertEducationConfigurationManager(tx,actorId,scope)
  const rows=await tx.$queryRaw<Array<{id:string;userId:string;username:string;version:number;revokedAt:Date|null;validFrom:Date;expiresAt:Date;metadata:unknown}>>(Prisma.sql`
   SELECT g.id,g.subject_id AS "userId",u.username,g.version,g.revoked_at AS "revokedAt",g.valid_from AS "validFrom",g.expires_at AS "expiresAt",e.metadata
   FROM content_capability_grants g JOIN users u ON u.id=g.subject_id JOIN assessment_management_events e ON e.id=g.id AND e.action=${EDUCATION_STANDARD_USE_ACTION}
   WHERE g.issuer_id=${actorId} AND g.product=${scope.product} AND g.scope_kind='ORGANIZATION' AND g.scope_id=${scope.organizationId}
    AND e.actor_id=${actorId} AND e.resource_id=${combinationId} ${input.userId?Prisma.sql`AND g.subject_id=${input.userId}`:Prisma.empty}
    ${input.requestId?Prisma.sql`AND g.id=${input.requestId}`:Prisma.empty}
   ORDER BY g.created_at,g.id LIMIT ${size+1} OFFSET ${(input.page-1)*size}`)
  return {page:input.page,hasMore:rows.length>size,list:rows.slice(0,size).map(row=>{
   const metadata=educationStandardUseMetadata.parse(row.metadata),stored=readSelectedConfigurationBinding(metadata.selectedBinding)
   if(!stored)throw new AdminPermissionError(409,'精确配置审计身份不完整')
   const configuration=stored.binding.configuration,resourceKey=configuration.kind==='STANDARD_COMBINATION'?`education-source:STANDARD_SCALE:${combinationId}:${configuration.combinationHash}`:`education-source:COGNITIVE_PROFILE:${combinationId}:${metadata.artifactHash}`
   const selected=readEducationStandardUseBinding(row.metadata,{id:row.id,issuerId:actorId,recipientId:row.userId,scope,resourceKey})
   return {id:row.id,userId:row.userId,username:row.username,version:row.version,revokedAt:row.revokedAt,validFrom:row.validFrom,expiresAt:row.expiresAt,
    configurationName:metadata.configurationName??null,selectedBinding:selectedConfigurationPointer(selected),configuration:selected.binding.configuration,authority:selected.binding.authorization.authority,
    supersedes:metadata.supersedes??null,canManage:true}
  })}
 },options)
}

export async function educationStandardManagementRecipients(actorId:string,scope:EducationConfigurationScope,combinationId:string,combinationHash:string,raw:unknown){
 const input=query.parse(raw)
 return prisma.$transaction(async tx=>{
  await assertSelectable(tx,actorId,scope,combinationId,z.string().regex(/^[a-f0-9]{64}$/).parse(combinationHash))
  return listEducationAuthoringMemberCandidates({product:scope.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER',organizationId:scope.organizationId,...input},tx)
 },options)
}

/** Exact request readback, including after source/root withdrawal. A missing
 * request permits only the same idempotent request to be retried, never a
 * silent new request ID or a different target/configuration. */
export async function educationStandardManagementOperation(actorId:string,scope:EducationConfigurationScope,combinationId:string,requestId:string){
 id.parse(combinationId);id.parse(requestId)
 return prisma.$transaction(async tx=>{
  await assertEducationConfigurationManager(tx,actorId,scope)
  const [row]=await tx.$queryRaw<Array<{action:string;metadata:unknown;originalMetadata:unknown;grantId:string;userId:string;version:number;revokedAt:Date|null;validFrom:Date;expiresAt:Date;resourceKeys:string[]}>>(Prisma.sql`
   SELECT e.action,e.metadata,original.metadata AS "originalMetadata",g.id AS "grantId",g.subject_id AS "userId",g.version,g.revoked_at AS "revokedAt",
    g.valid_from AS "validFrom",g.expires_at AS "expiresAt",g.resource_keys AS "resourceKeys"
   FROM assessment_management_events e JOIN content_capability_grants g ON g.id=CASE WHEN e.action=${EDUCATION_STANDARD_USE_ACTION} THEN e.id ELSE e.metadata->>'grantId' END
   JOIN assessment_management_events original ON original.id=g.id AND original.action=${EDUCATION_STANDARD_USE_ACTION}
    AND original.actor_id=${actorId} AND original.resource_id=${combinationId}
   WHERE e.id=${requestId} AND e.actor_id=${actorId} AND e.resource_id=${combinationId} AND e.action IN (${EDUCATION_STANDARD_USE_ACTION},${EDUCATION_STANDARD_REVOKE_ACTION})
    AND g.issuer_id=${actorId} AND g.product=${scope.product} AND g.scope_kind='ORGANIZATION' AND g.scope_id=${scope.organizationId}
    AND g.resource_kind='material' AND g.capabilities=ARRAY['material.use']::text[] AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[]
    AND g.remaining_delegation_depth=0 AND g.delegable_capabilities=ARRAY[]::text[]`)
  if(!row)return null
  if(row.resourceKeys.length!==1)throw new AdminPermissionError(409,'原精确配置审计身份不完整')
  const original=educationStandardUseMetadata.parse(row.originalMetadata),selected=readEducationStandardUseBinding(row.originalMetadata,
   {id:row.grantId,issuerId:actorId,recipientId:row.userId,scope,resourceKey:row.resourceKeys[0]})
  const {configuration,authorization}=selected.binding
  if((configuration.kind==='STANDARD_COMBINATION'?configuration.combinationId:configuration.configId)!==combinationId)throw new AdminPermissionError(409,'原配置与请求来源不一致')
  const grant={id:row.grantId,version:row.version,revokedAt:row.revokedAt}
  if(row.action===EDUCATION_STANDARD_USE_ACTION)return {kind:'ISSUE' as const,grant,request:{requestId:row.grantId,userId:row.userId,
   ...(configuration.kind==='STANDARD_COMBINATION'?{combinationHash:configuration.combinationHash}:{artifactHash:original.artifactHash!,profile:configuration.profile}),authorityGrantId:authorization.authority[1].id,expectedAuthorityVersion:authorization.authority[1].revision,
   validFrom:row.validFrom.toISOString(),expiresAt:row.expiresAt.toISOString(),...(original.configurationName?{configurationName:original.configurationName}:{}),
   ...(original.supersedes?{replaces:{grantId:original.supersedes.selectedBinding.authorizationId,expectedVersion:original.supersedes.selectedBinding.authorizationRevision,reason:original.supersedes.reason}}:{})}}
  const revoked=z.object({schemaVersion:z.literal(1),grantId:id,requestIntentHash:z.string().regex(/^[a-f0-9]{64}$/),previousVersion:z.number().int().positive(),
   version:z.number().int().positive(),reason:z.string().min(1),scope:z.object({product:z.enum(['SCHOOL','TEACHER']),organizationId:id}).strict()}).strict().parse(row.metadata)
  if(revoked.grantId!==row.grantId||revoked.version!==revoked.previousVersion+1||row.version!==revoked.version||!row.revokedAt
   ||revoked.scope.product!==scope.product||revoked.scope.organizationId!==scope.organizationId)throw new AdminPermissionError(409,'撤销请求证据不完整')
  return {kind:'REVOKE' as const,grant,request:{requestId,expectedVersion:revoked.previousVersion,reason:revoked.reason}}
 },options)
}
