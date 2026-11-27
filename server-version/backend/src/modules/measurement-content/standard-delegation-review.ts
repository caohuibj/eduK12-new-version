import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {AdminPermissionError,assertEntryAdmin} from '../admin-permissions/service'
import type {AdminSessionProof} from '../admin-permissions/proof'
import {EDUCATION_STANDARD_USE_ACTION} from '../assessment-authorization/education-standard-use'
import {assertScaleLibraryCollectionAllowed} from '../scale-library-governance/collection-guard'
import {assertToolEntryPolicy} from '../assessment-governance/tool-entry-policy'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readCurrentStandardCombination} from './standard-combination-source'
import {readStandardDelegationCoverage} from './standard-delegations.service'
import {issueAdminContentRoot,issueAdminStandardCombinationRoot,lockCurrentContentSystemActor,
 recheckContentSystemActorAfterWait,revokeAdminContentGrant} from './admin-authority.service'

type Tx=Prisma.TransactionClient
type Product='SCHOOL'|'TEACHER'
type Status='SCHEDULED'|'ACTIVE'|'EXPIRED'|'REVOKED'
type Root={
 id:string;accountId:string;product:Product;schoolId:string;schoolName:string
 version:number;validFrom:Date;expiresAt:Date;status:Status;resourceKey:string
 releaseId:string;measurementId:string;title:string;exact:boolean
}
const uuid=z.string().guid()
const page=z.coerce.number().int().min(1).max(10000).default(1)
const reason=z.string().trim().min(1).max(400)
const digest=z.string().regex(/^[0-9a-f]{64}$/)
const version=z.number().int().positive()
const listQuery=z.object({page}).strict()
const detailQuery=z.object({successorGrantId:uuid.optional(),candidateQuery:z.string().trim().max(100).default(''),candidatePage:page,impactPage:page}).strict()
const transferInput=z.object({requestId:uuid,successorId:uuid,expectedVersion:version,reason}).strict()
const withdrawalInput=z.object({expectedVersion:version,reason,impactDigest:digest,successorGrantId:uuid.optional(),continueIds:z.array(uuid).max(2000)
 .refine(ids=>new Set(ids).size===ids.length,'延续配置不可重复').default([])}).strict()
 .refine(input=>!input.continueIds.length||Boolean(input.successorGrantId),'延续配置需要接任委托')
const size=25
const txOptions={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000}
const entry=(product:Product)=>product==='SCHOOL'?'HUISCHOOL':'HUITEACHER'

function unavailable(message:string,statusCode=409):never{throw new AdminPermissionError(statusCode,message)}
const standardRoots=Prisma.sql`
 SELECT g.id,g.subject_id AS "accountId",g.product,g.scope_id AS "schoolId",o.name AS "schoolName",
  g.version,g.valid_from AT TIME ZONE 'UTC' AS "validFrom",g.expires_at AT TIME ZONE 'UTC' AS "expiresAt",
  CASE WHEN g.revoked_at IS NOT NULL THEN 'REVOKED'
   WHEN g.expires_at<=clock_timestamp() AT TIME ZONE 'UTC' THEN 'EXPIRED'
   WHEN g.valid_from>clock_timestamp() AT TIME ZONE 'UTC' THEN 'SCHEDULED' ELSE 'ACTIVE' END AS status,
  g.resource_keys[1] AS "resourceKey",s.id AS "releaseId",s.measurement_release->>'releaseId' AS "measurementId",
  COALESCE(s.snapshot->>'title',s.tool_key) AS title, g.resource_keys[1] LIKE 'education-source:STANDARD_SCALE:%' AS exact
 FROM content_capability_grants g JOIN organizations o ON o.id=g.scope_id AND o.product_domain='SCHOOL'
 JOIN LATERAL(
  SELECT s.id,s.measurement_release,s.snapshot,s.tool_key
  FROM survey_standard_releases s LEFT JOIN survey_tool_policies p ON p.product=g.product
   AND p.resource_key='standard-release:'||s.id AND p.fingerprint=s.combination_hash
  WHERE s.measurement_release->>'releaseId' IS NOT NULL AND
   (g.resource_keys[1]=s.measurement_release->>'releaseId'
    OR g.resource_keys[1]='education-source:STANDARD_SCALE:'||s.id||':'||s.combination_hash)
  ORDER BY (s.state='ONLINE' AND p.decision='APPROVED' AND NOT p.paused) DESC NULLS LAST,s.id LIMIT 1
 ) s ON true
 WHERE g.product IN ('SCHOOL','TEACHER') AND g.scope_kind='ORGANIZATION' AND g.resource_kind='material'
  AND cardinality(g.resource_keys)=1 AND g.capabilities=ARRAY['material.distribute']::text[]
  AND g.parent_grant_id IS NULL AND g.ancestry=ARRAY[g.id]::text[]
  AND cardinality(g.delegable_capabilities)=0 AND g.remaining_delegation_depth=0`

