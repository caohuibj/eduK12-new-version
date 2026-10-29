import React from 'react'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotTask } from './MotTask'
import { MotCapture } from './capture'
import { MOT_IDENTITY, motConfig, motTrialPlan } from './generated/protocol'
import { motDraftKey, type MotDraftBinding, type MotDraftPort, type MotDraftRecord, type MotPending } from './draft'
import { claimMotRecovery, detachMotRecovery, listMotRetainedRecords, MOT_RETAINED_CONTEXT_LIMIT,
  readMotRetainedRecord, releaseMotRecovery, retainMotRecovery } from './context-retention'
const config = motConfig('experience'), seed = 'synthetic-context-switch-only'
const calibration = { version: 1 as const, method: 'ruler_and_distance_self_reported' as const, referenceMm: 50 as const,
  referenceCssPx: 190, viewingDistanceMm: 350, viewportWidthCssPx: 1024, viewportHeightCssPx: 768,
  devicePixelRatio: 1, visualViewportScale: 1, language: 'zh' as const }
let clock = 0, paint: FrameRequestCallback
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function binding(sessionId = 'context-A', attemptNo = 1): MotDraftBinding {
  return { sessionId, attemptNo, protocolKey: `mot/${MOT_IDENTITY.engineVersion}/${MOT_IDENTITY.scoringVersion}`,
    resolvedConfigHash: 'synthetic-frozen-config-hash', randomSeed: seed }
}
function draftFor(identity = binding()) {
  const records: MotDraftRecord[] = [], practices: MotDraftRecord[] = []
  let pending: MotPending | null = null
  const port: MotDraftPort = { binding: identity,
    pending: vi.fn(async () => pending), begin: vi.fn(async value => { pending = value }),
    append: vi.fn(async record => { if (!records.some(r => r.core.trialIndex === record.core.trialIndex)) records.push(structuredClone(record)); pending = null }),
    records: vi.fn(async () => structuredClone(records)), practices: vi.fn(async () => structuredClone(practices)),
    appendPractice: vi.fn(async record => { practices.push(structuredClone(record)) }) }
  return { port, records, practices }
}
/** Only construction/interrupt; no motion stream or timing qualification. Raw samples below are explicitly synthetic. */
function record(index = 8): MotDraftRecord {
  const capture = new MotCapture(config, motTrialPlan(config, seed, index), calibration, 0)
  capture.interrupt('runner_restart', 1)
  const result = capture.record(); result.raw.motionFrameTimesMs = [0, 16.7, 33.3]; return result
}
function retain(identity: MotDraftBinding, value = record(), phase: 'formal' | 'practice' = 'formal') {
  const owner = {}, slot = claimMotRecovery(identity, owner)
  retainMotRecovery(slot, phase, value); detachMotRecovery(slot, owner); return value
}
const callbacks = () => ({ core: vi.fn(async (_: MotDraftRecord['core']) => true), archive: vi.fn(async (_: { formal: readonly MotDraftRecord[]; practice: readonly MotDraftRecord[] }) => {}) })
function element(port: MotDraftPort, cb = callbacks(), index = 8) {
  return <MotTask config={config} randomSeed={seed} trialIndex={index} draft={port} onTrialComplete={cb.core} prepareFinalArchive={cb.archive} />
}
async function retryRetained() { fireEvent.click(screen.getByRole('button', { name: '重试保存原记录' })); await act(async () => { await Promise.resolve() }) }
function calibrate() { fireEvent.click(screen.getByRole('button', { name: '校准屏幕' })); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '确认校准' })) }
async function start() { fireEvent.click(screen.getByRole('button', { name: /^开始$/ })); await waitFor(() => expect(document.querySelector('[data-mot-stage="fixation"]')).not.toBeNull()) }
beforeEach(() => { clock = 0; vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { paint = callback; return 1 })); vi.stubGlobal('cancelAnimationFrame', vi.fn()) })
afterEach(async () => { await act(async () => { cleanup(); await Promise.resolve() })
  for (const value of listMotRetainedRecords()) releaseMotRecovery(claimMotRecovery(value.binding, {}))
  vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('MOT frozen context and stale asynchronous continuation repair', () => {
  it('keeps a delayed old append only in its original draft when attemptNo changes with the same seed', async () => {
    const old = draftFor(), next = draftFor(binding('context-A', 2)), oldCb = callbacks(), nextCb = callbacks(), wait = deferred<void>()
    const original = retain(old.port.binding)
    vi.mocked(old.port.append).mockImplementation(async value => { await wait.promise; old.records.push(structuredClone(value)) })
    const ui = render(element(old.port, oldCb)); await retryRetained(); await waitFor(() => expect(old.port.append).toHaveBeenCalledTimes(1))
    ui.rerender(element(next.port, nextCb)); expect(screen.getByRole('heading', { name: '跟住这5个目标' })).toBeInTheDocument()
    await act(async () => { wait.resolve(); await wait.promise })
    expect(old.records).toEqual([original]); expect(next.port.append).not.toHaveBeenCalled()
    expect(oldCb.core).not.toHaveBeenCalled(); expect(oldCb.archive).not.toHaveBeenCalled(); expect(nextCb.core).not.toHaveBeenCalled(); expect(nextCb.archive).not.toHaveBeenCalled()
    expect(readMotRetainedRecord(old.port.binding)).toMatchObject({ localSaved: true, record: original })
    expect(screen.getByRole('heading', { name: '跟住这5个目标' })).toBeInTheDocument(); expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
  it('stops before archive/core after a delayed old records read and a sessionId change', async () => {
    const old = draftFor(), next = draftFor(binding('context-B')), oldCb = callbacks(), nextCb = callbacks(), wait = deferred<MotDraftRecord[]>()
    retain(old.port.binding); vi.mocked(old.port.records).mockImplementation(() => wait.promise)
    const ui = render(element(old.port, oldCb)); await retryRetained(); await waitFor(() => expect(old.port.records).toHaveBeenCalledTimes(1))
    ui.rerender(element(next.port, nextCb)); await act(async () => { wait.resolve([record()]); await wait.promise })
    expect(old.port.practices).not.toHaveBeenCalled(); expect(oldCb.archive).not.toHaveBeenCalled(); expect(oldCb.core).not.toHaveBeenCalled(); expect(nextCb.core).not.toHaveBeenCalled()
    expect(document.querySelector('[data-mot-stage="intro"]')).not.toBeNull()
  })
  it('does not call core or move a new UI when an already invoked old archive finishes late', async () => {
    const old = draftFor(), next = draftFor({ ...binding(), resolvedConfigHash: 'different-real-config-binding' }), oldCb = callbacks(), nextCb = callbacks(), wait = deferred<void>()
    retain(old.port.binding); oldCb.archive.mockImplementation(() => wait.promise)
    const ui = render(element(old.port, oldCb)); await retryRetained(); await waitFor(() => expect(oldCb.archive).toHaveBeenCalledTimes(1))
    ui.rerender(element(next.port, nextCb)); await act(async () => { wait.resolve(); await wait.promise })
    expect(oldCb.core).not.toHaveBeenCalled(); expect(nextCb.archive).not.toHaveBeenCalled(); expect(nextCb.core).not.toHaveBeenCalled()
    expect(readMotRetainedRecord(old.port.binding)?.record.raw.motionFrameTimesMs).toEqual([0, 16.7, 33.3])
    expect(document.querySelector('[data-mot-stage="intro"]')).not.toBeNull()
  })
  it('freezes initial callbacks and bound draft methods during an equivalent-identity rerender without re-exposure', async () => {
    const old = draftFor(), oldCb = callbacks(), newer = callbacks(), wait = deferred<void>()
    retain(old.port.binding); vi.mocked(old.port.append).mockImplementation(() => wait.promise)
    const ui = render(element(old.port, oldCb)); await retryRetained(); await waitFor(() => expect(old.port.append).toHaveBeenCalledTimes(1))
    const replacements = draftFor({ ...old.port.binding })
    ui.rerender(element(replacements.port, newer))
    await act(async () => { wait.resolve(); await wait.promise })
    await waitFor(() => expect(oldCb.core).toHaveBeenCalledTimes(1))
    expect(oldCb.archive).toHaveBeenCalledTimes(1); expect(replacements.port.records).not.toHaveBeenCalled(); expect(replacements.port.append).not.toHaveBeenCalled(); expect(newer.core).not.toHaveBeenCalled(); expect(newer.archive).not.toHaveBeenCalled()
    expect(readMotRetainedRecord(old.port.binding)).toBeNull(); expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
  it('retains the exact raw across unmount and failed append, then explicitly retries the original record on remount', async () => {
    const old = draftFor(), oldCb = callbacks(), wait = deferred<void>(), original = retain(old.port.binding)
    vi.mocked(old.port.append).mockImplementation(() => wait.promise)
    const first = render(element(old.port, oldCb)); await retryRetained(); await waitFor(() => expect(old.port.append).toHaveBeenCalledTimes(1)); first.unmount()
    await act(async () => { wait.reject(new Error('synthetic storage denied')); await wait.promise.catch(() => {}) })
    expect(readMotRetainedRecord(old.port.binding)).toMatchObject({ localSaved: false, record: original }); expect(oldCb.core).not.toHaveBeenCalled()
    const fresh = draftFor({ ...old.port.binding }), freshCb = callbacks(); render(element(fresh.port, freshCb))
    expect(screen.getByRole('heading', { name: '有一份原记录等待保存' })).toBeInTheDocument(); await retryRetained()
    await waitFor(() => expect(freshCb.core).toHaveBeenCalledTimes(1))
    expect(fresh.port.append).toHaveBeenCalledTimes(1); expect(vi.mocked(fresh.port.append).mock.calls[0][0]).toEqual(original)
    expect(freshCb.core.mock.calls[0][0]).toEqual(original.core); expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
  it('reuses an in-flight original practice write on same-identity remount rather than appending it to a new port', async () => {
    const old = draftFor(), next = draftFor({ ...binding() }), wait = deferred<void>()
    const original = retain(old.port.binding, record(0), 'practice')
    vi.mocked(old.port.appendPractice).mockImplementation(async value => { await wait.promise; old.practices.push(structuredClone(value)) })
    const first = render(element(old.port, callbacks(), 0)); await retryRetained(); await waitFor(() => expect(old.port.appendPractice).toHaveBeenCalledTimes(1)); first.unmount()
    render(element(next.port, callbacks(), 0)); await retryRetained(); await act(async () => { wait.resolve(); await wait.promise })
    expect(await screen.findByRole('heading', { name: '练习已中断' })).toBeInTheDocument()
    expect(old.practices).toEqual([original]); expect(next.port.appendPractice).not.toHaveBeenCalled(); expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
  it('retains an interrupted capture and its existing raw on cleanup even when the original practice write fails', async () => {
    const old = draftFor(), cb = callbacks(); vi.mocked(old.port.appendPractice).mockRejectedValue(new Error('synthetic quota'))
    const ui = render(element(old.port, cb, 0)); calibrate(); await start()
    for (const now of [500, 1500, 1516.7]) act(() => { clock = now; paint(now) })
    const before = vi.mocked(requestAnimationFrame).mock.calls.length
    ui.unmount(); await act(async () => { await Promise.resolve() })
    const retained = readMotRetainedRecord(old.port.binding)!
    expect(retained.phase).toBe('practice'); expect(retained.localSaved).toBe(false)
    expect(retained.record.core.interruptions).toEqual(['runner_restart']); expect(retained.record.raw.motionFrameTimesMs).toEqual([0, 16.700000000000045])
    expect(old.port.appendPractice).toHaveBeenCalledTimes(1); expect(cb.core).not.toHaveBeenCalled()
    act(() => { clock = 1600; paint(clock) }); expect(requestAnimationFrame).toHaveBeenCalledTimes(before)
    expect(readMotRetainedRecord(old.port.binding)!.record).toEqual(retained.record)
  })
  it('prevents a delayed old preparation from creating a capture after its owner unmounts', async () => {
    const old = draftFor(), wait = deferred<MotPending | null>(); vi.mocked(old.port.pending).mockImplementation(() => wait.promise)
    const ui = render(element(old.port, callbacks(), 0)); calibrate(); fireEvent.click(screen.getByRole('button', { name: /^开始$/ }))
    await waitFor(() => expect(old.port.pending).toHaveBeenCalledTimes(1)); ui.unmount()
    await act(async () => { wait.resolve(null); await wait.promise })
    expect(old.port.begin).not.toHaveBeenCalled(); expect(old.port.appendPractice).not.toHaveBeenCalled(); expect(requestAnimationFrame).not.toHaveBeenCalled()
  })
  it('bounds retained contexts before capture without evicting an unresolved raw record', async () => {
    const identities = Array.from({ length: MOT_RETAINED_CONTEXT_LIMIT }, (_, i) => binding('budget-' + i))
    identities.forEach(identity => retain(identity, record(0)))
    const next = draftFor(binding('over-budget')); render(element(next.port, callbacks(), 0)); calibrate(); fireEvent.click(screen.getByRole('button', { name: /^开始$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('任务尚未开始')
    expect(next.port.pending).not.toHaveBeenCalled(); expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(listMotRetainedRecords()).toHaveLength(MOT_RETAINED_CONTEXT_LIMIT)
    for (const identity of identities) expect(readMotRetainedRecord(identity)?.record.raw.motionFrameTimesMs).toEqual([0, 16.7, 33.3])
  })
  it('keeps the original binding copy stable when a caller mutates its old port identity object', async () => {
    const old = draftFor(), cb = callbacks(), wait = deferred<void>(); retain(old.port.binding)
    vi.mocked(old.port.append).mockImplementation(() => wait.promise)
    const originalBinding = structuredClone(old.port.binding), ui = render(element(old.port, cb)); await retryRetained(); await waitFor(() => expect(old.port.append).toHaveBeenCalledTimes(1))
    ;(old.port.binding as MotDraftBinding).attemptNo = 7
    ui.rerender(element(old.port, callbacks())); await act(async () => { wait.resolve(); await wait.promise })
    expect(cb.core).not.toHaveBeenCalled(); expect(readMotRetainedRecord(originalBinding)?.binding).toEqual(originalBinding)
    expect(motDraftKey(old.port.binding)).not.toBe(motDraftKey(originalBinding))
  })
})

describe('MOT preparation and same-turn cleanup windows', () => {
  it('starts the original local append when finish and unmount occur before the saveGate microtask', async () => {
    const old = draftFor(), cb = callbacks(), ui = render(element(old.port, cb, 0)); calibrate(); await start()
    const frameCount = vi.mocked(requestAnimationFrame).mock.calls.length
    act(() => { clock = 100; window.dispatchEvent(new Event('blur')); ui.unmount() })
    await waitFor(() => expect(old.port.appendPractice).toHaveBeenCalledTimes(1))
    const retained = readMotRetainedRecord(old.port.binding)!
    expect(retained.localSaved).toBe(true); expect(retained.record.core.interruptions).toEqual(['window_blur'])
    expect(vi.mocked(old.port.appendPractice).mock.calls[0][0]).toEqual(retained.record)
    expect(cb.core).not.toHaveBeenCalled(); expect(cb.archive).not.toHaveBeenCalled()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(frameCount)
  })
  it('keeps an in-flight detached preparation reserved until it settles, blocking a same-identity new exposure', async () => {
    const old = draftFor(), next = draftFor({ ...binding() }), wait = deferred<MotPending | null>()
    vi.mocked(old.port.pending).mockImplementation(() => wait.promise)
    const ui = render(element(old.port, callbacks(), 0)); calibrate(); fireEvent.click(screen.getByRole('button', { name: /^开始$/ }))
    await waitFor(() => expect(old.port.pending).toHaveBeenCalledTimes(1)); ui.unmount()
    render(element(next.port, callbacks(), 0)); calibrate(); fireEvent.click(screen.getByRole('button', { name: /^开始$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('进度不一致')
    expect(next.port.pending).not.toHaveBeenCalled(); expect(requestAnimationFrame).not.toHaveBeenCalled()
    await act(async () => { wait.resolve(null); await wait.promise })
    expect(old.port.appendPractice).not.toHaveBeenCalled(); expect(old.port.begin).not.toHaveBeenCalled()
  })
})
