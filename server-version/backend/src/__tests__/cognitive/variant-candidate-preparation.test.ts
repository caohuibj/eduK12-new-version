import { beforeEach, describe, expect, it, vi } from 'vitest'
import { config as appConfig } from '../../config'
vi.mock('../../config/database', () => ({ prisma: {} }))
import { prepareUnifiedCognitiveSessionConfigSnapshot, persistPreparedUnifiedCognitiveSessionConfigSnapshot } from '../../modules/cognitive/session.service'
import { decryptCognitivePayload } from '../../modules/cognitive/cognitive.security'
const input = { testType:'fake',configVersion:'1.0.0',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:{trialCount:3,trialDurationMs:1000,allowPractice:false,maxRtMs:60000} }
beforeEach(() => {
  appConfig.cognitiveModuleEnabled=true
  vi.stubEnv('NODE_ENV','test');vi.stubEnv('COGNITIVE_TEST_FIXTURES_ENABLED','true')
  vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))
})
describe('weighted candidate Cognitive preparation',()=>{
  it('validates and freezes without writing unselected snapshots or children',async()=>{
    const db = new Proxy({}, {get(_target,key){throw new Error(`Unexpected database operation ${String(key)}`)}})
    const prepared=await prepareUnifiedCognitiveSessionConfigSnapshot({...input,db:db as any})
    expect(prepared.snapshot.config).toMatchObject({trialCount:3})
    expect(prepared.snapshot.compiledRuntime?.compiledRuntimeHash).toBe(prepared.compiledRuntime.compiledRuntimeHash)
    const selected=await persistPreparedUnifiedCognitiveSessionConfigSnapshot(prepared,{} as any)
    expect(decryptCognitivePayload(selected.encrypted)).toEqual(prepared.snapshot)
    expect(selected.compiledRuntime).toBe(prepared.compiledRuntime)
  })
  it('rejects malformed resolved profiles before a selected snapshot can be persisted',async()=>{
    await expect(prepareUnifiedCognitiveSessionConfigSnapshot({...input,config:{...input.config,trialCount:-1},db:{} as any})).rejects.toThrow()
  })
  it('rejects an unavailable exact registry version before persistence',async()=>{
    await expect(prepareUnifiedCognitiveSessionConfigSnapshot({...input,engineVersion:'missing',db:{} as any})).rejects.toThrow(/No Cognitive/)
  })
  it('checks the operational module gate for every candidate',async()=>{
    appConfig.cognitiveModuleEnabled=false
    await expect(prepareUnifiedCognitiveSessionConfigSnapshot({...input,db:{} as any})).rejects.toThrow(/暂不可用/)
  })
})
