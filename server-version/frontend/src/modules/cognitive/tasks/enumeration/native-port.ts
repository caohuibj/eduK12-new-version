import {finalDraftStore,assertFinalDraftWriteIdentity,type FinalDraftStore,type FinalDraftWriteIdentity} from '../../../../services/persistence/finalDraftStore'
import {requireCognitiveDurability} from '../../core/raw-archive'
import type {CognitiveNativeHost} from '../../core/runner.types'
import {enumerationDigest,enumerationContextPlan,type EnumerationArtifact,type EnumerationPageOrigin} from './display'
import {enumerationLocalArtifact,ENUMERATION_LOCAL_ARTIFACT_KEY} from './local-artifact'
import type {EnumerationPersistencePort,EnumerationSavedRecord,EnumerationReservation} from './persistence'
import {ENUMERATION_MAX_FRAME_RECORDS} from './capture'
import type {EnumerationTrial} from './generated/protocol'
const PREFIX='cognitive.enumeration.'
const reservationKey=(v:EnumerationReservation)=>PREFIX+'reserve.'+v.phase+'.'+v.trialIndex+'.'+v.exposureOrdinal
const recordKey=(v:EnumerationSavedRecord)=>PREFIX+'record.'+v.record.core.phase+'.'+v.record.core.plan.trialIndex+'.'+v.record.exposureOrdinal
const END_KEY=PREFIX+'ended.v1'
interface Retained {ended:boolean;endValue:unknown|null;pending:Map<string,EnumerationSavedRecord>}
const retained=new WeakMap<FinalDraftStore,Map<string,Retained>>()
export const enumerationNativeEnvelope=(core:EnumerationTrial):Record<string,unknown>=>({schemaVersion:1,trialIndex:core.plan.trialIndex,
 phase:'test',condition:String(core.plan.targetValue),startedAtPerfMs:core.startedAtPerfMs,endedAtPerfMs:core.endedAtPerfMs,
 durationMs:core.endedAtPerfMs-core.startedAtPerfMs,flags:{timeout:core.timedOut,premature:core.prematureInputs>0},
 qualityEvents:core.interruptions.filter(v=>v!=='viewport_changed'),payload:structuredClone(core)})
