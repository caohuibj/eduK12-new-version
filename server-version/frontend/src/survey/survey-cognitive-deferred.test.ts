// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'

const store=vi.hoisted(()=>({
  loaded:vi.fn(),delete:vi.fn(),listSurveyCognitiveDrafts:vi.fn(),expireSurveyCognitiveDraft:vi.fn(),
}))
vi.mock('../services/persistence/finalDraftStore',()=>{
  store.loaded()
  return {finalDraftStore:store}
})
const originalLocks=Object.getOwnPropertyDescriptor(navigator,'locks')
beforeEach(()=>{
  vi.resetModules();vi.clearAllMocks();store.loaded.mockReset();localStorage.clear()
  store.delete.mockResolvedValue(undefined)
  store.listSurveyCognitiveDrafts.mockResolvedValue({sessionIds:[],nextCursor:null})
  Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})
})
afterEach(()=>{
  if(originalLocks)Object.defineProperty(navigator,'locks',originalLocks)
  else Reflect.deleteProperty(navigator,'locks')
})
describe('Survey participant deferred cognitive persistence',()=>{
  it('does not load the durable store for registry reads, empty scoped cleanup, or unsupported locks',async()=>{
    const local=await import('./survey-cognitive-local')
    const retention=await import('./survey-cognitive-retention')
    local.rememberSurveyCognitiveSession('other-project','other-attempt','keep','other-owner')
    expect(local.readSurveyCognitiveSessionIds()).toEqual(['keep'])
    expect(await local.clearSurveyCognitiveSessions('project','attempt')).toBe(true)
    await retention.cleanupExpiredSurveyCognitiveDrafts()
    expect(store.loaded).not.toHaveBeenCalled()
    expect(store.delete).not.toHaveBeenCalled()
    expect(store.listSurveyCognitiveDrafts).not.toHaveBeenCalled()
    expect(local.readSurveyCognitiveSessionIds()).toEqual(['keep'])
  })
  it('does not load the durable store when browser-wide cleanup is paused',async()=>{
    const request=vi.fn()
    Object.defineProperty(navigator,'locks',{configurable:true,value:{request}})
    localStorage.setItem('huisurvey:v1:cognitive-retention-paused','1')
    const retention=await import('./survey-cognitive-retention')
    await retention.cleanupExpiredSurveyCognitiveDrafts()
    expect(store.loaded).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })
  it('retains registry and retry evidence when the deferred module cannot load',async()=>{
    const local=await import('./survey-cognitive-local')
    const retention=await import('./survey-cognitive-retention')
    local.rememberSurveyCognitiveSession('project','attempt','retry')
    store.loaded.mockImplementation(()=>{throw new Error('chunk unavailable')})
    expect(await local.clearSurveyCognitiveSessions('project','attempt')).toBe(false)
    expect(await local.clearSurveyCognitiveSession('project','retry')).toBe(false)
    Object.defineProperty(navigator,'locks',{configurable:true,value:{request:vi.fn()}})
    await expect(retention.cleanupExpiredSurveyCognitiveDrafts()).resolves.toBeUndefined()
    expect(local.readSurveyCognitiveSessionIds()).toEqual(['retry'])
    expect(store.delete).not.toHaveBeenCalled()
    expect(store.listSurveyCognitiveDrafts).not.toHaveBeenCalled()
  })
  it('loads on a real scoped deletion and keeps failed IDs for retry',async()=>{
    const local=await import('./survey-cognitive-local')
    local.rememberSurveyCognitiveSession('project','attempt','retry')
    expect(store.loaded).not.toHaveBeenCalled()
    store.delete.mockRejectedValueOnce(new Error('storage unavailable'))
    expect(await local.clearSurveyCognitiveSessions('project','attempt')).toBe(false)
    expect(store.loaded).toHaveBeenCalledTimes(1)
    expect(local.readSurveyCognitiveSessionIds()).toEqual(['retry'])
    expect(await local.clearSurveyCognitiveSessions('project','attempt')).toBe(true)
    expect(store.delete).toHaveBeenLastCalledWith('cognitive:retry')
    expect(local.readSurveyCognitiveSessionIds()).toEqual([])
  })
})
