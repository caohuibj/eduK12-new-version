// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finalDraftStore } from '../services/persistence/finalDraftStore'
import { cleanupExpiredSurveyCognitiveDrafts, holdSurveyCognitiveDraft } from './survey-cognitive-retention'
import { rememberSurveyCognitiveSession } from './survey-cognitive-local'
vi.mock('../services/persistence/finalDraftStore',()=>({finalDraftStore:{
  listSurveyCognitiveDrafts:vi.fn(),expireSurveyCognitiveDraft:vi.fn(),
}}))

function installLocks(){
  const held=new Map<string,number>()
  const request=vi.fn(async(name:string,options:LockOptions,callback:(lock:unknown)=>unknown)=>{
    if(options.signal?.aborted)throw new DOMException('aborted','AbortError')
    if(options.ifAvailable&&held.has(name))return callback(null)
    held.set(name,(held.get(name)??0)+1)
    try{return await callback({name,mode:options.mode})}
    finally{const count=(held.get(name)??1)-1;if(count)held.set(name,count);else held.delete(name)}
  })
  Object.defineProperty(navigator,'locks',{configurable:true,value:{request}})
  return {held,request}
}
const original=Object.getOwnPropertyDescriptor(navigator,'locks')
beforeEach(()=>{
  localStorage.clear();vi.resetAllMocks()
  vi.mocked(finalDraftStore.listSurveyCognitiveDrafts).mockResolvedValue({sessionIds:['stale','active','sealed'],nextCursor:null})
  vi.mocked(finalDraftStore.expireSurveyCognitiveDraft).mockResolvedValue(false)
})
afterEach(()=>{
  if(original)Object.defineProperty(navigator,'locks',original)
  else Reflect.deleteProperty(navigator,'locks')
})

describe('lazy Survey cognitive draft cleanup',()=>{
  it('cleans only discovered Survey candidates, passing explicit legacy ownership and an exclusive nonblocking lock',async()=>{
    const {request}=installLocks()
    rememberSurveyCognitiveSession('p','a','stale')
    localStorage.setItem('other-product:sessions',JSON.stringify([{sessionId:'outside'}]))
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(finalDraftStore.listSurveyCognitiveDrafts).toHaveBeenCalledWith(['stale'],null)
    expect(finalDraftStore.expireSurveyCognitiveDraft).toHaveBeenCalledWith('stale',true,expect.any(Number))
    expect(finalDraftStore.expireSurveyCognitiveDraft).toHaveBeenCalledWith('sealed',false,expect.any(Number))
    expect(request).toHaveBeenCalledWith('huisurvey:cognitive-draft:stale',{mode:'exclusive',ifAvailable:true},expect.any(Function))
    expect(localStorage.getItem('huisurvey:v1:cognitive-sessions:p')).toContain('stale')
  })

  it('protects a mounted session across cleanup, releases on interruption, and retries on a later open',async()=>{
    const {held}=installLocks(),controller=new AbortController()
    await holdSurveyCognitiveDraft('active',controller.signal)
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(vi.mocked(finalDraftStore.expireSurveyCognitiveDraft).mock.calls.map(([id])=>id)).toEqual(['stale','sealed'])
    controller.abort()
    await vi.waitFor(()=>expect(held.has('huisurvey:cognitive-draft:active')).toBe(false))
    vi.mocked(finalDraftStore.expireSurveyCognitiveDraft).mockClear()
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(finalDraftStore.expireSurveyCognitiveDraft).toHaveBeenCalledWith('active',false,expect.any(Number))
  })

  it('supports multiple active tabs and an explicit lease release without waiting for submission',async()=>{
    const {held}=installLocks(),one=new AbortController(),two=new AbortController()
    const release=await holdSurveyCognitiveDraft('active',one.signal)
    await holdSurveyCognitiveDraft('active',two.signal)
    release();await vi.waitFor(()=>expect(held.get('huisurvey:cognitive-draft:active')).toBe(1))
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(finalDraftStore.expireSurveyCognitiveDraft).not.toHaveBeenCalledWith('active',false,expect.any(Number))
    two.abort();await vi.waitFor(()=>expect(held.size).toBe(0))
  })

  it('retains safely without Web Locks and tolerates unavailable storage or a failed expiry',async()=>{
    Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})
    await expect(holdSurveyCognitiveDraft('active',new AbortController().signal)).resolves.toEqual(expect.any(Function))
    await expect(cleanupExpiredSurveyCognitiveDrafts()).resolves.toBeUndefined()
    expect(finalDraftStore.listSurveyCognitiveDrafts).not.toHaveBeenCalled()
    installLocks()
    vi.mocked(finalDraftStore.listSurveyCognitiveDrafts).mockRejectedValueOnce(new Error('storage blocked'))
    await expect(cleanupExpiredSurveyCognitiveDrafts()).resolves.toBeUndefined()
    vi.mocked(finalDraftStore.expireSurveyCognitiveDraft).mockRejectedValueOnce(new Error('transaction aborted'))
    await expect(cleanupExpiredSurveyCognitiveDrafts()).resolves.toBeUndefined()
    expect(finalDraftStore.expireSurveyCognitiveDraft).toHaveBeenCalledTimes(3)
  })

  it('does not leave a lease behind when the owning page closes before admission',async()=>{
    const {held}=installLocks(),controller=new AbortController();controller.abort()
    await expect(holdSurveyCognitiveDraft('active',controller.signal)).rejects.toMatchObject({name:'AbortError'})
    expect(held.size).toBe(0)
  })
  it('continues one bounded scan on the next open and wraps at the end',async()=>{
    installLocks()
    vi.mocked(finalDraftStore.listSurveyCognitiveDrafts).mockResolvedValueOnce({sessionIds:[],nextCursor:'cognitive:100'})
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(localStorage.getItem('huisurvey:v1:cognitive-retention-cursor')).toBe('cognitive:100')
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(finalDraftStore.listSurveyCognitiveDrafts).toHaveBeenLastCalledWith([],'cognitive:100')
    expect(localStorage.getItem('huisurvey:v1:cognitive-retention-cursor')).toBeNull()
  })

  it('continues a task after denied locks only after pausing cleanup for other documents',async()=>{
    vi.resetModules()
    const isolated=await import('./survey-cognitive-retention')
    const denied=vi.fn().mockRejectedValue(new DOMException('locks denied','SecurityError'))
    Object.defineProperty(navigator,'locks',{configurable:true,value:{request:denied}})
    await expect(isolated.holdSurveyCognitiveDraft('fresh',new AbortController().signal)).resolves.toEqual(expect.any(Function))
    expect(localStorage.getItem('huisurvey:v1:cognitive-retention-paused')).toBe('1')
    // A different module/document with working locks still sees the durable pause.
    installLocks()
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(finalDraftStore.listSurveyCognitiveDrafts).not.toHaveBeenCalled()
  })

  it('rechecks a cross-document pause after candidate discovery and before expiry',async()=>{
    installLocks()
    vi.mocked(finalDraftStore.listSurveyCognitiveDrafts).mockImplementationOnce(async()=>{
      localStorage.setItem('huisurvey:v1:cognitive-retention-paused','1')
      return {sessionIds:['stale'],nextCursor:null}
    })
    await cleanupExpiredSurveyCognitiveDrafts()
    expect(finalDraftStore.expireSurveyCognitiveDraft).not.toHaveBeenCalled()
  })

})
