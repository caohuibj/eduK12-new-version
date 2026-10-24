import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const harness=vi.hoisted(()=>({prepare:vi.fn(async()=>{})}))
vi.mock('./SurveyCognitiveUnit',()=>({SurveyCognitiveUnit:()=>null}))
vi.mock('../modules/cognitive/tasks/gonogo/gonogo.registry',()=>({gonogoRegistryEntry:{prepareRunner:harness.prepare}}))
beforeEach(()=>{vi.resetModules();harness.prepare.mockReset().mockResolvedValue(undefined);vi.stubGlobal('fetch',vi.fn(()=>{throw Error('Code preparation must not call APIs')}))})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers()})
describe('Survey participant code preparation',()=>{
 it('shares a code-only preparation and its exact unit module with later rendering',async()=>{
  const loading=await import('./participant-loading')
  const first=loading.prepareSurveyCognitive(),second=loading.prepareSurveyCognitive()
  expect(first).toBe(second);await first
  expect(harness.prepare).toHaveBeenCalledOnce()
  expect(loading.loadSurveyCognitiveUnit()).toBe(loading.loadSurveyCognitiveUnit())
  await loading.prepareSurveyCognitive();expect(harness.prepare).toHaveBeenCalledOnce()
  expect(fetch).not.toHaveBeenCalled()
 })
 it('allows normal preparation to retry after a failed speculative download',async()=>{
  harness.prepare.mockRejectedValueOnce(Error('offline'))
  const loading=await import('./participant-loading')
  await expect(loading.prepareSurveyCognitive()).rejects.toThrow('offline')
  await expect(loading.prepareSurveyCognitive()).resolves.toBeUndefined()
  expect(harness.prepare).toHaveBeenCalledTimes(2);expect(fetch).not.toHaveBeenCalled()
 })
 it('cancels an idle callback when its page state changes before preparation',async()=>{
  const request=vi.fn(()=>12),cancel=vi.fn(),work=vi.fn()
  vi.stubGlobal('requestIdleCallback',request);vi.stubGlobal('cancelIdleCallback',cancel)
  const {scheduleParticipantIdle}=await import('./participant-loading')
  const stop=scheduleParticipantIdle(work);expect(request).toHaveBeenCalledWith(expect.any(Function),{timeout:1000})
  stop();expect(cancel).toHaveBeenCalledWith(12);expect(work).not.toHaveBeenCalled()
 })
 it('defers and cancels work on browsers without idle callbacks',async()=>{
  vi.useFakeTimers();vi.stubGlobal('requestIdleCallback',undefined)
  const {scheduleParticipantIdle}=await import('./participant-loading'),work=vi.fn()
  const cancel=scheduleParticipantIdle(work);expect(work).not.toHaveBeenCalled();cancel()
  vi.advanceTimersByTime(250);expect(work).not.toHaveBeenCalled()
  scheduleParticipantIdle(work);vi.advanceTimersByTime(250);expect(work).toHaveBeenCalledOnce()
 })
})
