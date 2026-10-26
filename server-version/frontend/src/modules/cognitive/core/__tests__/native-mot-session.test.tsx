import {act,renderHook,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import React from 'react'
import {finalDraftStore,createFinalDraftStore,createFinalDraftMeta} from '../../../../services/persistence/finalDraftStore'
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


const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
describe('native host-generation followup',()=>{
 it.each(['list','put'] as const)('isolates delayed %s across the same session new epoch',async(stage)=>{
  const f=fixture('host-generation-'+stage),hook=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('READY'));act(()=>hook.result.current.start())
  const old=hook.result.current.nativeHost,key='cognitive:'+f.session.sessionId,gate=deferred<void>(),entered=deferred<void>()
  const list=finalDraftStore.listTrials.bind(finalDraftStore),put=finalDraftStore.putTrial.bind(finalDraftStore)
  const spy=stage==='list'?vi.spyOn(finalDraftStore,'listTrials').mockImplementationOnce(async k=>{const rows=await list(k);entered.resolve();await gate.promise;return rows})
   :vi.spyOn(finalDraftStore,'putTrial').mockImplementationOnce(async(r,expected)=>{entered.resolve();await gate.promise;return put(r,expected)})
  const pending=old.appendEnvelope(envelope);const settled=Promise.allSettled([pending]);await entered.promise
  await finalDraftStore.delete(key)
  f.getSession.mockResolvedValue({code:0,data:{...f.session,attemptNo:2,attemptEpoch:2,randomSeed:'seed-epoch-2'}})
  act(()=>hook.result.current.reload());await waitFor(()=>expect(hook.result.current.state.session?.attemptEpoch).toBe(2))
  await act(async()=>{gate.resolve();expect((await settled)[0].status).toBe('rejected')})
  expect(hook.result.current.state.trialIndex).toBe(0);expect(hook.result.current.state.status).toBe('READY');expect(await list(key)).toEqual([])
  await expect(old.appendEnvelope(envelope)).rejects.toThrow('身份已变化');await expect(old.sealRaw({old:true})).rejects.toThrow('身份已变化')
  expect(f.submitFinal).not.toHaveBeenCalled();spy.mockRestore();hook.unmount();await finalDraftStore.delete(key)
 })
 it('unmount lets an already-owned delayed save retain the old record without accepting new actions',async()=>{
  const f=fixture('host-generation-unmount-save'),hook=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('READY'));act(()=>hook.result.current.start())
  const old=hook.result.current.nativeHost,gate=deferred<void>(),entered=deferred<void>(),put=finalDraftStore.putTrial.bind(finalDraftStore)
  const spy=vi.spyOn(finalDraftStore,'putTrial').mockImplementationOnce(async(record,expected)=>{entered.resolve();await gate.promise;return put(record,expected)})
  const settled=Promise.allSettled([old.appendEnvelope(envelope)]);await entered.promise;hook.unmount();gate.resolve()
  expect((await settled)[0].status).toBe('rejected');expect((await finalDraftStore.listTrials('cognitive:'+f.session.sessionId))[0].payload).toEqual(envelope)
  await expect(old.appendEnvelope({...envelope,trialIndex:1})).rejects.toThrow('身份已变化');expect(f.submitFinal).not.toHaveBeenCalled();spy.mockRestore()
 })
 it.each(['reload-epoch','unmount'] as const)('late FINAL %s cannot complete a new host or clean its local metadata',async(mode)=>{
  const f=fixture('host-generation-final-'+mode),hook=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('READY'));act(()=>hook.result.current.start())
  await act(async()=>{await hook.result.current.nativeHost.appendEnvelope(envelope);await hook.result.current.nativeHost.sealRaw({schemaVersion:1,formal:[1],practice:[]})})
  const old=hook.result.current.nativeHost,key='cognitive:'+f.session.sessionId,gate=deferred<any>(),entered=deferred<void>()
  f.submitFinal.mockImplementationOnce(async()=>{entered.resolve();return gate.promise})
  const pending=old.complete(),settled=Promise.allSettled([pending]);await entered.promise
  const sealed=await finalDraftStore.get(key),submitted=f.submitFinal.mock.calls[0][1]
  if(mode==='unmount')hook.unmount()
  else{f.getSession.mockResolvedValue({code:0,data:{...f.session,attemptNo:2,attemptEpoch:2,randomSeed:'next-seed'}});act(()=>hook.result.current.reload());await waitFor(()=>expect(hook.result.current.state.status).toBe('ERROR'))}
  await act(async()=>{gate.resolve({code:0,data:{coreSaved:true,sessionId:f.session.sessionId,attemptEpoch:1,submissionId:submitted.submissionId,definitionHash:f.session.definitionHash,payloadHash:'c'.repeat(64),response:{sessionId:f.session.sessionId,status:'COMPLETED',result:{metrics:{},qualityFlags:{}}}}});expect((await settled)[0].status).toBe('rejected')})
  const retained=await finalDraftStore.get(key);expect(retained?.attemptEpoch).toBe(1);expect(retained?.status).toBe(sealed?.status);expect(retained?.cognitiveRawArchive?.coreSaved).toBe(false);expect(retained?.sealedSubmission).toEqual(sealed?.sealedSubmission)
  if(mode!=='unmount'){expect(hook.result.current.state.status).toBe('ERROR');hook.unmount()}
  expect(f.submitFinal).toHaveBeenCalledTimes(1)
 })
 it('StrictMode active generation completes once and retains real device/input provenance',async()=>{
  const f=fixture('host-generation-active'),hook=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api),{wrapper:({children})=><React.StrictMode>{children}</React.StrictMode>})
  await waitFor(()=>expect(hook.result.current.state.status).toBe('READY'));act(()=>hook.result.current.start())
  await act(async()=>{await hook.result.current.nativeHost.appendEnvelope(envelope);await hook.result.current.nativeHost.sealRaw({schemaVersion:1,formal:[1],practice:[]})})
  const provenance={schemaVersion:1 as const,deviceClass:'PHONE' as const,administrationMode:'TOUCH' as const}
  await act(async()=>expect((await hook.result.current.nativeHost.complete(provenance)).coreSaved).toBe(true))
  expect(hook.result.current.state.status).toBe('COMPLETED');expect(f.submitFinal).toHaveBeenCalledTimes(1);expect(f.submitFinal.mock.calls[0][1].administrationProvenance).toEqual(provenance);hook.unmount()
 })
 it('all native write/seal/status/delete CAS operations reject an old owner after same-key epoch replacement',async()=>{
  const store=createFinalDraftStore(),key='host-generation-CAS'
  const old=createFinalDraftMeta({draftKey:key,instrument:'cognitive',attemptId:'same-session',attemptEpoch:1,definitionHash:'a',submissionId:'old',deliveryMode:'final_only',contextSnapshotHash:null})
  await store.ensure(old);await store.delete(key)
  const next={...old,attemptEpoch:2,definitionHash:'b',submissionId:'new'};await store.ensure(next)
  await expect(store.putTrial({draftKey:key,trialIndex:0,payload:{old:true},createdAt:1},old)).rejects.toThrow()
  await expect(store.sealForSubmission(key,()=>({old:true}),old)).rejects.toThrow()
  await expect(store.setStatus(key,'CONFLICT',undefined,old)).rejects.toThrow()
  await expect(store.delete(key,old)).rejects.toThrow()
  expect((await store.get(key))?.attemptEpoch).toBe(2);expect((await store.get(key))?.status).toBe('DRAFT');expect(await store.listTrials(key)).toEqual([])
 })
 it('delayed sealed replay busy response cannot set status after same-session epoch reload',async()=>{
  const f=fixture('host-generation-sealed-replay'),key='cognitive:'+f.session.sessionId
  const meta=createFinalDraftMeta({draftKey:key,instrument:'cognitive',attemptId:f.session.sessionId,attemptEpoch:1,definitionHash:f.session.definitionHash!,submissionId:'original-replay',deliveryMode:'final_only',contextSnapshotHash:null})
  await finalDraftStore.ensure(meta);await finalDraftStore.putTrial({draftKey:key,trialIndex:0,payload:envelope,createdAt:1},meta)
  await finalDraftStore.sealForSubmission(key,s=>({submissionId:s.meta.submissionId,attemptEpoch:1,definitionHash:meta.definitionHash,trials:s.trials.map(t=>t.payload)}),meta)
  const gate=deferred<any>(),entered=deferred<void>();f.submitFinal.mockImplementationOnce(async()=>{entered.resolve();return gate.promise})
  const status=vi.spyOn(finalDraftStore,'setStatus'),hook=renderHook(()=>useCognitiveSession(f.session.sessionId,f.api))
  await entered.promise
  f.getSession.mockResolvedValue({code:0,data:{...f.session,attemptNo:2,attemptEpoch:2,randomSeed:'next-replay-seed'}})
  act(()=>hook.result.current.reload());await waitFor(()=>expect(hook.result.current.state.status).toBe('ERROR'))
  await act(async()=>{gate.resolve({code:'ASSESSMENT_SUBMIT_BUSY',message:'synthetic old response'});await gate.promise;await Promise.resolve();await Promise.resolve()})
  expect(status).not.toHaveBeenCalled();expect((await finalDraftStore.get(key))?.status).toBe('SUBMITTING');expect(hook.result.current.state.status).toBe('ERROR');expect(f.submitFinal).toHaveBeenCalledTimes(1)
  status.mockRestore();hook.unmount()
 })

})
