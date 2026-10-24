import { z } from 'zod'
import { canonicalHash } from './canonical'
import { scaleTimingItemSchema, type ScaleItemTimingV1 } from '../assessment-core/scale/item-timing'
import { InstrumentFinalSubmitError } from '../../services/instrumentFinalSubmit'
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const course = z.object({ courseId:z.string().min(1),courseType:z.literal('TRAINING_COURSE') }).strict()
export const trainingTimingPolicySchema=z.object({schemaVersion:z.literal(1),enabled:z.literal(true),contract:z.literal('BROWSER_ACTIVE_SCALE_V1'),courses:z.array(course).min(1).max(100),policyHash:hash}).strict()
export type TrainingTimingPolicy=z.infer<typeof trainingTimingPolicySchema>
export const trainingTimingSnapshotSchema=z.object({schemaVersion:z.literal(1),contract:z.literal('BROWSER_ACTIVE_SCALE_V1'),course,policyHash:hash,attemptEpoch:z.number().int().positive(),snapshotHash:hash}).strict()
export type TrainingTimingSnapshot=z.infer<typeof trainingTimingSnapshotSchema>
const fail=(message:string):never=>{throw new InstrumentFinalSubmitError('SUBMISSION_PAYLOAD_CONFLICT',message,400)}
const verify=<T extends {policyHash?:string;snapshotHash?:string}>(value:T,key:'policyHash'|'snapshotHash'):T=>{
 const {[key]:digest,...unsigned}=value
 if(canonicalHash(unsigned)!==digest)fail('计时冻结策略完整性校验失败')
 return value
}
export function readTrainingTimingPolicy(raw:unknown):TrainingTimingPolicy|null{
 if(raw==null)return null
 return verify(trainingTimingPolicySchema.parse(raw),'policyHash')
}
export function readTrainingTimingSnapshot(raw:unknown):TrainingTimingSnapshot|null{
 if(raw==null)return null
 return verify(trainingTimingSnapshotSchema.parse(raw),'snapshotHash')
}
export function freezeTrainingTimingPolicy(rows:Array<{id:string;courseType:string;isLibrary:boolean}>,publicEnabled:boolean):TrainingTimingPolicy{
 if(!rows.length||rows.some(row=>row.courseType!=='TRAINING_COURSE'||row.isLibrary)||new Set(rows.map(row=>row.id)).size!==rows.length)fail('计时仅支持明确投放到 Training 课程的普通问卷')
 if(publicEnabled&&rows.length!==1)fail('公开计时问卷必须唯一绑定一个 Training 投放课程')
 const unsigned={schemaVersion:1 as const,enabled:true as const,contract:'BROWSER_ACTIVE_SCALE_V1' as const,courses:rows.map(row=>({courseId:row.id,courseType:'TRAINING_COURSE' as const})).sort((a,b)=>a.courseId.localeCompare(b.courseId))}
 return {...unsigned,policyHash:canonicalHash(unsigned)}
}
export function freezeTrainingTimingSnapshot(raw:unknown,courseId:string|null,attemptEpoch:number,anonymous:boolean):TrainingTimingSnapshot|null{
 const policy=readTrainingTimingPolicy(raw)
 if(!policy)return null
 if(anonymous&&policy.courses.length!==1)fail('匿名计时缺少唯一冻结课程来源')
 const selected=anonymous?policy.courses[0]:policy.courses.find(row=>row.courseId===courseId)
 if(!selected)fail('计时准入课程与冻结投放不匹配')
 const unsigned={schemaVersion:1 as const,contract:policy.contract,course:selected!,policyHash:policy.policyHash,attemptEpoch}
 return {...unsigned,snapshotHash:canonicalHash(unsigned)}
}
export type TrainingTimingFact={schemaVersion:1;contract:'BROWSER_ACTIVE_SCALE_V1';snapshotHash:string;status:'RECORDED'|'MISSING';items:Record<string,ScaleItemTimingV1>}
/** Optional observations: absence never invalidates an otherwise valid answer. */
export function normalizeTrainingScaleTiming(snapshotRaw:unknown,knownKeys:readonly string[],answeredKeys:readonly string[],raw:unknown):TrainingTimingFact|null{
 const snapshot=readTrainingTimingSnapshot(snapshotRaw)
 if(!snapshot){if(raw!==undefined)fail('本次未启用计时，不能提交计时数据');return null}
 const items:Record<string,ScaleItemTimingV1>={}
 if(raw!==undefined){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('计时必须为题目编码映射')
  if(Buffer.byteLength(JSON.stringify(raw),'utf8')>400000)fail('计时超过400KB预算')
  const entries=Object.entries(raw as Record<string,unknown>)
  if(entries.length>1000)fail('计时题数超限')
  const known=new Set(knownKeys),answered=new Set(answeredKeys)
  for(const [key,value] of entries){
   if(!known.has(key)||!answered.has(key))fail('未知或未回答题目不能提交计时')
   const parsed=scaleTimingItemSchema.safeParse(value)
   if(!parsed.success)fail('计时数值或字段无效')
   const row=parsed.data!
   if(row.firstResponseMs!==null&&(row.activeTimeMs<row.firstResponseMs||row.visits<1)||row.firstResponseMs===null&&!row.recoveredWithoutClock||row.revisitCount>Math.max(0,row.visits-1))fail('计时状态不一致')
   Object.defineProperty(items,key,{value:row,enumerable:true,writable:true,configurable:true})
  }
 }
 return {schemaVersion:1,contract:snapshot.contract,snapshotHash:snapshot.snapshotHash,status:raw!==undefined&&answeredKeys.every(key=>Object.prototype.hasOwnProperty.call(items,key))?'RECORDED':'MISSING',items}
}

export const trainingTimingFactSchema=z.object({schemaVersion:z.literal(1),contract:z.literal('BROWSER_ACTIVE_SCALE_V1'),snapshotHash:hash,status:z.enum(['RECORDED','MISSING']),items:z.record(z.string(), scaleTimingItemSchema)}).strict()
/** Persisted observations, never reconstructed from current membership or raw answers. */
export function projectTrainingTimingFact(snapshotRaw:unknown,factRaw:unknown){
 const snapshot=readTrainingTimingSnapshot(snapshotRaw)
 if(!snapshot)return {scope:'LEGACY_UNSCOPED' as const,status:'NOT_COLLECTED' as const,unit:'ms' as const,items:{}}
 if(factRaw==null)return {scope:'TRAINING_COURSE' as const,status:'MISSING' as const,unit:'ms' as const,snapshotHash:snapshot.snapshotHash,items:{}}
 const fact=trainingTimingFactSchema.parse(factRaw)
 if(fact.snapshotHash!==snapshot.snapshotHash)fail('计时事实与冻结投放不匹配')
 return {scope:'TRAINING_COURSE' as const,unit:'ms' as const,...fact}
}
