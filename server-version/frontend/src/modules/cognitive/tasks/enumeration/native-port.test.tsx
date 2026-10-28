import React from 'react'
import {describe,it,expect,vi,afterEach} from 'vitest'
import {render,fireEvent,screen,waitFor,cleanup} from '@testing-library/react'
import {createFinalDraftStore,createFinalDraftMeta} from '../../../../services/persistence/finalDraftStore'
import type {CognitiveNativeHost,CognitiveTaskContext} from '../../core/runner.types'
import {enumerationArtifact,enumerationDigest,enumerationContextPlan,type EnumerationContext,type EnumerationCalibration as Calibration} from './display'
import {enumerationRecipeConfig,ENUMERATION_RECIPE_IDENTITY} from './generated/protocol'
import {enumerationFixtureContext} from './fixtures.test-support'
import {enumerationLocalArtifact,ENUMERATION_LOCAL_ARTIFACT_KEY} from './local-artifact'
import {createNativeEnumerationPort,enumerationNativeEnvelope} from './native-port'
import {EnumerationCapture} from './capture'
import {EnumerationPersistence} from './persistence'
import {EnumerationCalibration} from './EnumerationCalibration'
import {nativeEnumerationConfig} from './NativeEnumerationRunner'
// Explicit Memory contract fixture. Production createNativeEnumerationPort always checks real IndexedDB.
vi.mock('../../core/raw-archive',async()=>({...await vi.importActual<typeof import('../../core/raw-archive')>('../../core/raw-archive'),requireCognitiveDurability:vi.fn()}))
afterEach(()=>{cleanup();vi.restoreAllMocks()})
async function fixture(){
 const store=createFinalDraftStore(),config=enumerationRecipeConfig('experience')
 const meta=createFinalDraftMeta({draftKey:'cognitive:'+crypto.randomUUID(),instrument:'cognitive',attemptId:'real-session',attemptEpoch:1,definitionHash:'a'.repeat(64),submissionId:'actual-local-submission',contextSnapshotHash:null,deliveryMode:'final_only'})
 const source=enumerationFixtureContext(),context:EnumerationContext={...source,contextId:'native-unit-context',attemptId:JSON.stringify([meta.attemptId,meta.attemptEpoch]),usage:'AUTHENTICATED_CONTENT_CANDIDATE',config,
  calibration:{...source.calibration!,source:'self_reported_ruler_and_distance'},recipe:config.stimulusRecipe}
 const artifact=enumerationArtifact(context)
 await store.ensure(meta);await store.freezeInstrumentArtifact(meta,ENUMERATION_LOCAL_ARTIFACT_KEY,enumerationLocalArtifact(meta,artifact))
 const coreReceipt={coreSaved:true as const,sessionId:meta.attemptId,attemptEpoch:meta.attemptEpoch,submissionId:meta.submissionId,definitionHash:meta.definitionHash,payloadHash:'b'.repeat(64)}
 const host:CognitiveNativeHost={appendEnvelope:vi.fn(async()=>true),sealRaw:vi.fn(async()=>{}),complete:vi.fn(async()=>coreReceipt)}
 const port=createNativeEnumerationPort(meta,artifact,host,artifact.pageOrigin,store)
 return {store,meta,context,artifact,host,port,coreReceipt}
}
function exposure(f:Awaited<ReturnType<typeof fixture>>,index:number,phase:'practice'|'test'='test'){
 const capture=new EnumerationCapture(f.context,enumerationContextPlan(f.context,index,phase),phase+'-'+index,f.artifact.artifactHash,0)
 capture.frame(10);capture.frame(1010);capture.frame(phase==='practice'?2010:1060);capture.frame(phase==='practice'?3010:2060);capture.confirm('touch',phase==='practice'?3110:2160)
 const record=capture.record(),value={record,recordHash:enumerationDigest(record)}
 const reservation={contextId:record.contextId,attemptId:record.attemptId,exposureId:record.exposureId,artifactHash:record.artifactHash,phase,trialIndex:index,exposureOrdinal:0}
 return {capture,value,reservation}
}
describe('native enumeration task port',()=>{
 it('atomic created receipt grants exactly one new exposure for concurrent reservations',async()=>{
  const f=await fixture(),e=exposure(f,0)
  const results=await Promise.all([f.port.reserve(e.reservation),f.port.reserve(e.reservation)])
  expect(results.map(v=>v.state).sort()).toEqual(['new','unresolved_exposure'])
  expect((await f.port.snapshot()).hasReservations).toBe(true)
 })
 it('same realm remount and new realm cannot restart ended/reserved exposures or replace original context',async()=>{
  const f=await fixture(),e=exposure(f,0);await f.port.reserve(e.reservation)
  const remount=createNativeEnumerationPort(f.meta,f.artifact,f.host,f.artifact.pageOrigin,f.store)
  expect((await remount.reserve(e.reservation)).state).toBe('unresolved_exposure')
  f.port.endAttempt({attemptId:f.context.attemptId,pageOrigin:f.artifact.pageOrigin,reason:'runner_restart'})
  expect((await remount.openAttempt({attemptId:f.context.attemptId,contextId:f.context.contextId,pageOrigin:f.artifact.pageOrigin})).state).toBe('ended')
  const nextRealm=createNativeEnumerationPort(f.meta,f.artifact,f.host,{...f.artifact.pageOrigin,pageInstanceId:'other-realm'},f.store)
  expect((await nextRealm.snapshot()).ended).toBe(true);await expect(nextRealm.reserve(exposure(f,1).reservation)).rejects.toThrow('已结束')
  expect((await f.store.get(f.meta.draftKey))?.frozenInstrumentArtifacts?.[ENUMERATION_LOCAL_ARTIFACT_KEY]).toEqual(enumerationLocalArtifact(f.meta,f.artifact))
 })
 it('synchronous retained original survives a local write failure and is saved by a later active port without exposure',async()=>{
  const f=await fixture(),e=exposure(f,0);await f.port.reserve(e.reservation)
  const original=f.store.freezeInstrumentArtifact.bind(f.store),spy=vi.spyOn(f.store,'freezeInstrumentArtifact').mockImplementationOnce(async()=>{throw Error('synthetic local fail')})
  await expect(f.port.retain(e.value)).rejects.toThrow('synthetic local fail');expect((await f.port.snapshot()).formal[0]).toEqual(e.value)
  spy.mockRestore()
  const recovered=createNativeEnumerationPort(f.meta,f.artifact,f.host,f.artifact.pageOrigin,f.store)
  expect(await recovered.recover()).toEqual({complete:false});expect(f.host.complete).not.toHaveBeenCalled()
  expect((await recovered.snapshot()).formal).toEqual([e.value]);expect(f.host.appendEnvelope).toHaveBeenCalledWith(enumerationNativeEnvelope(e.value.record.core as any))
  expect(original).toBeTypeOf('function')
 })
 it('bad record hashes/references and orphan record saves are rejected',async()=>{
  const f=await fixture(),e=exposure(f,0)
  await expect(f.port.retain(e.value)).rejects.toThrow('缺少原曝光预约')
  expect(()=>f.port.retain({...e.value,recordHash:'0'.repeat(64)})).toThrow('不一致')
  const changed=structuredClone(e.value);changed.record.core.calibrationReference='other';changed.recordHash=enumerationDigest(changed.record)
  expect(()=>f.port.retain(changed)).toThrow('不一致');expect(f.host.appendEnvelope).not.toHaveBeenCalled()
 })
 it('full original package seals before last core ACK; void FINAL fails and same package retries without new exposure',async()=>{
  const f=await fixture(),gate=new EnumerationPersistence(f.artifact,f.port)
  let sealed=false,lastWasSealed=false
  vi.mocked(f.host.sealRaw).mockImplementation(async()=>{sealed=true})
  vi.mocked(f.host.appendEnvelope).mockImplementation(async e=>{if(e.trialIndex===24)lastWasSealed=sealed;return true})
  const values=[]
  for(const phase of ['practice','test'] as const)for(let i=0;i<(phase==='practice'?3:25);i++){
   const e=exposure(f,i,phase);await gate.prepare(e.reservation);await gate.save(e.value.record);values.push(e.value)
  }
  expect(lastWasSealed).toBe(true);expect(f.host.appendEnvelope).toHaveBeenCalledTimes(25)
  const first=vi.mocked(f.host.sealRaw).mock.calls[0][0] as any
  expect(Object.keys(first)).toEqual(['schemaVersion','artifact','formal','practice']);expect(first.artifact).toEqual(f.artifact)
  expect(first.formal).toHaveLength(25);expect(first.practice).toHaveLength(3);expect(first.formal[0].recordHash).toBe(values[3].recordHash)
  expect(first.artifact.hashScheme).toBe('candidate-json-stringify-sha256-v1')
  vi.mocked(f.host.complete).mockResolvedValueOnce(undefined as any)
  await expect(gate.finalize()).rejects.toThrow('提交尚未确认');await gate.finalize()
  expect(f.host.complete).toHaveBeenCalledTimes(2);expect(f.host.appendEnvelope).toHaveBeenCalledTimes(25)
  for(const call of vi.mocked(f.host.sealRaw).mock.calls)expect(JSON.stringify(call[0])).toBe(JSON.stringify(first))
  expect((await f.store.get(f.meta.draftKey))?.frozenInstrumentArtifacts).toBeDefined()
 })
 it('native identity accepts the exact new tuple and opaque protocol literal while rejecting old tuple/config drift',()=>{
  const id=ENUMERATION_RECIPE_IDENTITY,config=enumerationRecipeConfig('experience'),protocol={schemaVersion:1 as const,key:id.protocolKey,version:'0.1.0',clock:'performance' as const,randomizationAlgorithmVersion:id.randomizationAlgorithmVersion,trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
  const context:CognitiveTaskContext={sessionId:'session',testType:id.testType,engineVersion:id.engineVersion,scoringVersion:id.scoringVersion,configVersion:id.configVersion,attemptNo:1,attemptEpoch:1,nativeTask:true,definitionHash:'a'.repeat(64),config:{...config},randomSeed:'actual-seed',sessionSnapshot:{schemaVersion:1,frozenAt:'2026-10-26T00:00:00Z',testType:id.testType,engineVersion:id.engineVersion,scoringVersion:id.scoringVersion,configVersion:id.configVersion,config:{...config},configHash:'a'.repeat(64),protocolSignature:'b'.repeat(64),protocol}}
  expect(nativeEnumerationConfig(context)).toEqual(config);expect(id.protocolKey).toBe('enumeration/0.1.0/0.1.0')
  expect(()=>nativeEnumerationConfig({...context,engineVersion:'0.1.0'})).toThrow();expect(()=>nativeEnumerationConfig({...context,config:{...config,totalTrials:100}})).toThrow()
 })
 it('calibration requires explicit measurement confirmation, uses actual seven fields, and adds no MOT distance range gate',async()=>{
  const confirmed=vi.fn(async(_value:Calibration)=>{});render(<EnumerationCalibration recipe={enumerationRecipeConfig('experience').stimulusRecipe} onConfirm={confirmed}/>)
  const button=screen.getByRole('button',{name:'确认校准'});expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('眼睛到屏幕的距离（毫米）'),{target:{value:'75'}})
  expect((button as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));expect((button as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button);await waitFor(()=>expect(confirmed).toHaveBeenCalledTimes(1))
  expect(confirmed.mock.calls[0][0]).toMatchObject({source:'self_reported_ruler_and_distance',referenceMm:50,referenceCssPx:190,viewingDistanceMm:75,viewportWidthCssPx:window.innerWidth,viewportHeightCssPx:window.innerHeight,devicePixelRatio:window.devicePixelRatio})
 })
 it('complete cannot confirm a full-looking package while its last captured original is still failing durable retention',async()=>{
  const f=await fixture(),values=[]
  const original=f.store.freezeInstrumentArtifact.bind(f.store)
  const failure=vi.spyOn(f.store,'freezeInstrumentArtifact').mockImplementation(async(expected,key,value)=>{
   if(key==='cognitive.enumeration.record.test.24.0')throw Error('synthetic persistent local quota failure')
   return original(expected,key,value)
  })
  for(const phase of ['practice','test'] as const)for(let i=0;i<(phase==='practice'?3:25);i++){
   const e=exposure(f,i,phase);await f.port.reserve(e.reservation);values.push(e.value)
   if(phase==='test'&&i===24)await expect(f.port.retain(e.value)).rejects.toThrow('synthetic persistent')
   else await f.port.retain(e.value)
  }
  expect((await f.port.snapshot()).formal).toHaveLength(25)
  await expect(f.port.complete({contextId:f.context.contextId,attemptId:f.context.attemptId,artifactHash:f.artifact.artifactHash,recordHashes:values.map(v=>v.recordHash)})).rejects.toThrow('synthetic persistent')
  expect(f.host.sealRaw).not.toHaveBeenCalled();expect(f.host.complete).not.toHaveBeenCalled();expect((await f.port.snapshot()).formal[24]).toEqual(values[27]);failure.mockRestore()
 })

 it('finished save stages its original before immediate disposal and never continues stale core callbacks',async()=>{
  const f=await fixture(),e=exposure(f,0),gate=new EnumerationPersistence(f.artifact,f.port)
  await gate.prepare(e.reservation)
  const retain=vi.spyOn(f.port,'retain'),pending=gate.save(e.value.record)
  expect(retain).toHaveBeenCalledTimes(1);gate.dispose()
  await expect(pending).rejects.toThrow('replaced')
  const next=createNativeEnumerationPort(f.meta,f.artifact,f.host,f.artifact.pageOrigin,f.store)
  expect((await next.snapshot()).formal).toEqual([e.value]);expect(f.host.appendEnvelope).not.toHaveBeenCalled();expect(f.host.complete).not.toHaveBeenCalled()
  await expect(next.reserve(e.reservation)).rejects.toThrow('已结束')
 })

})
