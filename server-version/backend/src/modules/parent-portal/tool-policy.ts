import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { resultAudiencePolicySchema } from '../assessment-policy/result-disclosure'
import { fail, type ParentProjection } from './contracts'
export { parentToolRefSchema } from './contracts'
import { parentToolRefSchema } from './contracts'
export const parentToolCeilingSchema=resultAudiencePolicySchema.superRefine((p,ctx)=>{
 if(!['NONE','COMPLETION_ONLY','INDIVIDUAL_SUMMARY'].includes(p.mode)||p.delaySeconds!==undefined)ctx.addIssue({code:'custom',message:'家长工具上限只允许不披露、完成情况或个人摘要'})
 if(new Set(p.metricKeys).size!==p.metricKeys.length||new Set(p.longitudinalMetricKeys).size!==p.longitudinalMetricKeys.length||p.longitudinalMetricKeys.some(k=>!p.metricKeys.includes(k)))ctx.addIssue({code:'custom',message:'指标范围无效'})
 if(p.mode!=='INDIVIDUAL_SUMMARY'&&(p.metricKeys.length||p.longitudinalMetricKeys.length))ctx.addIssue({code:'custom',message:'完成情况不能包含指标'})
})
const withheld={mode:'NONE' as const,metricKeys:[],longitudinalMetricKeys:[]}
async function systemAdmin(tx:Prisma.TransactionClient,userId:string){const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE id=${userId} AND platform_role='SYSTEM_ADMIN' AND is_active=true AND is_frozen=false AND (expires_at IS NULL OR expires_at>statement_timestamp()) FOR SHARE`;if(!rows.length)fail('PARENT_TOOL_POLICY_FORBIDDEN',403,'仅超级管理员可以设置工具披露上限')}
export function createParentToolPolicyService(db=prisma){
 return {
  async read(userId:string,rawRef:unknown){const ref=parentToolRefSchema.parse(rawRef);return db.$transaction(async tx=>{await systemAdmin(tx,userId);const rows=await tx.$queryRaw<Array<{version:number;policy:unknown;policyHash:string}>>`SELECT version,policy,policy_hash AS "policyHash" FROM parent_tool_disclosure_policies WHERE resource_family=${ref.family} AND resource_key=${ref.key} AND resource_version=${ref.version}`;const row=rows[0];if(row&&canonicalHash(row.policy)!==row.policyHash)fail('PARENT_TOOL_POLICY_INTEGRITY',409);return {tool:ref,version:row?.version??0,policy:row?parentToolCeilingSchema.parse(row.policy):withheld,commandKey:randomUUID(),allowedActions:['UPDATE']}})},
  async update(userId:string,rawRef:unknown,input:{policy:unknown;expectedVersion:number;commandKey:string}){const ref=parentToolRefSchema.parse(rawRef),policy=parentToolCeilingSchema.parse(input.policy),requestHash=canonicalHash({ref,policy,expectedVersion:input.expectedVersion});return db.$transaction(async tx=>{
   await systemAdmin(tx,userId)
   // Serialize both creation and changes to one exact tool; includes missing row.
   const identity=canonicalHash(ref);await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity},0))`
   const receipts=await tx.$queryRaw<Array<{requestHash:string;version:number}>>`SELECT request_hash AS "requestHash",version FROM parent_tool_disclosure_policy_events WHERE actor_user_id=${userId} AND command_key=${input.commandKey}`
   if(receipts.length){if(receipts[0].requestHash!==requestHash)fail('PARENT_COMMAND_CONFLICT',409);return {tool:ref,version:receipts[0].version}}
   const rows=await tx.$queryRaw<Array<{version:number;policy:unknown}>>`SELECT version,policy FROM parent_tool_disclosure_policies WHERE resource_family=${ref.family} AND resource_key=${ref.key} AND resource_version=${ref.version} FOR UPDATE`
   const previous=rows[0],version=(previous?.version??0)+1;if((previous?.version??0)!==input.expectedVersion)fail('PARENT_TOOL_POLICY_VERSION',409,'设置已被修改，请刷新后重试')
   await tx.$executeRaw`INSERT INTO parent_tool_disclosure_policies (resource_family,resource_key,resource_version,version,policy,policy_hash,configured_by_user_id) VALUES (${ref.family},${ref.key},${ref.version},${version},${JSON.stringify(policy)}::jsonb,${canonicalHash(policy)},${userId}) ON CONFLICT (resource_family,resource_key,resource_version) DO UPDATE SET version=EXCLUDED.version,policy=EXCLUDED.policy,policy_hash=EXCLUDED.policy_hash,configured_by_user_id=EXCLUDED.configured_by_user_id,updated_at=statement_timestamp()`
   await tx.$executeRaw`INSERT INTO parent_tool_disclosure_policy_events (id,resource_family,resource_key,resource_version,actor_user_id,command_key,request_hash,previous_version,version,previous_policy,policy) VALUES (${randomUUID()},${ref.family},${ref.key},${ref.version},${userId},${input.commandKey},${requestHash},${previous?.version??0},${version},${previous?JSON.stringify(previous.policy):'null'}::jsonb,${JSON.stringify(policy)}::jsonb)`
   return {tool:ref,version}
  })},
 }
}
export const parentToolPolicyService=createParentToolPolicyService()
export async function assertParentToolCeiling(tx:Prisma.TransactionClient,projection:ParentProjection){
 const ref=projection.toolRef??fail('PARENT_TOOL_POLICY_UNAVAILABLE')
 const rows=await tx.$queryRaw<Array<{policy:unknown;policyHash:string}>>`SELECT policy,policy_hash AS "policyHash" FROM parent_tool_disclosure_policies WHERE resource_family=${ref.family} AND resource_key=${ref.key} AND resource_version=${ref.version} FOR SHARE`
 const row=rows[0];if(!row||canonicalHash(row.policy)!==row.policyHash)fail('PARENT_TOOL_POLICY_UNAVAILABLE')
 const ceiling=parentToolCeilingSchema.parse(row.policy)
 if(ceiling.mode==='NONE'||(projection.policy.mode==='EDUCATIONAL_SUMMARY'&&ceiling.mode!=='INDIVIDUAL_SUMMARY')||(projection.disclosedMetricKeys||[]).some(key=>!ceiling.metricKeys.includes(key))||(projection.disclosedLongitudinalMetricKeys||[]).some(key=>!ceiling.longitudinalMetricKeys.includes(key)))fail('PARENT_TOOL_POLICY_WITHHELD')
}
// Bounded report list authorization stays in one query, independent of children
// and reports count. It does not project or calculate scientific content.
export function parentToolVisibleSqlFor(projection:Prisma.Sql,mode:Prisma.Sql){return Prisma.sql`EXISTS (SELECT 1 FROM parent_tool_disclosure_policies ceiling WHERE ceiling.resource_family=(${projection})->'toolRef'->>'family' AND ceiling.resource_key=(${projection})->'toolRef'->>'key' AND ceiling.resource_version=(${projection})->'toolRef'->>'version' AND ceiling.policy->>'mode'!='NONE' AND ((${mode})='COMPLETION_ONLY' OR ceiling.policy->>'mode'='INDIVIDUAL_SUMMARY') AND ceiling.policy->'metricKeys' @> COALESCE((${projection})->'disclosedMetricKeys','[]'::jsonb) AND ceiling.policy->'longitudinalMetricKeys' @> COALESCE((${projection})->'disclosedLongitudinalMetricKeys','[]'::jsonb))`}
export const parentToolVisibleSql=parentToolVisibleSqlFor(Prisma.sql`g.projection_payload`,Prisma.sql`g.projection_mode`)
