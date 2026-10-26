import {act,renderHook,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {finalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {cognitiveRawDigest} from '../raw-archive'
import {useCognitiveSession} from '../useCognitiveSession'
import {motConfig} from '../../tasks/mot/generated/protocol'
import type {CognitiveSessionApi} from '../../api'
import type {CognitiveSession} from '../../types'
// These are lifecycle unit fixtures; real IndexedDB durability is separately required by runtime.
vi.mock('../raw-archive',async()=>{
 const actual=await vi.importActual<typeof import('../raw-archive')>('../raw-archive')
 return {...actual,requireCognitiveDurability:vi.fn(),sealCognitiveArchive:async(key:string,raw:unknown)=>{
  const meta=await finalDraftStore.get(key);if(!meta)throw Error('missing')
  return finalDraftStore.mutateCognitiveArchive(key,actual.cognitiveArchiveIdentity(meta),{kind:'seal',rawPayload:raw,rawSha256:actual.cognitiveRawDigest(raw)})
 }}
})
function fixture(id:string){
 const config=motConfig('experience'),hash='a'.repeat(64),sig='b'.repeat(64)
 const protocol={schemaVersion:1 as const,key:'mot/1.1.1/1.1.0',version:'1.1.1',clock:'performance' as const,randomizationAlgorithmVersion:'mot-fnv1a-mulberry32-v1',trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
 const session:CognitiveSession={sessionId:id,assignmentId:'a',testType:'mot',attemptNo:1,attemptEpoch:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',nativeTask:true,definitionHash:hash,configVersion:'1.0.0',engineVersion:'1.1.1',scoringVersion:'1.1.0',config:{...config},randomSeed:'seed',protocol,protocolSignature:sig,sessionSnapshot:{schemaVersion:1,frozenAt:'2026-10-26T00:00:00Z',testType:'mot',engineVersion:'1.1.1',scoringVersion:'1.1.0',configVersion:'1.0.0',config:{...config},configHash:hash,protocol,protocolSignature:sig}}
 const getSession=vi.fn(async()=>({code:0,data:session})),submitFinal=vi.fn(async(_id:string,input:any)=>({code:0,data:{coreSaved:true,sessionId:id,attemptEpoch:1,submissionId:input.submissionId,definitionHash:hash,payloadHash:'c'.repeat(64),response:{sessionId:id,status:'COMPLETED',result:{metrics:{validTrialCount:1},qualityFlags:{},report:{test:'authoritative'}}}}}))
 const api={getSession,submitFinal,archiveRaw:vi.fn(),appendTrial:vi.fn(),completeSession:vi.fn()} as unknown as CognitiveSessionApi
 return {session,api,submitFinal,getSession}
}
const envelope={schemaVersion:1,trialIndex:0,phase:'test',startedAtPerfMs:12,endedAtPerfMs:10020,durationMs:10008,flags:{timeout:false,premature:false},qualityEvents:[],payload:{raw:'original'}}
describe('native MOT hook submission lifecycle',()=>{
 it('local ACK keeps true captured clocks; duplicate callback is idempotent; real core ACK retains raw',async()=>{
  const f=fixture('mot-hook-ok'),{result,unmount}=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(result.current.state.status).toBe('READY'))
  act(()=>result.current.start())
  await act(async()=>{expect(await result.current.nativeHost.appendEnvelope(envelope)).toBe(true)})
  expect(result.current.state.trialIndex).toBe(1);expect(f.submitFinal).not.toHaveBeenCalled()
  await act(async()=>{expect(await result.current.nativeHost.appendEnvelope(structuredClone(envelope))).toBe(true)})
  expect(result.current.state.trialIndex).toBe(1)
  const key='cognitive:'+f.session.sessionId
  expect((await finalDraftStore.listTrials(key))[0].payload).toEqual(envelope)
  const raw={schemaVersion:1,formal:[{core:envelope.payload,raw:{frames:[1,2,3]}}],practice:[]}
  await act(async()=>{await result.current.nativeHost.sealRaw(raw);expect((await result.current.nativeHost.complete()).coreSaved).toBe(true)})
  expect(result.current.state.status).toBe('COMPLETED');expect(f.submitFinal).toHaveBeenCalledTimes(1)
  expect(f.submitFinal.mock.calls[0][1].trials).toEqual([envelope])
  expect((await finalDraftStore.get(key))?.cognitiveRawArchive).toMatchObject({coreSaved:true,archiveConfirmed:false,rawSha256:cognitiveRawDigest(raw)})
  unmount();await finalDraftStore.delete(key)
 })
 it('void FINAL/local ACK cannot claim saved; sealed retry has same submission and original trials',async()=>{
  const f=fixture('mot-hook-retry');f.submitFinal.mockImplementationOnce(async()=>({code:0,data:undefined}) as any)
  const {result,unmount}=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(result.current.state.status).toBe('READY'));act(()=>result.current.start())
  await act(async()=>{await result.current.nativeHost.appendEnvelope(envelope);await result.current.nativeHost.sealRaw({schemaVersion:1,formal:[1],practice:[]})})
  await act(async()=>{await expect(result.current.nativeHost.complete()).rejects.toThrow('尚未确认')})
  const first=f.submitFinal.mock.calls[0][1]
  await act(async()=>{expect((await result.current.nativeHost.complete()).coreSaved).toBe(true)})
  expect(f.submitFinal.mock.calls[1][1]).toEqual(first)
  expect((await finalDraftStore.listTrials('cognitive:'+f.session.sessionId)).length).toBe(1)
  unmount();await finalDraftStore.delete('cognitive:'+f.session.sessionId)
 })
 it('complete local formal set survives reload and submits without any new exposure',async()=>{
  const f=fixture('mot-hook-all-local'),first=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(first.result.current.state.status).toBe('READY'));act(()=>first.result.current.start())
  for(let i=0;i<9;i++)await act(async()=>{await first.result.current.nativeHost.appendEnvelope({...envelope,trialIndex:i})})
  await act(async()=>{await first.result.current.nativeHost.sealRaw({schemaVersion:1,formal:Array.from({length:9},(_,trialIndex)=>({trialIndex})),practice:[]})})
  first.unmount()
  const second=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(second.result.current.state.trialIndex).toBe(9))
  expect(second.result.current.state.status).toBe('READY')
  await act(async()=>{expect((await second.result.current.nativeHost.complete()).coreSaved).toBe(true)})
  expect(f.submitFinal).toHaveBeenCalledTimes(1);expect(f.submitFinal.mock.calls[0][1].trials).toHaveLength(9)
  second.unmount()
 })
 it('authoritative core report still completes if local archive-status update fails',async()=>{
  const f=fixture('mot-hook-local-state-failure'),{result,unmount}=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(result.current.state.status).toBe('READY'));act(()=>result.current.start())
  await act(async()=>{await result.current.nativeHost.appendEnvelope(envelope);await result.current.nativeHost.sealRaw({schemaVersion:1,formal:[1],practice:[]})})
  const original=finalDraftStore.mutateCognitiveArchive.bind(finalDraftStore)
  const write=vi.spyOn(finalDraftStore,'mutateCognitiveArchive').mockImplementation(async(key,id,mutation)=>{if(mutation.kind==='core-saved')throw Error('synthetic local write failure');return original(key,id,mutation)})
  await act(async()=>{expect((await result.current.nativeHost.complete()).coreSaved).toBe(true)})
  expect(result.current.state.status).toBe('COMPLETED');expect((await finalDraftStore.get('cognitive:'+f.session.sessionId))?.cognitiveRawArchive?.archiveConfirmed).toBe(false)
  write.mockRestore();unmount()
 })
 it('native contract/unsupported public entry blocks before exposure',async()=>{
  const f=fixture('mot-hook-public');delete f.api.archiveRaw
  const {result,unmount}=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(result.current.state.status).toBe('ERROR'))
  expect(result.current.state.error?.message).toContain('入口');expect(f.submitFinal).not.toHaveBeenCalled();unmount()
 })
})
