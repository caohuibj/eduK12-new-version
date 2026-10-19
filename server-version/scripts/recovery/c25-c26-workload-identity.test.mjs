/** No service: distinct legitimate request/runtime identities, never all-H. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {bindFinalIdentity,freezeFinalIdentity} from './c25-c26-workload.mjs'
const request='a'.repeat(64),source='b'.repeat(64),compiled='c'.repeat(64),plan='d'.repeat(64),other='e'.repeat(64)
function context(type='COGNITIVE'){
 const unit={id:'item',type,...(type==='COGNITIVE'?{cognitiveSession:{sessionId:'child',definitionHash:request}}:{scaleAssessmentId:'child',definitionHash:request})}
 const parent={id:'parent',attemptEpoch:1,frozenActiveSlotSetHash:plan,frozenActiveSlotSetEncrypted:'slots'}
 const slotSet={snapshotHash:plan,attemptEpoch:1,slots:[{slotKey:type.toLowerCase()+':item',unitType:type,sourceDefinitionIdentity:{key:'instrument',version:'1',hash:source},sourceBinding:{compositeItemId:'item',compiledRuntimeHash:compiled}}]}
 const child={id:'child',compositeAttemptId:'parent',compositeItemId:'item',compiledRuntimeHash:compiled,...(type==='COGNITIVE'?{attemptNo:1,configSnapshotEncrypted:'config'}:{attemptEpoch:1,runtimeSnapshotEncrypted:'scale'})}
 return {parent,slotSet,unit,child,body:{attemptEpoch:1,definitionHash:request,submissionId:'submission'},runtimeIdentity:{requestDefinitionHash:request,sourceDefinitionHash:source,compiledRuntimeHash:compiled}}
}
test('legitimate config/legacy request hashes bind separately to runtime source and pre-frozen slot identities',()=>{
 for(const type of ['COGNITIVE','SCALE']){
  const x=context(type),proof=bindFinalIdentity(x)
  assert.notEqual(proof.requestDefinitionHash,proof.sourceDefinitionHash);assert.equal(proof.sourceDefinitionHash,source);assert.equal(proof.compiledRuntimeHash,compiled);assert.ok(Object.isFrozen(proof))
  for(const mutate of [x=>x.body.definitionHash=other,x=>x.runtimeIdentity.requestDefinitionHash=other,x=>x.runtimeIdentity.sourceDefinitionHash=other,x=>x.runtimeIdentity.compiledRuntimeHash=other,x=>x.slotSet.slots[0].sourceDefinitionIdentity.hash=other,x=>x.slotSet.slots[0].sourceBinding.compiledRuntimeHash=other,x=>x.child.id='wrong-child',x=>x.child.compiledRuntimeHash=other,x=>x.child.compositeAttemptId='other',x=>x.slotSet.attemptEpoch=2,x=>x.slotSet.snapshotHash=other]){
   const altered=structuredClone(x);mutate(altered);assert.throws(()=>bindFinalIdentity(altered))
  }
 }
})
test('pre-FINAL identity reader selects real frozen-loader contract and rejects DTO/runtime drift before any submit',async()=>{
 for(const type of ['COGNITIVE','SCALE']){
  const x=context(type),calls=[],api={prisma:{compositeAssessmentAttempt:{findUniqueOrThrow:async({where})=>{assert.equal(where.id,'parent');calls.push('parent');return x.parent}}},
   loadFrozenActiveSlotSet:async encrypted=>{assert.equal(encrypted,'slots');calls.push('slot');return x.slotSet},children:async id=>{assert.equal(id,'parent');calls.push('child');return {[type==='SCALE'?'scales':'cognitive']:[x.child]}},
   loadCognitiveSessionConfig:async encrypted=>{assert.equal(encrypted,'config');calls.push('config');return {snapshot:{runtimeGeneration:'UNIFIED_V1',configHash:request},compiledRuntime:{instrumentType:'COGNITIVE',sourceDefinitionHash:source,compiledRuntimeHash:compiled}}},
   loadFrozenScaleRuntimeSnapshot:async encrypted=>{assert.equal(encrypted,'scale');calls.push('scale');return {legacyDefinitionHash:request,sourceDefinitionHash:source,compiledRuntime:{compiledRuntimeHash:compiled}}}}
  const attempt={id:'parent',attemptEpoch:1,currentItem:x.unit},spec={type,body:x.body}
  const proof=await freezeFinalIdentity(api,attempt,spec);assert.deepEqual(calls,['parent','slot','child',type==='SCALE'?'scale':'config']);assert.equal(proof.requestDefinitionHash,request);assert.equal(proof.sourceDefinitionHash,source)
  if(type==='SCALE')x.unit.definitionHash=other;else x.unit.cognitiveSession.definitionHash=other
  await assert.rejects(freezeFinalIdentity(api,attempt,spec));assert.ok(!calls.includes('submit'))
 }
})
