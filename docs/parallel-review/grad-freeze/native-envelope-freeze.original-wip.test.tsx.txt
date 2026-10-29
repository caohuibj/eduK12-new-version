import {describe,it,expect,vi} from 'vitest'
import {createFinalDraftStore,createFinalDraftMeta} from '../../../../services/persistence/finalDraftStore'
import {createNativeContentPort} from '../native-content-port'
import {cognitiveRawDigest as digest} from '../raw-archive'
import {nativeCompletionFixture} from '../../../../../../backend/src/__tests__/cognitive/native-completion-fixture.test-support'
import type {CognitiveNativeHost} from '../runner.types'
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
it('freezes an asynchronous envelope once and reuses it after final failure and port reconstruction',async()=>{
 const f=nativeCompletionFixture('async-envelope-freeze'),store=createFinalDraftStore(),s=f.input.session
 const meta=createFinalDraftMeta({draftKey:'async-envelope-freeze',instrument:'cognitive',attemptId:'async-envelope-freeze',attemptEpoch:1,definitionHash:s.configHash,submissionId:'async-envelope-frozen-submit',contextSnapshotHash:null,deliveryMode:'final_only'})
 await store.ensure(meta)
 // These retained records exercise durable submission only; no task or scorer is rerun.
 const records=f.records.slice(0,1),{finalPayloadDigest:oldDigest,...oldBody}=f.claim,body={...oldBody,formalCount:1,termination:'aborted' as const,recordDigests:records.map((r:any)=>r.recordDigest)},claim={...body,finalPayloadDigest:digest(body)}
 const context={...f.detail.context,snapshot:s},binding={schemaVersion:1 as const,testType:s.testType,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,configVersion:s.configVersion,reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',profile:'experience' as const,state:'limited' as const,configHash:s.configHash,protocolSignature:s.protocolSignature}
 const report={...binding},nativeReport={...binding,report}
 const envelope=vi.fn(async(raw:unknown)=>{await Promise.resolve();return {schemaVersion:1,trialIndex:f.records.findIndex((r:any)=>digest(r.raw)===digest(raw)),phase:'test',payload:{transport:'synthetic-async-test',originalHash:digest(raw)}}})
 const adapter={manifest:()=>f.detail.manifest,envelope,freezeEnvelope:true as const,isReport:(v:unknown):v is typeof report=>digest(v)===digest(report)}
 const appendEnvelope=vi.fn(async()=>true),complete=vi.fn(async()=>({coreSaved:true as const,sessionId:meta.attemptId,attemptEpoch:1,definitionHash:meta.definitionHash,submissionId:meta.submissionId,payloadHash:'b'.repeat(64),nativeReport}))
 complete.mockRejectedValueOnce(Error('synthetic core unavailable'))
 const host={appendEnvelope,complete,sealRaw:vi.fn(async()=>{})} as unknown as CognitiveNativeHost
 const first=createNativeContentPort(meta,context,adapter,host,store)
 await first.prepareLocalAttempt(context,f.detail.manifest,f.detail.realm)
 for(const record of records)await first.persistLocalDraft(record)
 await expect(first.finalize(claim)).rejects.toThrow('synthetic core unavailable')
 expect(envelope).toHaveBeenCalledTimes(1)
 const firstEnvelopes=appendEnvelope.mock.calls.map((args:any[])=>structuredClone(args[0]))
 const second=createNativeContentPort(meta,context,{...adapter,envelope:vi.fn(async()=>{throw Error('must use frozen bytes')})},host,store)
 await expect(second.finalize(claim)).resolves.toMatchObject({finalSaved:true})
 expect(appendEnvelope.mock.calls.slice(1).map((args:any[])=>args[0])).toEqual(firstEnvelopes)
 const saved=await store.get(meta.draftKey),key='cognitive.native-envelope.'+f.records[0].recordKey
 expect(saved?.frozenInstrumentArtifacts?.[key]).toMatchObject({recordDigest:f.records[0].recordDigest,envelope:firstEnvelopes[0],envelopeDigest:digest(firstEnvelopes[0])})
})
