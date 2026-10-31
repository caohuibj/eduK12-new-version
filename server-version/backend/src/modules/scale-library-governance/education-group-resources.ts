import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {ScaleDefinitionV2} from '../scale/scale-definition'
import {resultAudiences} from '../assessment-policy/result-disclosure'
import {SELF_GROUP_POLICY_KEY,selfGroupAggregateAudiences} from '../assessment-policy/self-group-contract'
import {compileEducationApplicability} from './education-applicability'
import {educationLibraryOriginSchema,educationLibraryResourceEntry,educationLibraryResourceKey,type EducationLibraryResourceEntry} from './education-runtime-entry'
import {readEducationLibraryRegisteredSource,createEducationLibraryPolicyWrapper} from './education-runtime-resources'
import {reportingFail} from '../reporting/types'

type Row={id:string;resource_key:string;resource_version:string;scale_id:string;definition_hash:string;composite_id:string;
 entry:unknown;entry_hash:string;status:string}
const inputSchema=z.object({minimumRespondents:z.number().int().min(3),aggregateAudiences:z.array(z.enum(selfGroupAggregateAudiences)).min(1).max(3)
 .refine(values=>new Set(values).size===values.length)}).strict()
const variant=(key:string)=>compileEducationApplicability({schemaVersion:1,administrations:[{population:key.split(':')[0],responseMode:'SELF'}]}).variants[0]
const fail=():never=>reportingFail('RESOURCE_LIBRARY_GROUP_IDENTITY','共用库 GROUP 来源或冻结身份不一致',409)

/** Reconstruct only a candidate's exact reviewed source identity. This does
 * not authorize task collection or a report read for any organization. */
export async function validateEducationLibraryGroupCandidate(tx:Prisma.TransactionClient,row:Pick<Row,'resource_key'|'resource_version'|'scale_id'|'definition_hash'|'composite_id'|'entry'|'entry_hash'>){
 const entry=row.entry as EducationLibraryResourceEntry,origin=educationLibraryOriginSchema.parse(entry.libraryOrigin)
 if(origin.adapterVersion==='1.0.0'||origin.adapterVersion!==row.resource_version||educationLibraryResourceKey(origin)!==row.resource_key||canonicalHash(entry)!==row.entry_hash)fail()
 const baseOrigin={...origin,adapterVersion:'1.0.0' as const}
 const source=await readEducationLibraryRegisteredSource(tx,{product:origin.product,resourceKey:educationLibraryResourceKey(baseOrigin),resourceVersion:'1.0.0',purpose:'NEW_USE'})
 if(canonicalHash(baseOrigin)!==canonicalHash(source.resourceEntry.libraryOrigin)||source.scaleId!==row.scale_id)fail()
 const scale=await tx.scale.findUniqueOrThrow({where:{id:source.scaleId}})
 if(scale.definitionHash!==row.definition_hash)fail()
 const expected=educationLibraryResourceEntry({origin,variant:variant(origin.variantKey),title:source.resourceEntry.title,
  definition:scale.definition as unknown as ScaleDefinitionV2,compositeId:row.composite_id,disclosure:entry.resultDisclosure})
 if(canonicalHash(expected)!==row.entry_hash)fail()
 return expected
}

/** A new explicit policy version of an already approved SELF source. Reuse
 * the original approved C and a separate immutable policy wrapper and existing independent resource review lifecycle. */
export async function registerEducationLibraryGroupResource(actor:{userId:string;platformRole:string},sourceResourceId:string,raw:unknown){
 if(actor.platformRole!=='SYSTEM_ADMIN')reportingFail('RESOURCE_AUTHORITY','仅平台管理员可以登记共用库群体用途',403)
 z.string().guid().parse(sourceResourceId);const input=inputSchema.parse(raw)
 return prisma.$transaction(async tx=>{
  const [row]=await tx.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources WHERE id=${sourceResourceId} FOR SHARE`
  if(!row||row.status!=='PUBLISHED')fail()
  const sourceEntry=row.entry as EducationLibraryResourceEntry,base=educationLibraryOriginSchema.parse(sourceEntry.libraryOrigin)
  if(base.adapterVersion!=='1.0.0'||!base.variantKey.endsWith(':SELF'))fail()
  const source=await readEducationLibraryRegisteredSource(tx,{product:base.product,resourceKey:row.resource_key,resourceVersion:row.resource_version,purpose:'NEW_USE'})
  const scale=await tx.scale.findUniqueOrThrow({where:{id:source.scaleId}}),definition=scale.definition as unknown as ScaleDefinitionV2
  const metricKeys=definition.scoring.scores.map(score=>score.key),approved=source.resourceEntry.resultDisclosure!
  const disclosure={...approved,policyKey:SELF_GROUP_POLICY_KEY,minimumRespondents:input.minimumRespondents,
   audiences:Object.fromEntries(resultAudiences.map(audience=>[audience,input.aggregateAudiences.includes(audience as typeof input.aggregateAudiences[number])
    ?{mode:'AGGREGATE_ONLY',metricKeys,longitudinalMetricKeys:[]}:approved.audiences[audience]]))}
  const key=educationLibraryResourceKey({...base,adapterVersion:'2.0.0'})
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'library-group:'+key}))`
  const [prior]=await tx.$queryRaw<Row[]>`SELECT * FROM registered_assessment_resources WHERE resource_key=${key} ORDER BY created_at DESC,id DESC LIMIT 1 FOR SHARE`
  if(prior&&prior.status!=='RETIRED'&&canonicalHash((prior.entry as EducationLibraryResourceEntry).resultDisclosure)===canonicalHash(disclosure)){
   await validateEducationLibraryGroupCandidate(tx,prior);return prior
  }
  const [count]=await tx.$queryRaw<Array<{n:number}>>`SELECT COUNT(*)::int AS n FROM registered_assessment_resources WHERE resource_key=${key}`
  const origin={...base,adapterVersion:`2.0.${count.n}`}
  const wrapper=await createEducationLibraryPolicyWrapper(tx,{title:source.resourceEntry.title,scaleId:source.scaleId,instruction:scale.instruction,actorId:actor.userId})
  const entry=educationLibraryResourceEntry({origin,variant:variant(base.variantKey),title:source.resourceEntry.title,definition,compositeId:wrapper.id,disclosure})
  const [created]=await tx.$queryRaw<Row[]>(Prisma.sql`INSERT INTO registered_assessment_resources
   (id,resource_key,resource_version,scale_id,definition_hash,composite_id,entry,entry_hash,created_by_user_id)
   VALUES(${randomUUID()},${key},${origin.adapterVersion},${source.scaleId},${scale.definitionHash},${wrapper.id},${JSON.stringify(entry)}::jsonb,${canonicalHash(entry)},${actor.userId}) RETURNING *`)
  return created
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,timeout:15000})
}
