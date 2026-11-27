import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError,assertEntryAdmin} from '../admin-permissions/service'
import {type AdminSessionProof,validAdminProof,ADMIN_STEP_UP_SECONDS} from '../admin-permissions/proof'
import {canonicalHash} from '../assessment-runtime/canonical'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {eligibleStandards} from './eligible-standard'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {educationPublicSourceKey} from '../education-tools/public-source.identity'
import {readCurrentStandardCombination} from './standard-combination-source'
import {issueAdminContentRoot,issueAdminStandardCombinationRoot,revokeAdminContentGrant,lockCurrentContentSystemActor,recheckContentSystemActorAfterWait} from './admin-authority.service'

type Tx=Prisma.TransactionClient
const id=z.string().guid(),productSchema=z.enum(['SCHOOL','TEACHER']),digest=z.string().regex(/^[a-f0-9]{64}$/)
type Product=z.infer<typeof productSchema>
const page=z.coerce.number().int().min(1).max(10000).default(1),search=z.string().trim().max(120).default('')
export const standardDelegationQuery=z.object({product:productSchema,schoolQuery:search,adminQuery:search,schoolPage:page,adminPage:page,page}).strict()
export const standardDelegationInput=z.object({product:productSchema,schoolId:id,adminId:id,startsAt:z.string().datetime(),expiresAt:z.string().datetime(),
 reason:z.string().trim().min(1).max(500),requestId:id,coverageDigest:digest,scope:z.enum(['MEASUREMENT','COMBINATION']).default('MEASUREMENT')}).strict()
export const standardDelegationRevoke=z.object({expectedVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(500)}).strict()
type Anchor={id:string;measurementReleaseId:string|null;combinationHash:string}
type Combination={id:string;title:string;toolKey:string;instrumentVersion:string;contentVersion:string;parametersVersion:string;reportVersion:string;
 combinationHash:string;nativeId:string}
const SIZE=25,MAX_COVER=128
function denied(message:string):never{throw new AdminPermissionError(403,message)}
function conflict(message:string):never{throw new AdminPermissionError(409,message)}
function strong(proof:AdminSessionProof){if(!validAdminProof(proof,ADMIN_STEP_UP_SECONDS))denied('委托操作需要最近的管理员双因素验证')}
async function anchor(tx:Pick<Tx,'$queryRaw'>,releaseId:string){
 const [row]=await tx.$queryRaw<Anchor[]>(Prisma.sql`SELECT id,measurement_release->>'releaseId' AS "measurementReleaseId",combination_hash AS "combinationHash"
  FROM survey_standard_releases WHERE id=${releaseId}`)
 if(!row)throw new AdminPermissionError(404,'标准量表组合不存在')
 if(!id.safeParse(row.measurementReleaseId).success)conflict('当前组合尚无精确测量发布，不能签发委托')
 if(!digest.safeParse(row.combinationHash).success)conflict('当前组合缺少精确身份')
 return {...row,measurementReleaseId:row.measurementReleaseId!,
  combinationResourceKey:educationPublicSourceKey({kind:'STANDARD_SCALE',id:row.id,hash:row.combinationHash})}
}

/** Full, bounded current coverage of one immutable C release. The delegation
 * remains measurement-scoped: later approved P/R combinations can join it.
 * This digest confirms today's cover; it does not invent a version lock. */