async function root(tx:Tx,accountId:string,grantId:string,lock=false){
 const [grant]=await tx.$queryRaw<Root[]>(Prisma.sql`${standardRoots} AND g.subject_id=${accountId} AND g.id=${grantId}
  ${lock?Prisma.sql`FOR SHARE OF g`:Prisma.empty}`)
 if(!grant)unavailable('该账号没有对应的单一标准量表分发委托',404)
 return grant
}

type Impact={count:number;digest:string;list:{id:string;label:string;title:string;expiresAt:Date;reissued:boolean}[];covered:number}
async function impact(tx:Tx,grant:Pick<Root,'id'|'accountId'|'product'|'schoolId'|'resourceKey'>,page=1,successor?:string,continuing?:readonly string[]){
 const checkReissues=successor&&(continuing===undefined||continuing.length>0)
 const [impact]=await tx.$queryRaw<Impact[]>(Prisma.sql`
  WITH linked AS MATERIALIZED (
   SELECT u.id,u.version,u.subject_id,u.resource_keys,u.valid_from,u.expires_at,u.product,u.scope_id,
    a.resource_id,a.metadata#>>'{selectedBinding,binding,configurationHash}' AS configuration_hash,
    person.username AS label,COALESCE(a.metadata->>'configurationName',s.snapshot->>'title',s.tool_key) AS title
   FROM content_capability_grants u JOIN assessment_management_events a ON a.id=u.id
    AND a.action=${EDUCATION_STANDARD_USE_ACTION} AND a.actor_id=u.issuer_id
   JOIN survey_standard_releases s ON s.id=a.resource_id JOIN users person ON person.id=u.subject_id
   WHERE u.issuer_id=${grant.accountId} AND u.product=${grant.product}
    AND u.scope_id=${grant.schoolId} AND u.scope_kind='ORGANIZATION' AND u.resource_kind='material'
    AND u.capabilities=ARRAY['material.use']::text[] AND u.revoked_at IS NULL
    AND u.expires_at>statement_timestamp() AT TIME ZONE 'UTC'
    AND a.metadata#>>'{selectedBinding,binding,authorization,authority,1,id}'=${grant.id}
  ), visible AS (
   SELECT * FROM linked ORDER BY id LIMIT ${size} OFFSET ${(page-1)*size}
  ), reissued AS MATERIALIZED (
   ${checkReissues ? Prisma.sql`
     SELECT old.id FROM ${continuing===undefined?Prisma.sql`visible`:Prisma.sql`linked`} old
     WHERE ${continuing===undefined?Prisma.sql`TRUE`:Prisma.sql`old.id=ANY(${[...continuing]}::text[])`}
     AND EXISTS (
      SELECT 1
      FROM content_capability_grants n JOIN assessment_management_events e ON e.id=n.id
        AND e.action=${EDUCATION_STANDARD_USE_ACTION} AND e.resource_id=old.resource_id AND e.actor_id=n.issuer_id
      JOIN content_capability_grants parent ON parent.id=${successor} AND parent.subject_id=n.issuer_id
      JOIN users manager ON manager.id=parent.subject_id AND manager.id<>${grant.accountId}
        AND manager.platform_role='STANDARD' AND manager.account_domain IN ('TRAINING','LEGACY')
        AND manager.is_active AND NOT manager.is_frozen AND NOT manager.must_change_password
        AND (manager.expires_at IS NULL OR manager.expires_at>clock_timestamp())
      JOIN admin_entry_grants manager_entry ON manager_entry.user_id=manager.id AND manager_entry.entry=${entry(grant.product)}
        AND manager_entry.revoked_at IS NULL AND manager_entry.id=e.metadata#>>'{selectedBinding,binding,authorization,authority,0,id}'
        AND manager_entry.version::text=e.metadata#>>'{selectedBinding,binding,authorization,authority,0,revision}'
      WHERE n.subject_id=old.subject_id AND n.product=old.product AND n.scope_id=old.scope_id
        AND n.scope_kind='ORGANIZATION' AND n.resource_kind='material' AND n.resource_keys=old.resource_keys
        AND n.capabilities=ARRAY['material.use']::text[] AND n.revoked_at IS NULL
        AND n.expires_at>=old.expires_at AND n.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
        AND n.valid_from<=GREATEST(old.valid_from,statement_timestamp() AT TIME ZONE 'UTC')
        AND e.metadata#>>'{selectedBinding,binding,configurationHash}'=old.configuration_hash
        AND e.metadata#>>'{selectedBinding,binding,authorization,authority,1,id}'=parent.id
        AND e.metadata#>>'{selectedBinding,binding,authorization,authority,1,revision}'=parent.version::text
        AND e.metadata#>>'{selectedBinding,binding,authorization,revision}'=n.version::text
        AND parent.revoked_at IS NULL AND parent.product=old.product AND parent.scope_id=old.scope_id
        AND parent.scope_kind='ORGANIZATION' AND parent.resource_kind='material'
        AND parent.capabilities=ARRAY['material.distribute']::text[]
        AND parent.resource_keys=ARRAY[${grant.resourceKey}]::text[]
        AND parent.valid_from<=clock_timestamp() AT TIME ZONE 'UTC' AND parent.expires_at>=old.expires_at
      ORDER BY n.id LIMIT 1 ${continuing!==undefined ? Prisma.sql`FOR SHARE OF n` : Prisma.empty}
     )` : Prisma.sql`SELECT NULL::text AS id WHERE FALSE`}
  )
  SELECT count(*)::int AS count,(SELECT count(*)::int FROM reissued) AS covered,
   encode(digest(COALESCE(string_agg(id||':'||version::text,',' ORDER BY id),''),'sha256'),'hex') AS digest,
   COALESCE((SELECT jsonb_agg(row ORDER BY row.id) FROM (
    SELECT v.id,v.label,v.title,v.expires_at AT TIME ZONE 'UTC' AS "expiresAt",(r.id IS NOT NULL) AS reissued
    FROM visible v LEFT JOIN reissued r ON r.id=v.id
   ) row),'[]'::jsonb) AS list FROM linked`)
 return {...impact,hasMore:impact.count>page*size}
}

