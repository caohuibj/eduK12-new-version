import {act,renderHook,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {finalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {cognitiveRawDigest} from '../raw-archive'
import {nativeCompletionFromArchive} from '../native-completion'
import {useCognitiveSession} from '../useCognitiveSession'
import type {CognitiveSessionApi} from '../../api'
import type {CognitiveSession} from '../../types'
import {nativeCompletionFixture} from '../../../../../../backend/src/__tests__/cognitive/native-completion-fixture.test-support'
vi.mock('../raw-archive',async()=>{
 const actual=await vi.importActual<typeof import('../raw-archive')>('../raw-archive')
 return {...actual,requireCognitiveDurability:vi.fn(),sealCognitiveArchive:async(key:string,raw:unknown)=>{
  const meta=await finalDraftStore.get(key);if(!meta)throw Error('missing')
  return finalDraftStore.mutateCognitiveArchive(key,actual.cognitiveArchiveIdentity(meta),{kind:'seal',rawPayload:raw,rawSha256:actual.cognitiveRawDigest(raw)})
 }}
})
describe('locally sealed native completion in FINAL',()=>{
 it('submits the original aborted claim and keeps the exact sealed payload on retry',async()=>{
  const id='native-completion-hook',f=nativeCompletionFixture(id),s=f.input.session
  const session:CognitiveSession={sessionId:id,assignmentId:'a',testType:s.testType,attemptNo:1,attemptEpoch:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',nativeTask:true,definitionHash:s.configHash,configVersion:s.configVersion,engineVersion:s.engineVersion,scoringVersion:s.scoringVersion,config:s.config,randomSeed:f.input.randomSeed,protocol:s.protocol,protocolSignature:s.protocolSignature,sessionSnapshot:s}
  const submitFinal=vi.fn(async(_id:string,input:any)=>({code:0,data:{coreSaved:true,sessionId:id,attemptEpoch:1,submissionId:input.submissionId,definitionHash:s.configHash,payloadHash:'c'.repeat(64),response:{sessionId:id,status:'COMPLETED',result:{metrics:{validTrialCount:32},quality:{state:'limited'},report:{}}}}}))
  submitFinal.mockImplementationOnce(async()=>({code:0,data:undefined}) as any)
  const api={getSession:vi.fn(async()=>({code:0,data:session})),submitFinal,archiveRaw:vi.fn(),appendTrial:vi.fn(),completeSession:vi.fn()} as unknown as CognitiveSessionApi
  const hook=renderHook(()=>useCognitiveSession(id,api))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('READY'));act(()=>hook.result.current.start())
  for(const envelope of f.input.trials)await act(async()=>{await hook.result.current.nativeHost.appendEnvelope(envelope)})
  await act(async()=>{await hook.result.current.nativeHost.sealRaw(f.detail)})
  await act(async()=>{await expect(hook.result.current.nativeHost.complete()).rejects.toThrow('尚未确认')})
  const first=structuredClone(submitFinal.mock.calls[0][1])
  expect(first.nativeCompletion).toEqual(f.completion);expect(first.trials).toEqual(f.input.trials)
  await act(async()=>{expect((await hook.result.current.nativeHost.complete()).coreSaved).toBe(true)})
  expect(submitFinal.mock.calls[1][1]).toEqual(first)
  expect((await finalDraftStore.get('cognitive:'+id))?.cognitiveRawArchive?.rawSha256).toBe(cognitiveRawDigest(f.detail))
  hook.unmount();await finalDraftStore.delete('cognitive:'+id)
 })
 it('preserves old task formats and refuses a changed locally sealed claim',()=>{
  expect(nativeCompletionFromArchive({schemaVersion:1,formal:[],practice:[]})).toBeUndefined()
  expect(nativeCompletionFromArchive({kind:'COGNITIVE_ENUMERATION_RAW_V1'})).toBeUndefined()
  const f=nativeCompletionFixture();f.detail.claim.termination='completed'
  expect(()=>nativeCompletionFromArchive(f.detail)).toThrow('尚未核对')
 })
})
