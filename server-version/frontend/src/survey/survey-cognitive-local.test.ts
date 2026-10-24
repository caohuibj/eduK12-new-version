import { clearSurveySituationalSessions,rememberSurveySituationalSession } from './survey-situational-local'
import { beforeEach,describe,expect,it,vi } from 'vitest'
import { finalDraftStore } from '../services/persistence/finalDraftStore'
import { clearSurveyCognitiveSession,clearSurveyCognitiveSessions,rememberSurveyCognitiveSession } from './survey-cognitive-local'
vi.mock('../services/persistence/finalDraftStore',()=>({finalDraftStore:{delete:vi.fn().mockResolvedValue(undefined)}}))
beforeEach(()=>{localStorage.clear();vi.clearAllMocks()})
describe('Survey-only local cognitive cleanup',()=>{
  it('cleans completed/replaced sessions, then attempt withdrawal, without touching another wave or product',async()=>{
    rememberSurveyCognitiveSession('p','a1','old');rememberSurveyCognitiveSession('p','a1','replacement')
    rememberSurveyCognitiveSession('p','a2','next-wave','owner')
    rememberSurveyCognitiveSession('p','a3','another-person','different-owner');rememberSurveyCognitiveSession('other','a1','other-project')
    expect(await clearSurveyCognitiveSession('p','old')).toBe(true)
    expect(await clearSurveyCognitiveSessions('p','a1')).toBe(true)
    expect(vi.mocked(finalDraftStore.delete).mock.calls.map(([key])=>key)).toEqual(['cognitive:old','cognitive:replacement'])
    expect(await clearSurveyCognitiveSessions('p',undefined,[],'owner')).toBe(true)
    expect(vi.mocked(finalDraftStore.delete).mock.calls.map(([key])=>key)).toEqual(['cognitive:old','cognitive:replacement','cognitive:next-wave'])
    expect(localStorage.getItem('huisurvey:v1:cognitive-sessions:other')).toContain('other-project')
    expect(localStorage.getItem('huisurvey:v1:cognitive-sessions:p')).toContain('another-person')
  })
  it('retains failed cleanup IDs for a later scoped retry and includes in-memory IDs',async()=>{
    rememberSurveyCognitiveSession('p','a1','retry')
    vi.mocked(finalDraftStore.delete).mockRejectedValueOnce(new Error('storage blocked'))
    expect(await clearSurveyCognitiveSessions('p','a1')).toBe(false)
    expect(localStorage.getItem('huisurvey:v1:cognitive-sessions:p')).toContain('retry')
    expect(await clearSurveyCognitiveSessions('p','a1',['memory-only'])).toBe(true)
    expect(localStorage.getItem('huisurvey:v1:cognitive-sessions:p')).toBeNull()
    expect(finalDraftStore.delete).toHaveBeenCalledWith('cognitive:memory-only')
  })
})

it('cleans only the native SJT owner and retains failed cleanup for retry',async()=>{
  rememberSurveySituationalSession('p','a1','native','owner')
  rememberSurveySituationalSession('p','a2','other-native','other-owner')
  rememberSurveyCognitiveSession('p','a1','cognitive')
  vi.mocked(finalDraftStore.delete).mockRejectedValueOnce(new Error('blocked'))
  expect(await clearSurveySituationalSessions('p','a1')).toBe(false)
  expect(localStorage.getItem('huisurvey:v1:situational-sessions:p')).toContain('native')
  expect(await clearSurveySituationalSessions('p','a1',['memory-native'])).toBe(true)
  expect(finalDraftStore.delete).toHaveBeenCalledWith('situational:memory-native')
  expect(finalDraftStore.delete).not.toHaveBeenCalledWith('situational:other-native')
  expect(finalDraftStore.delete).not.toHaveBeenCalledWith('cognitive:cognitive')
  expect(localStorage.getItem('huisurvey:v1:situational-sessions:p')).toContain('other-native')
})
