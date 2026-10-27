import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { createVoiceSnapshot } from '../../../../../../backend/src/modules/cognitive/content-candidates/voice-emotion-cues/package'
import { scoreVoiceSubmission } from '../../../../../../backend/src/modules/cognitive/content-candidates/voice-emotion-cues/submission'
import { projectReport } from '../../../../../../backend/src/modules/cognitive/content-candidates/voice-emotion-cues/report'
import { scoreVoice } from '../../../../../../backend/src/modules/cognitive/content-candidates/voice-emotion-cues/scorer'
import { VoiceSession } from './session'
import { VoiceEmotionTask } from './VoiceEmotionTask'
import { VoiceReport } from './VoiceReport'
import { digest, type Context, type Draft, type Ports, type Receipt } from './contracts'
import { manifest, asset, type Choice } from './generated/protocol'
vi.mock('./assets', () => ({ loadVoice: vi.fn() }))
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function fixture() {
  const snapshot = createVoiceSnapshot('experience'), randomSeed = 'voice-frontend-synthetic', context: Context = { contextKey: 'voice-synthetic-ui', language: 'zh', snapshot, randomSeed, manifestHash: digest(manifest(snapshot.config, randomSeed)) }
  const stored = new Map<string, Draft>(); let clock = 100
  const ports: Ports = {
    prepareLocalAttempt: vi.fn(async (c, plans, realm) => ({ prepared: true as const, exclusive: true as const, contextKey: c.contextKey, bindingDigest: digest({ context: c, plans, realm }) })),
    persistLocalDraft: vi.fn(async d => { stored.set(d.recordKey, structuredClone(d)); return { retained: true as const, contextKey: d.contextKey, recordKey: d.recordKey, recordDigest: d.recordDigest } }),
    finalize: vi.fn(async claim => {
      const drafts = [...stored.values()], { report } = scoreVoiceSubmission({ contextKey: context.contextKey, language: context.language, session: snapshot, randomSeed, realm: drafts[0].realm, drafts, claim })
      return { finalSaved: true as const, contextKey: context.contextKey, finalPayloadDigest: claim.finalPayloadDigest, receiptId: 'synthetic-report-receipt', report }
    }),
  }
  const load = vi.fn(async (p: Parameters<import('./assets').MediaLoader>[0]) => ({ url: 'blob:synthetic-voice', sha256: asset(p.assetId).sha256, dispose: vi.fn() }))
  return { context, snapshot, stored, ports, load, get clock() { return clock }, set clock(v: number) { clock = v }, session: () => new VoiceSession(context, ports, () => {}, () => clock) }
}
async function answer(f: ReturnType<typeof fixture>, s: VoiceSession, correct = true) {
  const choice: Choice = correct ? s.capture!.plan.emotion : 'none'
  s.event({ kind: 'play', at: f.clock }); f.clock += 5100; s.event({ kind: 'ended', at: f.clock });
  s.event({ kind: 'down', at: f.clock, token: 'pointer:1', choice, input: 'touch' }); f.clock += 100
  s.event({ kind: 'up', at: f.clock, token: 'pointer:1', choice, input: 'touch' }); await flush(); f.clock++
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('voice candidate local flows', () => {
  it('repeats full instructions after failed practice then completes 24 formal clips with identical lost-ACK retry and authoritative frozen report', async () => {
    const f = fixture(), s = f.session(), finalize = f.ports.finalize; let attempt = 0
    f.ports.finalize = vi.fn(async claim => { const ack = await finalize(claim); attempt++; if (attempt === 1) return { ...ack, finalSaved: false } as unknown as Receipt; if (attempt === 2) return { ...ack, report: { ...ack.report, manifestHash: '0'.repeat(64) } }; return ack })
    // Bind the final port before construction, as production consumers must do.
    const session = new VoiceSession(f.context, f.ports, () => {}, () => f.clock)
    expect(Object.isFrozen(session.context.snapshot.config)).toBe(true)
    expect(() => { session.context.snapshot.config.totalTrials = 1 }).toThrow()
    await session.prepare(); session.begin()
    for (let i = 0; i < 3; i++) { await answer(f, session, false); if (i < 2) { session.nextPractice(); session.begin() } }
    expect(session.practicePassed).toBe(false); session.retryInstructions(); expect(session.view).toBe('practice-instructions'); session.finishInstructions(); session.begin()
    for (let i = 0; i < 3; i++) { await answer(f, session); if (i < 2) { session.nextPractice(); session.begin() } }
    expect(session.practicePassed).toBe(true); session.startFormal()
    for (let i = 0; i < 24; i++) { session.begin(); await answer(f, session) }
    expect(session.view).toBe('retry'); expect(session.receipt).toBeNull(); await session.retry(); expect(session.view).toBe('retry'); expect(session.receipt).toBeNull(); await session.retry()
    expect(session.view).toBe('report'); expect(session.records).toHaveLength(30)
    expect(session.receipt!.report).toMatchObject({ state: 'interpretable', overall: { matched: 24, total: 24 } })
    expect(vi.mocked(f.ports.finalize).mock.calls[1][0]).toEqual(vi.mocked(f.ports.finalize).mock.calls[0][0])
    expect(vi.mocked(f.ports.finalize).mock.calls[2][0]).toEqual(vi.mocked(f.ports.finalize).mock.calls[0][0])
    expect(session.records.filter(d => d.raw.plan.phase === 'test').every(d => d.recordKey === `test:0:${d.raw.plan.index}`)).toBe(true)
    expect(s.view).toBe('intro')
  })
  it('retains the first answer unchanged across local save mutation/failure and preserves real interrupted/aborted records without replay', async () => {
    const f = fixture(); let first = true; const original = f.ports.persistLocalDraft
    f.ports.persistLocalDraft = vi.fn(async d => { if (first) { first = false; d.raw.events.length = 0; throw Error('synthetic save unavailable') } return original(d) })
    const s = f.session(); await s.prepare(); s.begin(); await answer(f, s)
    expect(s.view).toBe('retry'); expect(s.records).toHaveLength(0); await s.retry()
    expect(s.records[0].raw.events).toHaveLength(4); const calls = vi.mocked(f.ports.persistLocalDraft).mock.calls
    expect(calls[1][0].recordDigest).toBe(calls[0][0].recordDigest)
    for (let i = 1; i < 3; i++) { s.nextPractice(); s.begin(); await answer(f, s) }
    s.startFormal(); s.begin(); s.event({ kind: 'play', at: f.clock }); f.clock += 1000; s.stop('participant-ended'); await flush()
    expect(s.view).toBe('report'); expect(s.receipt!.report).toMatchObject({ state: 'invalid', overall: null, interrupted: 1, unstarted: 23 })
    expect(f.stored.size).toBe(4)
  })
  it('renders detailed Chinese/English instructions and native-media gated choices; blocks after context change and uses one public gate for report/download', async () => {
    const f = fixture(), props = { context: f.context, ports: f.ports, mediaLoader: f.load }
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function(this: HTMLMediaElement) { fireEvent.playing(this); return Promise.resolve() })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function(this: HTMLMediaElement) { fireEvent.pause(this) })
    const page = render(<VoiceEmotionTask {...props} />, { wrapper: React.StrictMode })
    expect(screen.getByText(/科研版持续聆听负担明显/)).toBeTruthy(); expect(screen.getByText(/单读句子不能确定答案/)).toBeTruthy()
    fireEvent.click(screen.getByText('阅读完毕，准备练习')); await act(flush)
    fireEvent.click(screen.getByText('开始')); await act(flush)
    expect(screen.getByRole('button', { name: '快乐' })).toBeDisabled()
    fireEvent.click(screen.getByText('播放语音')); const media = page.container.querySelector('audio')!; expect(media).toBeTruthy()
    expect(screen.getByRole('button', { name: '快乐' })).toBeDisabled(); fireEvent.ended(media)
    expect(screen.getByRole('button', { name: '快乐' })).not.toBeDisabled()
    fireEvent.keyDown(screen.getByRole('button', { name: '快乐' }), { key: 'Enter', code: 'Enter', repeat: true }); expect(f.stored.size).toBe(0)
    fireEvent.keyDown(screen.getByRole('button', { name: '快乐' }), { key: 'Enter', code: 'Enter', repeat: false }); fireEvent.keyUp(screen.getByRole('button', { name: '快乐' }), { key: 'Enter', code: 'Enter' }); await act(flush)
    expect(screen.getByText('练习解释')).toBeTruthy(); expect(f.stored.size).toBe(1)
    page.rerender(<VoiceEmotionTask {...props} context={{ ...f.context, contextKey: 'different-attempt' }} />)
    expect(screen.getByRole('alert').textContent).toContain('冻结作答无法继续'); page.unmount()
    const english = render(<VoiceEmotionTask {...props} context={{ ...f.context, language: 'en' }} language="en" />); expect(screen.getByText(/one item per condition/)).toBeTruthy(); english.unmount()
    const invalid = projectReport(scoreVoice({ session: f.snapshot, config: f.snapshot.config, randomSeed: f.context.randomSeed, trials: [] }))
    const report = render(<VoiceReport report={invalid} />); expect(screen.queryByRole('button')).toBeNull(); expect(report.container.textContent).not.toContain('匹配0/'); report.unmount()
    render(<VoiceReport report={{ ...invalid, medianPostPlaybackMs: 0 }} />); expect(screen.getByRole('alert')).toBeTruthy()
  })
})
