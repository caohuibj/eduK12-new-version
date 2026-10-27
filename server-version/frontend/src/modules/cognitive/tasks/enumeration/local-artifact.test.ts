import {describe,it,expect} from 'vitest'
import {createFinalDraftMeta,createFinalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {enumerationArtifact,enumerationDigest,type EnumerationArtifact} from './display'
import {enumerationFixtureContext} from './fixtures.test-support'
import {enumerationLocalArtifact,freezeEnumerationArtifact,readFrozenEnumerationArtifact,ENUMERATION_LOCAL_ARTIFACT_KEY as key} from './local-artifact'
const makeArtifact=()=>enumerationArtifact(enumerationFixtureContext())
const setup=async()=>{
 const store=createFinalDraftStore(),meta=createFinalDraftMeta({draftKey:'enumeration:'+crypto.randomUUID(),instrument:'cognitive',attemptId:'actual-session',attemptEpoch:2,definitionHash:'a'.repeat(64),submissionId:'actual-submission',contextSnapshotHash:null,deliveryMode:'final_only'})
 await store.ensure(meta);return {store,meta}
}
const rehash=(artifact:EnumerationArtifact)=>{const {artifactHash:_hash,...payload}=artifact;return {...payload,artifactHash:enumerationDigest(payload)}}
describe('enumeration first local artifact freeze',()=>{
 it('freezes original v1 bytes once, returns original full value, and preserves unrelated exposure metadata',async()=>{
  const {store,meta}=await setup(),artifact=makeArtifact(),value=enumerationLocalArtifact(meta,artifact)
  await store.setInstrumentMetadata(meta.draftKey,{exposures:[{id:'existing',state:'unresolved'}]})
  const first=await store.freezeInstrumentArtifact(meta,key,value),again=await store.freezeInstrumentArtifact(meta,key,structuredClone(value))
  expect(first.value).toEqual(value);expect(again.value).toEqual(first.value);expect(again.meta.updatedAt).toBe(first.meta.updatedAt)
  expect(again.meta.instrumentMetadata?.exposures).toEqual([{id:'existing',state:'unresolved'}]);expect(again.value.artifact.hashScheme).toBe('candidate-json-stringify-sha256-v1')
  expect(JSON.stringify(again.value.artifact)).toBe(JSON.stringify(artifact));expect(await readFrozenEnumerationArtifact(meta,store)).toEqual(value)
 })
 it.each(['context','recipe','calibration','realm'] as const)('rejects changed %s with a valid changed digest and keeps originals/markers',async(field)=>{
  const {store,meta}=await setup(),artifact=makeArtifact(),value=enumerationLocalArtifact(meta,artifact)
  await store.setInstrumentMetadata(meta.draftKey,{exposures:['do-not-clear']});await store.freezeInstrumentArtifact(meta,key,value)
  const changed=structuredClone(artifact)
  if(field==='context')changed.context.contextId='another-context'
  if(field==='recipe')changed.context.recipe!.id='another-recipe'
  if(field==='calibration')changed.context.calibration!.referenceCssPx+=1
  if(field==='realm')changed.pageOrigin.pageInstanceId='new-realm'
  await expect(store.freezeInstrumentArtifact(meta,key,enumerationLocalArtifact(meta,rehash(changed)))).rejects.toThrow('不允许替换')
  expect(await readFrozenEnumerationArtifact(meta,store)).toEqual(value);expect((await store.get(meta.draftKey))?.instrumentMetadata?.exposures).toEqual(['do-not-clear'])
 })
 it('rejects different JSON property order even when retaining an internally valid original hash scheme',async()=>{
  const {store,meta}=await setup(),artifact=makeArtifact();await store.freezeInstrumentArtifact(meta,key,enumerationLocalArtifact(meta,artifact))
  const {context,...remaining}=artifact,reordered=rehash({context,...remaining} as EnumerationArtifact)
  await expect(store.freezeInstrumentArtifact(meta,key,enumerationLocalArtifact(meta,reordered))).rejects.toThrow('不允许替换')
 })
 it('atomic freeze rejects stale epoch/submission before writing any slot',async()=>{
  const {store,meta}=await setup(),value=enumerationLocalArtifact(meta,makeArtifact())
  await expect(store.freezeInstrumentArtifact({...meta,attemptEpoch:1},key,value)).rejects.toThrow()
  await expect(store.freezeInstrumentArtifact({...meta,submissionId:'old'},key,value)).rejects.toThrow()
  expect((await store.get(meta.draftKey))?.frozenInstrumentArtifacts).toBeUndefined()
 })
 it('ordinary mutable metadata/update cannot replace or erase frozen originals; outputs cannot mutate store',async()=>{
  const {store,meta}=await setup(),value=enumerationLocalArtifact(meta,makeArtifact());await store.freezeInstrumentArtifact(meta,key,value)
  value.artifact.context.contextId='caller-mutated'
  const read=await store.get(meta.draftKey);(read!.frozenInstrumentArtifacts![key] as typeof value).artifact.context.contextId='getter-mutated'
  await store.setInstrumentMetadata(meta.draftKey,{[key]:{replacement:true}})
  const current=(await store.get(meta.draftKey))!;const {frozenInstrumentArtifacts:_slots,...without}=current
  await store.update(without);expect((await readFrozenEnumerationArtifact(meta,store))?.artifact.context.contextId).toBe('synthetic-enumeration-context')
  await expect(store.update({...current,frozenInstrumentArtifacts:{[key]:{replacement:true}}})).rejects.toThrow('不可通过普通update')
 })
 it('unarchived original prevents cleanup even after core sealing/completion; freeze itself is not archive confirmation',async()=>{
  const {store,meta}=await setup(),value=enumerationLocalArtifact(meta,makeArtifact());await store.freezeInstrumentArtifact(meta,key,value)
  await store.delete(meta.draftKey,meta);expect(await store.get(meta.draftKey)).not.toBeNull()
  await store.sealForSubmission(meta.draftKey,()=>({trials:[]}),meta);await store.setStatus(meta.draftKey,'COMPLETED',undefined,meta)
  await store.delete(meta.draftKey,meta);expect((await store.get(meta.draftKey))?.frozenInstrumentArtifacts?.[key]).toEqual(value)
  expect((await store.get(meta.draftKey))?.cognitiveRawArchive?.archiveConfirmed).not.toBe(true)
  expect((await store.freezeInstrumentArtifact(meta,key,value)).value).toEqual(value)
 })
 it('training TTL cannot tombstone an unarchived frozen artifact',async()=>{
  const {store,meta}=await setup();const now=Date.now(),binding={schemaVersion:1 as const,attemptId:'parent',attemptEpoch:1,sessionId:meta.attemptId,sessionEpoch:meta.attemptEpoch,snapshotHash:'snapshot',ttlHours:1,lastWriteAt:now-7200000}
  const {trainingCognitiveDraftKey}=await import('../../../../services/persistence/finalDraftStore')
  const training={...meta,draftKey:trainingCognitiveDraftKey(binding),trainingRetention:binding};await store.ensure(training)
  await store.freezeInstrumentArtifact(training,key,enumerationLocalArtifact(training,makeArtifact()))
  expect(await store.expireTrainingCognitiveDraft(training.draftKey,now+7200000)).toBe(false);expect((await store.get(training.draftKey))?.trainingRetention?.expiredAt).toBeUndefined()
 })
 it('Memory logic cannot be advertised as durable by the task helper; corrupt digest cannot freeze',async()=>{
  const {store,meta}=await setup(),artifact=makeArtifact()
  await expect(freezeEnumerationArtifact(meta,artifact,store)).rejects.toThrow('耐久')
  expect(()=>enumerationLocalArtifact(meta,{...artifact,artifactHash:'0'.repeat(64)})).toThrow('摘要不一致')
  expect((await store.get(meta.draftKey))?.frozenInstrumentArtifacts).toBeUndefined()
 })
 it('survey TTL also preserves unarchived frozen originals',async()=>{
  const {store,meta}=await setup(),now=Date.now(),survey={...meta,draftKey:'cognitive:'+meta.attemptId,surveyRetention:{schemaVersion:1 as const,lastWriteAt:now}}
  await store.ensure(survey);await store.freezeInstrumentArtifact(survey,key,enumerationLocalArtifact(survey,makeArtifact()))
  expect(await store.expireSurveyCognitiveDraft(meta.attemptId,false,now+8*24*3600000)).toBe(false)
  expect(await readFrozenEnumerationArtifact(survey,store)).not.toBeNull()
 })
 it('only a complete confirmed archive state unlocks ordinary deletion of a frozen original',async()=>{
  const {store,meta}=await setup(),value=enumerationLocalArtifact(meta,makeArtifact()),identity={sessionId:meta.attemptId,attemptEpoch:meta.attemptEpoch,definitionHash:meta.definitionHash,submissionId:meta.submissionId}
  await store.freezeInstrumentArtifact(meta,key,value)
  await store.mutateCognitiveArchive(meta.draftKey,identity,{kind:'seal',rawPayload:{artifact:value.artifact},rawSha256:'b'.repeat(64)})
  await store.sealForSubmission(meta.draftKey,()=>({trials:[]}),meta)
  await store.mutateCognitiveArchive(meta.draftKey,identity,{kind:'core-saved'})
  await store.delete(meta.draftKey,meta);expect(await store.get(meta.draftKey)).not.toBeNull()
  await store.mutateCognitiveArchive(meta.draftKey,identity,{kind:'receipt',receipt:{...identity,coreSaved:true,archiveState:'confirmed',archiveConfirmed:true,rawSubmissionId:'trusted-fixture-raw',coreHash:'a'.repeat(64),rawSha256:'b'.repeat(64),logicalHash:'c'.repeat(64),assetId:'trusted-fixture-asset',objectKey:'private/fixture',sha256:'d'.repeat(64),sizeBytes:100}})
  await store.delete(meta.draftKey,meta);expect(await store.get(meta.draftKey)).toBeNull()
 })

})
