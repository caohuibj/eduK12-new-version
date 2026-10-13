import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({
  client:{isReady:true,on:vi.fn(),connect:vi.fn(),eval:vi.fn(),get:vi.fn(),setEx:vi.fn()},
}))
vi.mock('redis',()=>({createClient:()=>state.client}))
vi.mock('../../utils/logger',()=>({logger:{warn:vi.fn(),error:vi.fn()}}))
beforeEach(()=>{
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV','production')
  vi.stubEnv('REDIS_URL','redis://127.0.0.1:6379/15')
  vi.stubEnv('POW_MAX_ACTIVE_CHALLENGES','3')
  state.client.isReady=true
  state.client.connect.mockResolvedValue(undefined)
  state.client.eval.mockImplementation(async (_script, options) => options.keys[0] === 'pow-issue:global:v1' ? 1 : [1,0])
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
describe('PoW bounded issuance and fail-closed errors',()=>{
  it('issues with an atomic shared inventory and unchanged challenge lifetime',async()=>{
    const {powService}=await import('../../services/powService')
    const challenge=await powService.generateChallenge(4)
    expect(challenge.difficulty).toBe(4)
    expect(challenge.challenge).toHaveLength(32)
    expect(state.client.eval).toHaveBeenCalledWith(expect.any(String),{
      keys:['pow:'+challenge.challenge,'pow:active:v1'],
      arguments:['300','3',challenge.challenge,JSON.stringify(challenge)],
    })
    expect(state.client.setEx).not.toHaveBeenCalled()
  })
  it('reports capacity backpressure without a fallback or an extra key write',async()=>{
    state.client.eval.mockImplementation(async (_script, options) => options.keys[0] === 'pow-issue:global:v1' ? 1 : [0,72])
    const {powService,POWCapacityError}=await import('../../services/powService')
    await expect(powService.generateChallenge()).rejects.toBeInstanceOf(POWCapacityError)
    await expect(powService.generateChallenge()).rejects.toMatchObject({retryAfterSeconds:72})
    expect(state.client.setEx).not.toHaveBeenCalled()
    expect(powService.getStats().totalChallenges).toBe(0)
  })
  it('keeps production closed on connection or issuance errors',async()=>{
    state.client.connect.mockRejectedValue(new Error('isolated connection failure'))
    const {powService}=await import('../../services/powService')
    await expect(powService.generateChallenge()).rejects.toThrow('POW 服务暂不可用')
    expect(powService.getStats().totalChallenges).toBe(0)
    state.client.connect.mockResolvedValue(undefined)
    state.client.eval.mockRejectedValue(new Error('isolated Redis failure'))
    await expect(powService.generateChallenge()).rejects.toThrow('isolated Redis failure')
    expect(powService.getStats().totalChallenges).toBe(0)
  })
  it.each([[1],[0,0],[0,301],[-1,0]])('rejects an invalid or failed atomic result %j',async(...result)=>{
    state.client.eval.mockImplementation(async (_script, options) => options.keys[0] === 'pow-issue:global:v1' ? 1 : result)
    const {powService}=await import('../../services/powService')
    await expect(powService.generateChallenge()).rejects.toThrow('POW 服务暂不可用')
    expect(powService.getStats().totalChallenges).toBe(0)
  })
  it('also bounds the offline fallback and releases capacity on consume or exact expiry',async()=>{
    vi.stubEnv('NODE_ENV','test')
    state.client.connect.mockRejectedValue(new Error('offline fixture'))
    vi.useFakeTimers()
    const {powService,POWCapacityError}=await import('../../services/powService')
    const first=await powService.generateChallenge(0)
    await powService.generateChallenge(0);await powService.generateChallenge(0)
    await expect(powService.generateChallenge(0)).rejects.toBeInstanceOf(POWCapacityError)
    expect(await powService.verifyPOW(first.challenge,'proof',0)).toBe(true)
    expect(await powService.verifyPOW(first.challenge,'proof',0)).toBe(false)
    await powService.generateChallenge(0)
    vi.advanceTimersByTime(300_001)
    expect(await powService.isChallengeValid(first.challenge)).toBe(false)
    await expect(powService.generateChallenge(4)).resolves.toMatchObject({difficulty:4})
    expect(powService.getStats().totalChallenges).toBe(1)
  })
})
