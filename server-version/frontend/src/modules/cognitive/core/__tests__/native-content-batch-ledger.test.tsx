import {act,renderHook,waitFor} from '@testing-library/react'
import {it,expect,vi} from 'vitest'
import {useCognitiveSession,cognitiveDraftKey} from '../useCognitiveSession'
import {finalDraftStore} from '../../../../services/persistence/finalDraftStore'
import {nativeContentCases} from '../../../../../../backend/src/__tests__/cognitive/native-content-fixtures.test-support'
vi.mock('dotenv',()=>({default:{config:()=>({parsed:{}})}}))
vi.mock('../raw-archive',async()=>({...await vi.importActual<typeof import('../raw-archive')>('../raw-archive'),requireCognitiveDurability:vi.fn()}))
it('accepts one durable contiguous formal prefix within a single React update and rejects an index gap',async()=>{
 const f=nativeContentCases.find(f=>f.name==='hearts-flowers')!,session={sessionId:'content-batch-ledger',assignmentId:'a',testType:f.name,attemptNo:1,attemptEpoch:1,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',nativeTask:true,definitionHash:f.authority.configHash,engineVersion:f.authority.engineVersion,scoringVersion:f.authority.scoringVersion,configVersion:f.authority.configVersion,config:f.input.config,randomSeed:f.input.randomSeed,protocol:f.context.snapshot.protocol,protocolSignature:f.authority.protocolSignature,sessionSnapshot:f.context.snapshot} as any
 const api={getSession:vi.fn(async()=>({code:0,data:session})),submitFinal:vi.fn(),archiveRaw:vi.fn(),appendTrial:vi.fn(),completeSession:vi.fn()} as any
 const hook=renderHook(()=>useCognitiveSession(session.sessionId,api))
 await waitFor(()=>expect(hook.result.current.state.status).toBe('READY'));act(()=>hook.result.current.start())
 await act(async()=>{
  const host=hook.result.current.nativeHost
  for(const envelope of f.allTrials.slice(0,3))expect(await host.appendEnvelope(envelope)).toBe(true)
  await expect(host.appendEnvelope(f.allTrials[4])).rejects.toThrow('次序')
  expect(await host.appendEnvelope(f.allTrials[2])).toBe(true)
 })
 expect(hook.result.current.state.trialIndex).toBe(3)
 expect((await finalDraftStore.listTrials(cognitiveDraftKey(session))).map(r=>r.payload)).toEqual(f.allTrials.slice(0,3))
 expect(api.submitFinal).not.toHaveBeenCalled();hook.unmount();await finalDraftStore.delete(cognitiveDraftKey(session))
})