export async function listStandardDelegationReview(actorId:string,proof:AdminSessionProof,rawAccountId:string,raw:unknown){
 const accountId=uuid.parse(rawAccountId),{page}=listQuery.parse(raw)
 return prisma.$transaction(async tx=>{
  const {users}=await lockCurrentContentSystemActor(tx,actorId,proof)
  const rows=await tx.$queryRaw<Root[]>(Prisma.sql`${standardRoots} AND g.subject_id=${accountId}
   ORDER BY g.created_at DESC,g.id LIMIT ${size+1} OFFSET ${(page-1)*size}`)
  await recheckContentSystemActorAfterWait(tx,proof,users)
  return {list:rows.slice(0,size),hasMore:rows.length>size}
 },txOptions)
}

type Candidate={id:string;label:string;detail:string;grantId:string|null}
export async function readStandardDelegationReview(actorId:string,proof:AdminSessionProof,rawAccountId:string,rawGrantId:string,raw:unknown){
 const accountId=uuid.parse(rawAccountId),grantId=uuid.parse(rawGrantId)
 const {candidateQuery,candidatePage,impactPage,successorGrantId}=detailQuery.parse(raw)
 return prisma.$transaction(async tx=>{
  const {users}=await lockCurrentContentSystemActor(tx,actorId,proof)
  const grant=await root(tx,accountId,grantId)
  const cover=await readStandardDelegationCoverage(tx,grant.releaseId,grant.product)
  const combinations=grant.exact?cover.combinations.filter(combination=>combination.id===grant.releaseId):cover.combinations
  const affected=await impact(tx,grant,impactPage,successorGrantId)
  const candidates=grant.status==='ACTIVE'?await tx.$queryRaw<Candidate[]>(Prisma.sql`
   SELECT u.id,u.username AS label,COALESCE(NULLIF(u.nickname,''),u.username) AS detail,successor.id AS "grantId"
   FROM users u JOIN admin_entry_grants g ON g.user_id=u.id AND g.entry=${entry(grant.product)} AND g.revoked_at IS NULL
   LEFT JOIN LATERAL(${standardRoots} AND g.subject_id=u.id AND g.product=${grant.product}
    AND g.scope_id=${grant.schoolId} AND g.resource_keys=ARRAY[${grant.resourceKey}]::text[]
    AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AT TIME ZONE 'UTC'
    AND g.expires_at AT TIME ZONE 'UTC' >= ${grant.expiresAt}
    ORDER BY g.expires_at DESC,g.id LIMIT 1) successor ON true
   WHERE u.id<>${accountId} AND u.platform_role='STANDARD' AND u.account_domain IN ('TRAINING','LEGACY')
    AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password
    AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp())
    AND (${candidateQuery}='' OR strpos(lower(u.username),lower(${candidateQuery}))>0
      OR strpos(lower(COALESCE(u.nickname,'')),lower(${candidateQuery}))>0)
   ORDER BY u.username COLLATE "C",u.id LIMIT ${size+1} OFFSET ${(candidatePage-1)*size}`):[]
  await recheckContentSystemActorAfterWait(tx,proof,users)
  return {grant,combinations,affected,candidates:candidates.slice(0,size),moreCandidates:candidates.length>size}
 },txOptions)
}

