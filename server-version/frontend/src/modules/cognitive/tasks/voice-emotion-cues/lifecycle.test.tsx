import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createVoiceSnapshot } from '../../../../../../backend/src/modules/cognitive/content-candidates/voice-emotion-cues/package'
import { scoreVoiceSubmission } from '../../../../../../backend/src/modules/cognitive/content-candidates/voice-emotion-cues/submission'
import { VoiceSession } from './session'
import { VoiceEmotionTask } from './VoiceEmotionTask'
import { digest, type Context, type Draft, type Ports, type Receipt } from './contracts'
import { asset, manifest, observe } from './generated/protocol'
vi.mock('./assets', () => ({ loadVoice: vi.fn() }))
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture() {
  const snapshot = createVoiceSnapshot('experience'), randomSeed = 'voice-disposal-boundary-only'
  const context: Context = { contextKey: 'old-disposal-attempt', language: 'zh', snapshot, randomSeed, manifestHash: digest(manifest(snapshot.config, randomSeed)) }
  const records = new Map<string, Draft>(), changed = vi.fn(); let clock = 100
  const retain = async (d: Draft) => { records.set(d.recordKey, structuredClone(d)); return { retained: true as const, contextKey: d.contextKey, recordKey: d.recordKey, recordDigest: d.recordDigest } }
  const ports: Ports = {
    prepareLocalAttempt: vi.fn(async (c, plans, realm) => ({ prepared: true as const, exclusive: true as const, contextKey: c.contextKey, bindingDigest: digest({ context: c, plans, realm }) })),
    persistLocalDraft: vi.fn(retain),
    finalize: vi.fn(async claim => ({ finalSaved: true as const, contextKey: context.contextKey, finalPayloadDigest: claim.finalPayloadDigest, receiptId: 'old-attempt-synthetic-receipt', report: scoreVoiceSubmission({ contextKey: context.contextKey, language: context.language, session: snapshot, randomSeed, realm: [...records.values()][0].realm, drafts: [...records.values()], claim }).report })),
  }
  const loader = vi.fn(async (p: Parameters<import('./assets').MediaLoader>[0]) => ({ url: 'blob:local-disposal-test', sha256: asset(p.assetId).sha256, dispose: vi.fn() }))
  return { context, ports, records, retain, changed, loader, get clock() { return clock }, set clock(t: number) { clock = t }, session: () => new VoiceSession(context, ports, changed, () => clock) }
}
async function prepareFormal(f: ReturnType<typeof fixture>, s: VoiceSession) {
  await s.prepare()
  for (let i = 0; i < 3; i++) {
    s.begin(); s.event({ kind: 'play', at: f.clock }); f.clock += 5000; s.event({ kind: 'ended', at: f.clock })
    f.clock++; s.event({ kind: 'activate', at: f.clock, choice: s.capture!.plan.emotion, input: 'assistive' }); await flush(); f.clock++
    if (i < 2) s.nextPractice()
  }
  s.startFormal(); expect(s.view).toBe('formal-ready')
}
afterEach(async () => { cleanup(); await flush(); vi.restoreAllMocks() })
describe('voice disposed in-flight ownership boundaries', () => {
  it('disposes an active formal capture through the original raw port once, without starting FINAL or using replacement ports', async () => {
    const f = fixture(), rawGate = deferred<Awaited<ReturnType<Ports['persistLocalDraft']>>>()
    const oldRaw = vi.fn(async (d: Draft) => d.raw.plan.phase === 'test' ? rawGate.promise : f.retain(d))
    f.ports.persistLocalDraft = oldRaw
    const oldFinal = f.ports.finalize, s = f.session(); await prepareFormal(f, s); s.begin(); s.event({ kind: 'play', at: f.clock }); f.clock += 100
    const newRaw = vi.fn(), newFinal = vi.fn(); f.ports.persistLocalDraft = newRaw; f.ports.finalize = newFinal
    f.changed.mockClear(); s.dispose()
    const captured = oldRaw.mock.calls.at(-1)![0]
    expect(captured.contextKey).toBe(f.context.contextKey); expect(observe(captured.raw)).toMatchObject({ outcome: 'interrupted', reason: 'disposed' })
    expect(oldRaw).toHaveBeenCalledTimes(4)
    s.dispose(); s.stop(); s.begin(); await s.retry()
    expect(oldRaw).toHaveBeenCalledTimes(4); expect(newRaw).not.toHaveBeenCalled(); expect(newFinal).not.toHaveBeenCalled()
    // Even a host disposal triggered synchronously by a view observer cannot
    // issue a new FINAL between its entry guard and its port invocation.
    const observerFixture = fixture(), observerSession = observerFixture.session()
    await prepareFormal(observerFixture, observerSession)
    let finalizingNotifications = 0
    observerFixture.changed.mockImplementation(() => { if (observerSession.view === 'finalizing' && ++finalizingNotifications === 2) observerSession.dispose() })
    observerSession.stop(); await flush()
    expect(observerFixture.ports.finalize).not.toHaveBeenCalled(); expect(observerSession.view).toBe('stopped')
    rawGate.resolve(await f.retain(captured)); await flush()
    expect(s.records).toHaveLength(4); expect(s.capture).toBeNull(); expect(s.receipt).toBeNull(); expect(s.view).toBe('stopped')
    expect(f.changed).not.toHaveBeenCalled(); expect(newFinal).not.toHaveBeenCalled(); expect(oldFinal).not.toHaveBeenCalled()
  })
  it('unmounts the actual React candidate with a formal raw write pending; its ACK retains raw but never issues a new FINAL', async () => {
    const f = fixture(), gate = deferred<Awaited<ReturnType<Ports['persistLocalDraft']>>>()
    f.ports.persistLocalDraft = vi.fn(async d => d.raw.plan.phase === 'test' ? gate.promise : f.retain(d))
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function(this: HTMLMediaElement) { fireEvent.playing(this); return Promise.resolve() })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function(this: HTMLMediaElement) { fireEvent.pause(this) })
    const page = render(<VoiceEmotionTask context={f.context} ports={f.ports} mediaLoader={f.loader} />, { wrapper: React.StrictMode })
    fireEvent.click(screen.getByText('阅读完毕，准备练习')); await act(flush)
    for (const [i, choice] of ['快乐', '悲伤', '愤怒'].entries()) {
      fireEvent.click(screen.getByRole('button', { name: '开始' })); await act(flush)
      fireEvent.click(screen.getByText('播放语音')); fireEvent.ended(page.container.querySelector('audio')!)
      fireEvent.click(screen.getByRole('button', { name: choice })); await act(flush)
      if (i < 2) fireEvent.click(screen.getByText('下一次练习'))
    }
    fireEvent.click(screen.getByText('准备正式任务')); fireEvent.click(screen.getByRole('button', { name: '开始' })); await act(flush)
    fireEvent.click(screen.getByText('播放语音')); fireEvent.ended(page.container.querySelector('audio')!)
    fireEvent.click(screen.getByRole('button', { name: '快乐' })); await act(flush)
    const pending = vi.mocked(f.ports.persistLocalDraft).mock.calls.at(-1)![0]
    expect(pending.raw.plan.phase).toBe('test'); expect(screen.getByRole('status')).toBeTruthy(); expect(f.ports.finalize).not.toHaveBeenCalled()
    page.unmount(); await act(flush)
    gate.resolve(await f.retain(pending)); await act(flush)
    expect(f.records.size).toBe(4); expect(f.ports.persistLocalDraft).toHaveBeenCalledTimes(4); expect(f.ports.finalize).not.toHaveBeenCalled()
  })
  it.each(['resolve', 'reject'] as const)('ignores a late %s from an already-issued FINAL after disposal without pretending it was cancelled', async outcome => {
    const f = fixture(), gate = deferred<Receipt>(), originalFinal = f.ports.finalize
    f.ports.finalize = vi.fn(async () => gate.promise)
    const s = f.session(); await prepareFormal(f, s); s.begin(); s.event({ kind: 'play', at: f.clock }); f.clock += 100
    s.stop('participant-ended'); await flush()
    expect(f.ports.finalize).toHaveBeenCalledTimes(1); expect(s.view).toBe('finalizing')
    const claim = vi.mocked(f.ports.finalize).mock.calls[0][0]
    s.dispose(); f.changed.mockClear()
    if (outcome === 'resolve') gate.resolve(await originalFinal(claim))
    else gate.reject(Error('late original FINAL failure'))
    await flush(); await s.retry(); s.begin(); s.stop()
    expect(f.ports.finalize).toHaveBeenCalledTimes(1); expect(s.receipt).toBeNull(); expect(s.view).toBe('stopped'); expect(f.changed).not.toHaveBeenCalled()
  })
})