export interface NativeEnumerationPort extends EnumerationPersistencePort {
 snapshot():Promise<{formal:EnumerationSavedRecord[];practice:EnumerationSavedRecord[];hasReservations:boolean;ended:boolean}>
 recover():Promise<{complete:boolean}>
}
/** The normal runtime requires real IndexedDB; tests may explicitly replace that guard, never advertise Memory durability. */
export function createNativeEnumerationPort(expected:FinalDraftWriteIdentity,artifact:EnumerationArtifact,host:CognitiveNativeHost,
 currentOrigin:EnumerationPageOrigin,store:FinalDraftStore=finalDraftStore):NativeEnumerationPort {
 requireCognitiveDurability(store)
 const owner=structuredClone(expected),original=structuredClone(artifact),binding=enumerationLocalArtifact(owner,original)
 const ownerKey=JSON.stringify([owner.draftKey,owner.attemptEpoch,owner.definitionHash,owner.submissionId])
 let attempts=retained.get(store);if(!attempts){attempts=new Map();retained.set(store,attempts)}
 let state=attempts.get(ownerKey);if(!state){state={ended:false,endValue:null,pending:new Map()};attempts.set(ownerKey,state)}
 const own=state
 let finalActive:Promise<void>|null=null
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
 const read=async()=>{const meta=await store.get(owner.draftKey);if(!meta)throw Error('本地原记录不存在');assertFinalDraftWriteIdentity(meta,owner)
  if(!same(meta.frozenInstrumentArtifacts?.[ENUMERATION_LOCAL_ARTIFACT_KEY],binding))throw Error('本次原件与已冻结设置不一致');return meta}
 const checkRecord=(value:EnumerationSavedRecord)=>{
  const r=value?.record
  if(!r||value.recordHash!==enumerationDigest(r)||r.schemaVersion!==1||r.contextId!==original.context.contextId
   ||r.attemptId!==original.context.attemptId||r.artifactHash!==original.artifactHash
   ||r.core.phase!==r.core.plan.phase||!['test','practice'].includes(r.core.phase)
   ||!Number.isInteger(r.exposureOrdinal)||r.exposureOrdinal<0||r.exposureOrdinal>11||(r.core.phase==='test'&&r.exposureOrdinal!==0)
   ||r.raw.frames.length>ENUMERATION_MAX_FRAME_RECORDS||r.core.calibrationReference!==original.context.calibration!.id
   ||r.core.renderedStimulusReference!==original.artifactHash)throw Error('原记录与本次测验不一致')
  const plan=enumerationContextPlan(original.context,r.core.plan.trialIndex,r.core.phase)
  if(Object.keys(plan).some(k=>plan[k as keyof typeof plan]!==r.core.plan[k as keyof typeof plan]))throw Error('原记录试次不一致')
 }
 const receipt=(v:EnumerationSavedRecord)=>({contextId:v.record.contextId,exposureId:v.record.exposureId,recordHash:v.recordHash,accepted:true as const})
 const persist=async(v:EnumerationSavedRecord)=>{
  await read()
  const key=recordKey(v),meta=await store.get(owner.draftKey);if(!meta)throw Error('本地原记录不存在');assertFinalDraftWriteIdentity(meta,owner)
  const reservation=meta.frozenInstrumentArtifacts?.[PREFIX+'reserve.'+v.record.core.phase+'.'+v.record.core.plan.trialIndex+'.'+v.record.exposureOrdinal] as EnumerationReservation|undefined
  if(!reservation||reservation.exposureId!==v.record.exposureId||reservation.artifactHash!==v.record.artifactHash)throw Error('缺少原曝光预约')
  await store.freezeInstrumentArtifact(owner,key,v)
  if(own.pending.get(key)?.recordHash===v.recordHash)own.pending.delete(key)
  return receipt(v)
 }
 const snapshot=async()=>{
  const meta=await read(),slots=meta.frozenInstrumentArtifacts??{},records=new Map<string,EnumerationSavedRecord>()
  for(const [key,value] of Object.entries(slots))if(key.startsWith(PREFIX+'record.')){checkRecord(value as EnumerationSavedRecord);records.set(key,structuredClone(value as EnumerationSavedRecord))}
  for(const [key,value] of own.pending){const previous=records.get(key);if(previous&&!same(previous,value))throw Error('原记录冲突');records.set(key,structuredClone(value))}
  const all=[...records.values()]
  return {formal:all.filter(v=>v.record.core.phase==='test').sort((a,b)=>a.record.core.plan.trialIndex-b.record.core.plan.trialIndex),practice:all.filter(v=>v.record.core.phase==='practice'),
   hasReservations:Object.keys(slots).some(k=>k.startsWith(PREFIX+'reserve.')),ended:own.ended||Boolean(slots[END_KEY])||!same(currentOrigin,original.pageOrigin)}
 }
 const completeRecords=(data:Awaited<ReturnType<typeof snapshot>>)=>data.formal.length===original.context.config.totalTrials
  &&data.formal.every((v,i)=>v.record.core.plan.trialIndex===i)&&[0,1,2].every(i=>data.practice.some(v=>v.record.core.plan.trialIndex===i&&v.record.raw.completion==='confirmed'))
 const seal=async()=>{for(const value of [...own.pending.values()])await persist(value)
  const data=await snapshot();if(!completeRecords(data))throw Error('本次作答尚未完成，原记录已保留')
  await host.sealRaw({schemaVersion:1,artifact:original,formal:data.formal,practice:data.practice});return data}
 const finalize=()=>{
  if(finalActive)return finalActive
  const action=(async()=>{await seal();const r=await host.complete();if(r?.coreSaved!==true||r.sessionId!==owner.attemptId||r.attemptEpoch!==owner.attemptEpoch
   ||r.submissionId!==owner.submissionId||r.definitionHash!==owner.definitionHash)throw Error('提交尚未确认')})()
  finalActive=action;void action.then(()=>{if(finalActive===action)finalActive=null},()=>{if(finalActive===action)finalActive=null});return action
 }
 const port:NativeEnumerationPort={id:ownerKey,durability:{kind:'host_verified_browser_durable',verificationId:ownerKey},
  openAttempt:async request=>{const meta=await read();const matches=request.contextId===original.context.contextId&&request.attemptId===original.context.attemptId
    &&same(request.pageOrigin,original.pageOrigin)&&same(currentOrigin,original.pageOrigin)
   return {...request,state:!matches||own.ended||Boolean(meta.frozenInstrumentArtifacts?.[END_KEY])?'ended':'bound'}},
  endAttempt:request=>{if(request.attemptId!==original.context.attemptId||!same(request.pageOrigin,original.pageOrigin))throw Error('原结束记录归属不一致');own.ended=true;own.endValue??=structuredClone({...request,reason:request.reason.slice(0,256)})
   void store.freezeInstrumentArtifact(owner,END_KEY,own.endValue).catch(()=>{/* own ended remains synchronous; refresh cannot bind a different realm */})},
  retainArtifact:async candidate=>{if(!same(candidate,original))throw Error('不能更换原件');await store.freezeInstrumentArtifact(owner,ENUMERATION_LOCAL_ARTIFACT_KEY,binding)
   return {contextId:original.context.contextId,artifactHash:original.artifactHash,retained:true}},
  reserve:async value=>{const meta=await read();if(own.ended||meta.frozenInstrumentArtifacts?.[END_KEY]||!same(currentOrigin,original.pageOrigin))throw Error('本次作答已结束')
   if(value.contextId!==original.context.contextId||value.attemptId!==original.context.attemptId||value.artifactHash!==original.artifactHash
    ||!value.exposureId||value.exposureId.length>256||!Number.isInteger(value.exposureOrdinal)||value.exposureOrdinal<0||value.exposureOrdinal>11
    ||(value.phase==='test'&&value.exposureOrdinal!==0))throw Error('曝光预约不一致')
   enumerationContextPlan(original.context,value.trialIndex,value.phase)
   const frozen=await store.freezeInstrumentArtifact(owner,reservationKey(value),structuredClone(value))
   return {...value,state:frozen.created&&!own.ended?'new':'unresolved_exposure'}},
  retain:value=>{const originalValue=structuredClone(value);checkRecord(originalValue);const key=recordKey(originalValue),previous=own.pending.get(key)
   if(previous&&!same(previous,originalValue))return Promise.reject(Error('待存原记录不允许替换'))
   own.pending.set(key,originalValue);return persist(originalValue)},
  onTrialComplete:async(core,value)=>{checkRecord(value);if(!same(core,value.record.core)||value.record.core.phase!=='test')throw Error('正式原记录不一致')
   await persist(value);if(core.plan.trialIndex===original.context.config.totalTrials-1)await seal()
   if(await host.appendEnvelope(enumerationNativeEnvelope(core))===false)throw Error('本地正式记录尚未确认');return receipt(value)},
  onPracticeComplete:async value=>{checkRecord(value);if(value.record.core.phase!=='practice')throw Error('练习与正式记录不可混用');await persist(value);return receipt(value)},
  complete:async request=>{const data=await snapshot(),hashes=[...data.practice,...data.formal].map(v=>v.recordHash)
   if(request.contextId!==original.context.contextId||request.attemptId!==original.context.attemptId||request.artifactHash!==original.artifactHash||!same(request.recordHashes,hashes))throw Error('最终原包不一致')
   await finalize();return {...request,confirmed:true}},
  snapshot,
  recover:async()=>{for(const value of [...own.pending.values()])await persist(value)
   const data=await snapshot();for(const value of data.formal){if(value.record.core.plan.trialIndex===original.context.config.totalTrials-1)await seal()
    if(await host.appendEnvelope(enumerationNativeEnvelope(value.record.core as EnumerationTrial))===false)throw Error('本地正式记录尚未确认')}
   if(!completeRecords(data))return {complete:false};await finalize();return {complete:true}},
 }
 return port
}
