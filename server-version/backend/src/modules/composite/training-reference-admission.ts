import {Prisma} from '@prisma/client'
import {InstrumentFinalSubmitError} from '../../services/instrumentFinalSubmit'
import {isCompactTrainingContentBindingRef,resolveTrainingContentBindingParent,tryResolveTrainingContentBindingSync} from './training-content-binding'
type Parent={
 id:string
 attemptEpoch?:number
 trainingContentBinding?:unknown
 trainingContentBindingHash?:string|null
 trainingReferenceBinding?:unknown
 trainingReferenceBindingHash?:string|null
}
const checked=new WeakSet<object>(),verifiedByDb=new WeakMap<object,Set<string>>(),digest=/^[a-f0-9]{64}$/
function unavailable():never{throw new InstrumentFinalSubmitError('STALE_ATTEMPT','请先提交人口学上下文并冻结参考选择',409)}
/** Runner/media admission only. Forms must remain accessible to collect context.
 * The two markers join existing parent reads; ready/new and no-content/legacy
 * paths add no query. Older content or incomplete projections need only a small
 * metadata probe, not binding JSON, source samples, selection or scoring. */
export async function assertTrainingReferenceReadyForMeasurement(db:Prisma.TransactionClient,parent:Parent){
 if(checked.has(parent))return
 const content=parent.trainingContentBindingHash,reference=parent.trainingReferenceBindingHash
 if(content===null&&reference===null){checked.add(parent);return}
 // Both immutable columns come from the same authoritative parent read; the
 // database binding guard preserves attempt/epoch/content/context identity.
 if(typeof content==='string'&&digest.test(content)&&typeof reference==='string'&&digest.test(reference)){checked.add(parent);return}
 const cacheKey=typeof content==='string'&&digest.test(content)&&reference===null?`${parent.id}:${content}`:undefined
 if(cacheKey&&db&&typeof db==='object'&&verifiedByDb.get(db)?.has(cacheKey)){checked.add(parent);return}
 let resolvedParent=parent
 if(typeof parent.attemptEpoch==='number'&&parent.trainingContentBinding!==undefined){
  const parentWithBinding={id:parent.id,attemptEpoch:parent.attemptEpoch,trainingContentBinding:parent.trainingContentBinding}
  const syncResolved=tryResolveTrainingContentBindingSync(parentWithBinding,db)
  if(syncResolved!==parentWithBinding){
   resolvedParent={...parent,trainingContentBinding:syncResolved.trainingContentBinding}
  }else if(isCompactTrainingContentBindingRef(parent.trainingContentBinding)&&typeof (db as unknown as {$queryRaw?:unknown})?.$queryRaw==='function'){
   const asyncResolved=await resolveTrainingContentBindingParent(db,parentWithBinding)
   if(asyncResolved!==parentWithBinding){
    resolvedParent={...parent,trainingContentBinding:asyncResolved.trainingContentBinding}
   }
  }
 }
 const binding=resolvedParent.trainingContentBinding as {attemptId?:unknown;epoch?:unknown;units?:unknown}|null|undefined
 if(typeof content==='string'&&digest.test(content)&&reference===null&&parent.trainingReferenceBinding===null
  &&binding&&typeof binding==='object'&&binding.attemptId===parent.id
  &&(parent.attemptEpoch===undefined||binding.epoch===parent.attemptEpoch)&&Array.isArray(binding.units)
  &&!binding.units.some((u:unknown)=>Boolean(u&&typeof u==='object'&&'referencePolicy' in (u as Record<string,unknown>)))){
  checked.add(parent)
  if(cacheKey&&db&&typeof db==='object'){
   let set=verifiedByDb.get(db);if(!set){set=new Set();verifiedByDb.set(db,set)}
   if(set.size>=4096)set.clear()
   set.add(cacheKey)
  }
  return
 }
 const [row]=await db.$queryRaw<Array<{id:string;attempt_epoch:number;content_hash:string|null;reference_hash:string|null;required:boolean;is_compact:boolean;raw_binding:unknown;identity_valid:boolean}>>(Prisma.sql`
  SELECT a.id,a.attempt_epoch,a.training_content_binding_hash AS content_hash,a.training_reference_binding_hash AS reference_hash,
   EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(
    CASE WHEN a.training_content_binding->>'schemaVersion'='2' AND NOT (a.training_content_binding ? 'units')
     THEN (SELECT c.training_content_snapshot->'units' FROM composite_assessments c WHERE c.id=a.composite_assessment_id)
     ELSE a.training_content_binding->'units' END,
    '[]'::jsonb)) u WHERE u ? 'referencePolicy') AS required,
   (a.training_content_binding->>'schemaVersion'='2' AND NOT (a.training_content_binding ? 'units')) AS is_compact,
   CASE WHEN a.training_content_binding->>'schemaVersion'='2' AND NOT (a.training_content_binding ? 'units')
    THEN a.training_content_binding ELSE NULL END AS raw_binding,
   (a.training_reference_binding IS NULL OR (
    a.training_reference_binding->>'attemptId'=a.id AND a.training_reference_binding->>'epoch'=a.attempt_epoch::text
    AND a.training_reference_binding->>'contentBindingHash'=a.training_content_binding_hash
    AND (a.training_reference_binding->>'contextHash') IS NOT DISTINCT FROM a.context_snapshot_hash)) AS identity_valid
  FROM composite_assessment_attempts a WHERE a.id=${parent.id}`)
 let required=row?.required??false
 if(row&&row.is_compact&&required&&(!row.reference_hash||!digest.test(row.reference_hash))){
  const hydrated=await resolveTrainingContentBindingParent(db,{id:row.id,attemptEpoch:row.attempt_epoch,trainingContentBinding:row.raw_binding})
  const units=(hydrated.trainingContentBinding as {units?:unknown}|null)?.units
  if(Array.isArray(units))required=units.some((u:unknown)=>Boolean(u&&typeof u==='object'&&'referencePolicy' in (u as Record<string,unknown>)))
 }
 if(!row||row.id!==parent.id||!row.identity_valid||required&&(!row.reference_hash||!digest.test(row.reference_hash))
  ||content!==undefined&&content!==row.content_hash||reference!==undefined&&reference!==null&&reference!==row.reference_hash)unavailable()
 checked.add(parent)
 if(cacheKey&&!required&&row.reference_hash===null&&db&&typeof db==='object'){
  let set=verifiedByDb.get(db);if(!set){set=new Set();verifiedByDb.set(db,set)}
  if(set.size>=4096)set.clear()
  set.add(cacheKey)
 }
}
