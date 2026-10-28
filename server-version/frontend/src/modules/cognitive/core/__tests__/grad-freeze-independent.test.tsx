import {it,expect,vi} from 'vitest'
import {createFinalDraftStore,createFinalDraftMeta,assertFinalDraftWriteIdentity} from '../../../../services/persistence/finalDraftStore'
import {createNativeContentPort,type NativePortAdapter} from '../native-content-port'
import {cognitiveRawDigest as digest} from '../raw-archive'
import {nativeCompletionFixture} from '../../../../../../backend/src/__tests__/cognitive/native-completion-fixture.test-support'
import type {CognitiveNativeHost} from '../runner.types'
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return {promise,resolve}}
async function setup(name:string){
 const f=nativeCompletionFixture(name),store=createFinalDraftStore(),s=f.input.session
 const meta=createFinalDraftMeta({draftKey:name,instrument:'cognitive',attemptId:name,attemptEpoch:1,definitionHash:s.configHash,submissionId:name+'-submit',contextSnapshotHash:null,deliveryMode:'final_only'})
 await store.ensure(meta)
 const records=f.records.slice(0,1),{finalPayloadDigest:_,...old}=f.claim,body={...old,formalCount:1,termination:'aborted' as const,recordDigests:records.map((r:any)=>r.recordDigest)},claim={...body,finalPayloadDigest:digest(body)}
 const context={...f.detail.context,snapshot:s},binding={schemaVersion:1 as const,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',profile:'experience' as const,state:'limited' as const,configHash:s.configHash,protocolSignature:s.protocolSignature},report={...binding},nativeReport={...binding,report}
 const adapter:NativePortAdapter<typeof context,unknown,typeof report>={manifest:()=>f.detail.manifest,envelope:async()=>({trialIndex:0,payload:{originalHash:digest(records[0].raw),wire:'stable'}}),freezeEnvelope:true,isReport:(v:unknown):v is typeof report=>digest(v)===digest(report)}
 const appendEnvelope=vi.fn(async(_envelope:Record<string,unknown>)=>true),complete=vi.fn(async()=>({coreSaved:true as const,sessionId:meta.attemptId,attemptEpoch:1,definitionHash:meta.definitionHash,submissionId:meta.submissionId,payloadHash:'b'.repeat(64),nativeReport})),host={appendEnvelope,complete,sealRaw:vi.fn(async()=>{})} as unknown as CognitiveNativeHost
 const make=(a=adapter,st=store)=>createNativeContentPort(meta,context,a,host,st),first=make()
 await first.prepareLocalAttempt(context,f.detail.manifest,f.detail.realm);await first.persistLocalDraft(records[0])
 return {store,meta,adapter,appendEnvelope,complete,host,make,claim,records,key:'cognitive.native-envelope.'+records[0].recordKey}
}
it('two reconstructed ports reuse the first frozen exact wire for the same record digest',async()=>{
 const f=await setup('two-port-wire'),a=deferred<Record<string,unknown>>(),b=deferred<Record<string,unknown>>(),startedA=deferred<void>(),startedB=deferred<void>()
 const pa=f.make({...f.adapter,envelope:async()=>{startedA.resolve();return a.promise}}).finalize(f.claim)
 await startedA.promise
 const pb=f.make({...f.adapter,envelope:async()=>{startedB.resolve();return b.promise}}).finalize(f.claim)
 const observed=pb.then(value=>({value,error:null}),error=>({value:null,error:String(error)}))
 await startedB.promise
 const rawHash=digest(f.records[0].raw),winner={trialIndex:0,payload:{originalHash:rawHash,wire:'representation-A'}}
 a.resolve(winner);await expect(pa).resolves.toMatchObject({finalSaved:true})
 b.resolve({trialIndex:0,payload:{originalHash:rawHash,wire:'representation-B'}})
 const result=await observed
 expect(result.error).toBeNull()
 expect(result.value).toMatchObject({finalSaved:true})
 expect(f.appendEnvelope.mock.calls.map(args=>args[0])).toEqual([winner,winner])
 expect((await f.store.get(f.meta.draftKey))?.frozenInstrumentArtifacts?.[f.key]).toMatchObject({recordDigest:f.records[0].recordDigest,envelope:winner})
})
it('reconstructed port reuses frozen wire after actual FINAL sealing and RETRY_PENDING',async()=>{
 const f=await setup('sealed-retry-wire')
 f.complete.mockImplementationOnce(async()=>{await f.store.sealForSubmission(f.meta.draftKey,()=>({exactFinal:true}),f.meta);await f.store.setStatus(f.meta.draftKey,'RETRY_PENDING',undefined,f.meta);throw Error('synthetic network failure after seal')})
 await expect(f.make().finalize(f.claim)).rejects.toThrow('synthetic network failure after seal')
 const sealed=await f.store.get(f.meta.draftKey);expect(sealed?.status).toBe('RETRY_PENDING');expect(sealed?.sealedSubmission?.payload).toEqual({exactFinal:true})
 const envelope=vi.fn(async()=>{throw Error('must not regenerate sealed wire')})
 await expect(f.make({...f.adapter,envelope}).finalize(f.claim)).resolves.toMatchObject({finalSaved:true})
 expect(envelope).not.toHaveBeenCalled();expect(f.appendEnvelope.mock.calls[1][0]).toEqual(f.appendEnvelope.mock.calls[0][0])
 expect((await f.store.get(f.meta.draftKey))?.sealedSubmission).toEqual(sealed?.sealedSubmission)
})
it('does not recover an async freeze failure from a different owner epoch',async()=>{
 const f=await setup('epoch-change-wire'),generated=deferred<Record<string,unknown>>(),started=deferred<void>();let changed=false
 // Boundary store models atomic owner supersession, not an allowed same-key store update.
 const changedMeta=()=>({...f.meta,attemptEpoch:2})
 const store={...f.store,get:async(key:string)=>changed?changedMeta():f.store.get(key),freezeInstrumentArtifact:async(expected:any,key:string,value:any)=>{if(changed)assertFinalDraftWriteIdentity(changedMeta(),expected);return f.store.freezeInstrumentArtifact(expected,key,value)}}
 const port=f.make({...f.adapter,envelope:async()=>{started.resolve();return generated.promise}},store as typeof f.store)
 const pending=port.finalize(f.claim);const observed=pending.then(()=>null,error=>String(error));await started.promise;changed=true;generated.resolve({trialIndex:0,payload:{wire:'old-epoch'}})
 expect(await observed).toMatch(/身份|identity|不一致/)
 expect(f.appendEnvelope).not.toHaveBeenCalled();expect(f.complete).not.toHaveBeenCalled();expect((await f.store.get(f.meta.draftKey))?.frozenInstrumentArtifacts?.[f.key]).toBeUndefined()
})
