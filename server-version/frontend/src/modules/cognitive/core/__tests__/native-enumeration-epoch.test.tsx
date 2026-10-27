import {act,renderHook,waitFor} from '@testing-library/react'
import {describe,it,expect,vi} from 'vitest'
import {finalDraftStore,createFinalDraftMeta} from '../../../../services/persistence/finalDraftStore'
import {useCognitiveSession,cognitiveDraftKey} from '../useCognitiveSession'
import {useAdministrationProvenance} from '../useAdministrationProvenance'
import {cognitiveRawDigest} from '../raw-archive'
import {enumerationRecipeConfig,ENUMERATION_RECIPE_IDENTITY as id} from '../../tasks/enumeration/generated/protocol'
import type {CognitiveSession} from '../../types'
import type {CognitiveSessionApi} from '../../api'
// Hook lifecycle only; actual IndexedDB will be exercised by the product browser journey.
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
function fixture(sid:string,epoch:number):CognitiveSession {
 const config=enumerationRecipeConfig('experience'),protocol={schemaVersion:1 as const,key:id.protocolKey,version:'0.1.0',clock:'performance' as const,
  randomizationAlgorithmVersion:id.randomizationAlgorithmVersion,trialEnvelopeVersion:1 as const,phases:[{key:'test' as const,persists:true,required:true}],measurementCriticalConfigPaths:['*']}
 const configHash=cognitiveRawDigest(config),protocolSignature=cognitiveRawDigest(protocol)
 return {sessionId:sid,assignmentId:'synthetic',testType:'enumeration',engineVersion:id.engineVersion,scoringVersion:id.scoringVersion,configVersion:id.configVersion,
  nativeTask:true,attemptNo:epoch,attemptEpoch:epoch,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',config:{...config},definitionHash:configHash,randomSeed:'synthetic-epoch-'+epoch,protocol,protocolSignature,
  sessionSnapshot:{schemaVersion:1,frozenAt:'2026-10-26T00:00:00Z',testType:'enumeration',engineVersion:id.engineVersion,scoringVersion:id.scoringVersion,configVersion:id.configVersion,config:{...config},configHash,protocol,protocolSignature}}
}
async function meta(s:CognitiveSession){const m=createFinalDraftMeta({draftKey:cognitiveDraftKey(s),instrument:'cognitive',attemptId:s.sessionId,attemptEpoch:s.attemptEpoch!,definitionHash:s.definitionHash!,contextSnapshotHash:null,deliveryMode:'final_only',submissionId:'synthetic-provenance-'+s.attemptEpoch});await finalDraftStore.ensure(m);return m}
describe('native enumeration epoch consumers',()=>{
 it('loads a server-authorized new epoch on the same URL while preserving its old frozen original',async()=>{
  let session=fixture('synthetic-epoch-restart',1)
  const getSession=vi.fn(async()=>({code:0,data:session})),restartSession=vi.fn(async()=>{session=fixture(session.sessionId,2);return {code:0,data:session}})
  const api={getSession,restartSession,submitFinal:vi.fn(),archiveRaw:vi.fn()} as unknown as CognitiveSessionApi
  const hook=renderHook(()=>useCognitiveSession(session.sessionId,api))
  await waitFor(()=>expect(hook.result.current.state.status).toBe('READY'))
  const oldKey=cognitiveDraftKey(session),oldMeta=(await finalDraftStore.get(oldKey))!
  await finalDraftStore.freezeInstrumentArtifact(oldMeta,'synthetic-original',{raw:'retained'})
  await act(async()=>{await hook.result.current.restart()})
  await waitFor(()=>expect(hook.result.current.state.session?.attemptEpoch).toBe(2))
  expect(cognitiveDraftKey(session)).not.toBe(oldKey);expect((await finalDraftStore.get(oldKey))?.frozenInstrumentArtifacts?.['synthetic-original']).toEqual({raw:'retained'})
  expect((await finalDraftStore.get(cognitiveDraftKey(session)))?.attemptEpoch).toBe(2)
  expect(restartSession).toHaveBeenCalledTimes(1);hook.unmount()
 })
 it('persists actual observed input on the new key and resets provenance for a new epoch',async()=>{
  let session=fixture('synthetic-epoch-provenance',1);await meta(session)
  const hook=renderHook(()=>useAdministrationProvenance(session,'RUNNING'))
  const root=document.createElement('div');root.dataset.cognitiveTaskRoot='true';const button=document.createElement('button');root.append(button);document.body.append(root)
  const event=new Event('pointerdown',{bubbles:true});Object.defineProperty(event,'pointerType',{value:'touch'})
  act(()=>button.dispatchEvent(event))
  await waitFor(async()=>expect((await finalDraftStore.get(cognitiveDraftKey(session)))?.instrumentMetadata?.cognitiveAdministrationProvenance).toMatchObject({administrationMode:'TOUCH'}))
  session=fixture(session.sessionId,2);await meta(session);hook.rerender()
  await waitFor(async()=>expect((await finalDraftStore.get(cognitiveDraftKey(session)))?.instrumentMetadata?.cognitiveAdministrationProvenance).toMatchObject({administrationMode:'UNKNOWN'}))
  hook.unmount();root.remove()
 })
})