/** Creates the successor's own root. Existing fixed configurations cannot
 * be reassigned by replacing the issuer on a signed binding. */
export async function issueStandardDelegationSuccessor(actorId:string,proof:AdminSessionProof,rawAccountId:string,rawGrantId:string,raw:unknown){
 const accountId=uuid.parse(rawAccountId),grantId=uuid.parse(rawGrantId),input=transferInput.parse(raw)
 if(accountId===input.successorId)unavailable('请另选具备同入口资格的接任人',400)
 const grant=await prisma.$transaction(async tx=>{
  await lockCurrentContentSystemActor(tx,actorId,proof)
  return root(tx,accountId,grantId)
 },txOptions)
 const signed={requestId:input.requestId,expectedVersion:0,reason:'分发委托交接自 '+grantId+'：'+input.reason,grant:{
  subjectId:input.successorId,scope:{product:grant.product,scopeKind:'ORGANIZATION',scopeId:grant.schoolId,resourceKind:'material',
   resourceKeys:[grant.resourceKey]},
  capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,
  validFrom:grant.validFrom.toISOString(),expiresAt:grant.expiresAt.toISOString(),
 }}
 const issue=grant.exact?issueAdminStandardCombinationRoot:issueAdminContentRoot
 return issue(actorId,proof,signed,async tx=>{
  const current=await root(tx,accountId,grantId,true)
  if(current.status!=='ACTIVE'||current.version!==input.expectedVersion)unavailable('原委托范围或状态已变化，请重新核对')
  await assertEntryAdmin(tx,input.successorId,entry(grant.product))
  const cover=await readStandardDelegationCoverage(tx,current.releaseId,current.product)
  const selectable=grant.exact?cover.identities.find(row=>row.id===current.releaseId):cover.identities[0]
  if(!selectable)unavailable('原委托当前没有可分配的标准量表组合')
  const source=await readCurrentStandardCombination(tx,{releaseId:selectable.id,combinationHash:selectable.combinationHash})
  if(source.measurement.releaseId!==grant.measurementId)unavailable('原测量发布已变化，请重新核对')
  await assertToolEntryPolicy(tx,{resourceKey:'standard-release:'+selectable.id,fingerprint:selectable.combinationHash},grant.product)
  await assertScaleLibraryCollectionAllowed(tx,[grant.measurementId],[selectable.nativeId])
 })
}

export async function withdrawStandardDelegationReview(actorId:string,proof:AdminSessionProof,rawAccountId:string,rawGrantId:string,raw:unknown){
 const accountId=uuid.parse(rawAccountId),grantId=uuid.parse(rawGrantId),input=withdrawalInput.parse(raw)
 const continuation=input.continueIds.length?'，延续 '+input.continueIds.length+' 份（'+canonicalHash([...input.continueIds].sort()).slice(0,32)+'）':''
 const reason=input.successorGrantId?'已核对接任委托 '+input.successorGrantId+continuation+'：'+input.reason:input.reason
 return revokeAdminContentGrant(actorId,proof,grantId,{expectedVersion:input.expectedVersion,reason},async(tx,record)=>{
  const grant=await root(tx,accountId,grantId)
  if(record.revoked_at)return
  if(input.successorGrantId){
   const [candidate]=await tx.$queryRaw<{accountId:string}[]>(Prisma.sql`
    SELECT subject_id AS "accountId" FROM content_capability_grants WHERE id=${input.successorGrantId}`)
   if(!candidate||candidate.accountId===accountId)unavailable('请选择当前有效的接任委托')
   await assertEntryAdmin(tx,candidate.accountId,entry(grant.product))
   const successor=await root(tx,candidate.accountId,input.successorGrantId,true)
   if(successor.status!=='ACTIVE'||successor.product!==grant.product||successor.schoolId!==grant.schoolId
    ||successor.resourceKey!==grant.resourceKey||successor.expiresAt<grant.expiresAt)
    unavailable('接任人的学校、入口、范围或有效期不匹配')
  }
  const affected=await impact(tx,grant,1,input.successorGrantId,input.continueIds)
  if(affected.digest!==input.impactDigest)unavailable('下游配置范围已变化，请重新查看影响后撤销')
  if(affected.covered!==input.continueIds.length)
    unavailable('选中延续的配置仍缺少接任人同对象、同版本和期限的重发记录，请重新核对')
 })
}