export async function readStandardDelegationCoverage(tx:Tx,releaseId:string,product:Product){
 const source=await anchor(tx,releaseId)
 const available=await tx.$queryRaw<Combination[]>(Prisma.sql`SELECT s.id,COALESCE(s.snapshot->>'title',s.tool_key) AS title,s.tool_key AS "toolKey",
  s.snapshot->>'instrumentVersion' AS "instrumentVersion",s.snapshot#>>'{parts,CONTENT,version}' AS "contentVersion",
  s.snapshot#>>'{parts,PARAMETERS,version}' AS "parametersVersion",s.snapshot#>>'{parts,REPORT,version}' AS "reportVersion",
  s.combination_hash AS "combinationHash",native.id AS "nativeId"
  ${eligibleStandards(product)} AND s.measurement_release->>'releaseId'=${source.measurementReleaseId}
  ORDER BY s.id LIMIT ${MAX_COVER+1}`)
 if(available.length>MAX_COVER)conflict('当前测量版本覆盖的组合超过安全展示上限，请先整理版本后操作')
 const coverageDigest=canonicalHash({schemaVersion:1,product,releaseId,measurementReleaseId:source.measurementReleaseId,
  combinations:available.map(row=>({id:row.id,hash:row.combinationHash}))})
 const exact=available.find(row=>row.id===releaseId&&row.combinationHash===source.combinationHash)
 const combinationCoverageDigest=exact?canonicalHash({schemaVersion:1,scope:'COMBINATION',product,measurementReleaseId:source.measurementReleaseId,
  resourceKey:source.combinationResourceKey}):null
 return {measurementReleaseId:source.measurementReleaseId,coverageDigest,assignable:Boolean(exact),
  combinationResourceKey:source.combinationResourceKey,combinationCoverageDigest,
  combinations:available.map(({id:combinationId,title,instrumentVersion,contentVersion,parametersVersion,reportVersion})=>({id:combinationId,title,instrumentVersion,contentVersion,parametersVersion,reportVersion})),
  identities:available}
}
const rootScope=(measurementId:string,exactKey:string,product:Product)=>Prisma.sql`g.product=${product} AND g.scope_kind='ORGANIZATION' AND g.resource_kind='material'
 AND (g.resource_keys=ARRAY[${measurementId}]::text[] OR g.resource_keys=ARRAY[${exactKey}]::text[]) AND g.capabilities=ARRAY['material.distribute']::text[]
 AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[] AND g.delegable_capabilities=ARRAY[]::text[] AND g.remaining_delegation_depth=0`

export async function readStandardDelegations(actorId:string,proof:AdminSessionProof,rawReleaseId:string,raw:unknown){
 const releaseId=id.parse(rawReleaseId),input=standardDelegationQuery.parse(raw);strong(proof)
 return prisma.$transaction(async tx=>{
  const {users}=await lockCurrentContentSystemActor(tx,actorId,proof)
  const current=await readStandardDelegationCoverage(tx,releaseId,input.product)
  const [schools,administrators,records]=await Promise.all([
   tx.$queryRaw<Array<{id:string;label:string;detail:string}>>(Prisma.sql`SELECT o.id,o.name AS label,${input.product==='SCHOOL'?'School 已开通':'Teacher 已开通'}::text AS detail
    FROM organizations o WHERE o.product_domain='SCHOOL' AND o.status='ACTIVE'
     AND EXISTS(SELECT 1 FROM education_product_entitlements e WHERE e.organization_id=o.id AND e.product=${input.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'} AND e.status='ACTIVE')
     AND (${input.schoolQuery}='' OR strpos(lower(o.name),lower(${input.schoolQuery}))>0)
    ORDER BY o.name COLLATE "C",o.id LIMIT ${SIZE+1} OFFSET ${(input.schoolPage-1)*SIZE}`),
   tx.$queryRaw<Array<{id:string;label:string;detail:string}>>(Prisma.sql`SELECT u.id,u.username AS label,COALESCE(NULLIF(u.nickname,''),u.username) AS detail
    FROM users u JOIN admin_entry_grants e ON e.user_id=u.id AND e.entry=${input.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'} AND e.revoked_at IS NULL
    WHERE u.platform_role='STANDARD' AND u.account_domain IN ('TRAINING','LEGACY') AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
     AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
     AND (${input.adminQuery}='' OR strpos(lower(u.username),lower(${input.adminQuery}))>0 OR strpos(lower(COALESCE(u.nickname,'')),lower(${input.adminQuery}))>0)
    ORDER BY u.username COLLATE "C",u.id LIMIT ${SIZE+1} OFFSET ${(input.adminPage-1)*SIZE}`),
   tx.$queryRaw<Array<{id:string;version:number;product:Product;schoolName:string;adminName:string;startsAt:Date;expiresAt:Date;revokedAt:Date|null;
    scope:'MEASUREMENT'|'COMBINATION';status:'SCHEDULED'|'ACTIVE'|'EXPIRED'|'REVOKED';reason:string|null}>>(Prisma.sql`SELECT g.id,g.version,g.product,
    COALESCE(o.name,'已不可用的学校') AS "schoolName",COALESCE(u.username,'已不可用的管理员') AS "adminName",
    g.valid_from AT TIME ZONE 'UTC' AS "startsAt",g.expires_at AT TIME ZONE 'UTC' AS "expiresAt",g.revoked_at AT TIME ZONE 'UTC' AS "revokedAt",
    CASE WHEN g.resource_keys=ARRAY[${current.combinationResourceKey}]::text[] THEN 'COMBINATION' ELSE 'MEASUREMENT' END AS scope,
    CASE WHEN g.revoked_at IS NOT NULL THEN 'REVOKED' WHEN g.expires_at<=clock_timestamp() AT TIME ZONE 'UTC' THEN 'EXPIRED'
     WHEN g.valid_from>clock_timestamp() AT TIME ZONE 'UTC' THEN 'SCHEDULED' ELSE 'ACTIVE' END AS status,a.reason
    FROM content_capability_grants g LEFT JOIN organizations o ON o.id=g.scope_id LEFT JOIN users u ON u.id=g.subject_id
     LEFT JOIN admin_authorization_audits a ON a.id=g.id AND a.action='CONTENT_ROOT_GRANTED'
    WHERE ${rootScope(current.measurementReleaseId,current.combinationResourceKey,input.product)} ORDER BY g.created_at DESC,g.id LIMIT ${SIZE+1} OFFSET ${(input.page-1)*SIZE}`),
  ])
  await recheckContentSystemActorAfterWait(tx,proof,users)
  const {identities:_,...cover}=current
  return {cover,schools:schools.slice(0,SIZE),administrators:administrators.slice(0,SIZE),records:records.slice(0,SIZE),
   moreSchools:schools.length>SIZE,moreAdministrators:administrators.length>SIZE,moreRecords:records.length>SIZE}
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000})
}

export async function issueStandardDelegation(actorId:string,proof:AdminSessionProof,rawReleaseId:string,raw:unknown){
 const releaseId=id.parse(rawReleaseId),input=standardDelegationInput.parse(raw);strong(proof)
 const source=await anchor(prisma,releaseId)
 const exactScope=input.scope==='COMBINATION',issue=exactScope?issueAdminStandardCombinationRoot:issueAdminContentRoot
 return issue(actorId,proof,{requestId:input.requestId,expectedVersion:0,reason:input.reason,grant:{
  subjectId:input.adminId,scope:{product:input.product,scopeKind:'ORGANIZATION',scopeId:input.schoolId,resourceKind:'material',
   resourceKeys:[exactScope?source.combinationResourceKey:source.measurementReleaseId]},
  capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:input.startsAt,expiresAt:input.expiresAt,
 }},async tx=>{
  // This named manager picker is narrower than the legacy content-root API,
  // which also supports school business actors and system-owned distribution.
  await assertEntryAdmin(tx,input.adminId,input.product==='SCHOOL'?'HUISCHOOL':'HUITEACHER')
  const current=await readStandardDelegationCoverage(tx,releaseId,input.product)
  if(!current.assignable)conflict('当前组合未获本入口准入或已停止新增分配，不能签发委托')
  if(current.measurementReleaseId!==source.measurementReleaseId||current.combinationResourceKey!==source.combinationResourceKey
   ||(exactScope?current.combinationCoverageDigest:current.coverageDigest)!==input.coverageDigest)
   conflict('当前可分发组合覆盖已变化，请刷新并重新确认后签发')
  const selected=current.identities.find(row=>row.id===releaseId)!
  const exact=await readCurrentStandardCombination(tx,{releaseId,combinationHash:selected.combinationHash})
  if(exact.measurement.releaseId!==source.measurementReleaseId)conflict('精确测量来源已变化，请刷新后重试')
  await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+releaseId,fingerprint:selected.combinationHash},input.product)
  await assertScaleLibraryCollectionAllowed(tx,[source.measurementReleaseId],[selected.nativeId])
 })
}

/** Historical withdrawal is bound to this exact combination or its immutable
 * measurement release, even after the anchor and entry become unavailable. */
export async function revokeStandardDelegation(actorId:string,proof:AdminSessionProof,rawReleaseId:string,rawGrantId:string,raw:unknown){
 const releaseId=id.parse(rawReleaseId),grantId=id.parse(rawGrantId),input=standardDelegationRevoke.parse(raw);strong(proof)
 return revokeAdminContentGrant(actorId,proof,grantId,input,async(tx,grant)=>{
  const source=await anchor(tx,releaseId)
  if(!productSchema.safeParse(grant.product).success||grant.scope_kind!=='ORGANIZATION'||grant.resource_kind!=='material'||grant.parent_grant_id
   ||grant.resource_keys.length!==1||![source.measurementReleaseId,source.combinationResourceKey].includes(grant.resource_keys[0])
   ||canonicalHash(grant.capabilities)!==canonicalHash(['material.distribute'])
   ||grant.delegable_capabilities.length||grant.remaining_delegation_depth!==0)
   denied('该委托不属于本测量版本的单一学校分发范围，请从原精确内容授权入口处理')
 })
}
