import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react'
import { createIstSnapshot } from '../../../../../../backend/src/modules/cognitive/content-candidates/information-sampling/package'
import { scoreIst, istEnvelope } from '../../../../../../backend/src/modules/cognitive/content-candidates/information-sampling/scorer'
import { projectIstReport } from '../../../../../../backend/src/modules/cognitive/content-candidates/information-sampling/report'
import { IST_IDENTITY, IST_PROTOCOL, istPlan, reviewIst, type IstPlan } from './generated/protocol'
import { digest, type IstContext, type IstPorts, type IstDraft, type IstReceipt } from './contracts'
import { IstCapture } from './capture'
import { IstSession } from './session'
import { IstTask } from './IstTask'
import { IstReport } from './IstReport'
import { IstInstructions, IST_QUESTIONS } from './IstInstructions'
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function fixture() {
  const snapshot = createIstSnapshot('experience'), randomSeed = 'ist-synthetic-session', context: IstContext = { contextKey: 'ist-synthetic-new-session-epoch', randomSeed, snapshot: { schemaVersion: 1, ...IST_IDENTITY, config: snapshot.config, protocol: IST_PROTOCOL, configHash: snapshot.configHash, protocolSignature: snapshot.protocolSignature, frozenAt: snapshot.frozenAt }, manifestHash: digest(istPlan(snapshot.config, randomSeed)) }, records = new Map<string, IstDraft>(); let clock = 100
  const ports: IstPorts = { prepareLocalAttempt: vi.fn(async (c, manifest, realm) => ({ fresh: true as const, contextKey: c.contextKey, bindingDigest: digest({ context: c, manifest, realm }) })), persistLocalDraft: vi.fn(async record => { records.set(record.recordKey, structuredClone(record)); return { retained: true as const, contextKey: record.contextKey, recordKey: record.recordKey, recordDigest: record.recordDigest } }), finalize: vi.fn(async claim => ({ finalSaved: true as const, contextKey: context.contextKey, finalPayloadDigest: claim.finalPayloadDigest, receiptId: 'synthetic-report-only-not-cos', report: projectIstReport(scoreIst({ session: snapshot, config: snapshot.config, randomSeed, trials: [...records.values()].filter((r): r is IstDraft & { phase: 'test' } => r.phase === 'test').map(r => istEnvelope(r.raw)) })) })) }
  return { context, snapshot, ports, records, get clock() { return clock }, set clock(v: number) { clock = v }, session: () => new IstSession(context, ports, () => {}, () => clock) }
}
async function play(f: ReturnType<typeof fixture>, s: IstSession, n = 3) {
  const p = s.capture!.raw.plan
  for (const target of [...Array.from({ length: n }, (_, i) => 'cell:' + i), 'choice:' + p.majority]) { f.clock++; s.input({ kind: 'down', atMs: f.clock, target, input: 'touch', token: 'pointer:1', key: null, repeat: false }); f.clock++; s.input({ kind: 'up', atMs: f.clock, target, input: 'touch', token: 'pointer:1', key: null, repeat: false }) }
  f.clock += 2000; s.tick(f.clock); await flush()
}
async function teach(f: ReturnType<typeof fixture>, s: IstSession, answers = [0, 1, 1]) { await play(f, s); f.clock++; s.nextPractice(f.clock); await play(f, s); f.clock++; s.beginQuiz(f.clock); answers.forEach((v, i) => s.answerQuiz(i, v)); f.clock++; s.submitQuiz(f.clock); await flush() }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })
describe('information sampling candidate flows', () => {
  it('requires complete fresh activations and preserves first judgment, duplicate, cancel, multi-contact and repeat facts', () => {
    const f = fixture(), p = istPlan(f.snapshot.config, 'capture')[0], c = new IstCapture(f.snapshot.config, p, 100); let t = 100
    const send = (kind: 'down' | 'up' | 'cancel', target: string, id = 1, repeat = false) => c.input({ kind, atMs: ++t, target, input: 'touch', token: 'pointer:' + id, key: null, repeat })
    send('up', 'cell:0'); expect(c.raw.state.reveals).toHaveLength(0); send('down', 'cell:0'); send('cancel', 'cell:0'); send('up', 'cell:0'); expect(c.raw.state.reveals).toHaveLength(0)
    send('down', 'cell:0'); send('down', 'cell:1', 2); send('up', 'cell:0'); send('up', 'cell:1', 2); expect(c.raw.state.reveals).toHaveLength(0)
    send('down', 'cell:0'); send('up', 'cell:0'); send('down', 'cell:0'); send('up', 'cell:0'); expect(c.raw.state.reveals).toHaveLength(1)
    for (let i = 0; i < 300; i++) c.input({ kind: 'down', atMs: ++t, target: 'cell:2', input: 'keyboard', token: 'key:Enter', key: 'Enter', repeat: true })
    expect(c.raw.ignoredRepeatCount).toBe(300); expect(c.raw.events.length).toBeLessThan(30)
    send('down', 'choice:' + p.majority); send('up', 'choice:' + p.majority); const decision = structuredClone(c.raw.state.decision); send('down', 'choice:' + p.optionOrder[1]); send('up', 'choice:' + p.optionOrder[1]); expect(c.raw.state.decision).toEqual(decision)
    c.tick(decision!.atMs + 1999); expect(c.done).toBe(false); c.tick(decision!.atMs + 2000); expect(c.done).toBe(true); expect(reviewIst(c.raw, p, f.snapshot.config).decision).toEqual(decision)
    const bound = new IstCapture(f.snapshot.config, p, 0); for (let i = 1; i <= 257; i++) bound.input({ kind: 'up', atMs: i, target: 'cell:0', input: 'mouse', token: 'pointer:1', key: null, repeat: false }); expect(bound.raw).toMatchObject({ status: 'interrupted', overflow: true, stopReason: 'input-log-bound' }); expect(bound.raw.events).toHaveLength(256)
  })
  it('re-presents complete teaching after interruption and failed quiz, then completes ten rounds and retries an identical final claim', async () => {
    const f = fixture(), finalize = f.ports.finalize; let fail = true
    f.ports.finalize = vi.fn(async claim => { const r = await finalize(claim); if (fail) { fail = false; return { ...r, finalSaved: false } as unknown as IstReceipt } return r })
    const s = f.session(); await s.prepare(); s.begin(f.clock); f.clock++; s.stop('blur', f.clock); await flush(); expect(s.practicePassed).toBe(false); s.reviewInstructions(); expect(s.view).toBe('practice-instructions'); f.clock++; s.begin(f.clock)
    await teach(f, s, [1, 0, 0]); expect(s.view).toBe('quiz-feedback'); expect(s.practicePassed).toBe(false); s.acceptPractice(); expect(s.phase).toBe('practice'); s.reviewInstructions(); expect(s.view).toBe('practice-instructions'); f.clock++; s.begin(f.clock)
    await teach(f, s); expect(s.practicePassed).toBe(true); s.acceptPractice(); f.clock++; s.begin(f.clock)
    for (let i = 0; i < 10; i++) { if (['game-ready', 'break'].includes(s.view)) { f.clock++; s.begin(f.clock) } await play(f, s) }
    expect(s.view).toBe('retry'); expect(s.receipt).toBeNull(); await s.retry(); expect(s.view).toBe('report'); expect(s.receipt!.report).toMatchObject({ state: 'interpretable', planned: 10, completed: 10 }); const calls = vi.mocked(f.ports.finalize).mock.calls
    expect(calls[0][0]).toEqual(calls[1][0]); expect(calls[0][0]).toMatchObject({ formalCount: 10, practiceCount: 5, quizCount: 2, termination: 'completed', terminationReason: null }); expect(s.retained).toHaveLength(17); expect(s.retained.filter(r => r.phase === 'test').every(r => r.recordKey === `test:0:${r.index}`)).toBe(true)
  })
  it('requires fresh preparation and retries a failed local save without another exposure or an archive-success claim', async () => {
    const f = fixture(); f.ports.prepareLocalAttempt = vi.fn(async () => ({ fresh: true as const, contextKey: 'wrong', bindingDigest: 'wrong' })); const blocked = f.session(); await blocked.prepare(); blocked.begin(100); expect(blocked.view).toBe('blocked'); expect(blocked.capture).toBeNull()
    const g = fixture(), s = g.session(); await s.prepare(); s.begin(g.clock); await teach(g, s); s.acceptPractice(); g.clock++; s.begin(g.clock)
    const original = g.ports.persistLocalDraft, writes: IstDraft[] = []
    // The already bound local port fails once, then retries the exact retained bytes.
    vi.mocked(original).mockImplementationOnce(async record => { writes.push(structuredClone(record)); throw Error('synthetic local failure') })
    await play(g, s); expect(s.view).toBe('retry'); const pending = s.retained[s.retained.length - 1]; expect(pending.phase).toBe('test')
    vi.mocked(original).mockImplementation(async record => { writes.push(structuredClone(record)); g.records.set(record.recordKey, structuredClone(record)); return { retained: true, contextKey: record.contextKey, recordKey: record.recordKey, recordDigest: record.recordDigest } }); await s.retry(); await flush()
    expect(writes[writes.length - 1]).toEqual(pending); expect(s.receipt!.report.state).toBe('limited'); expect(s.capture).toBeNull(); expect(vi.mocked(g.ports.finalize).mock.calls[0][0]).toMatchObject({ formalCount: 1, termination: 'aborted', terminationReason: 'local-save-failure' }); expect(s.retained).toContainEqual(pending)
    const q = fixture(), qs = q.session(); await qs.prepare(); qs.begin(q.clock); await play(q, qs); q.clock++; qs.nextPractice(q.clock); await play(q, qs); q.clock++; qs.beginQuiz(q.clock); qs.answerQuiz(0, 0); qs.dispose(); await flush(); const stoppedQuiz = qs.retained.find(r => r.phase === 'quiz'); expect(stoppedQuiz?.raw).toMatchObject({ submitted: false, answers: [0, null, null] }); expect(q.ports.finalize).not.toHaveBeenCalled()
  })
  it('runs actual React bilingual teaching, touch/cancel/keyboard controls, quiz and full reread without revealing hidden categories', async () => {
    vi.useFakeTimers(); const f = fixture(); let now = 100, next = 0; const frames = new Map<number, FrameRequestCallback>()
    vi.spyOn(performance, 'now').mockImplementation(() => now); vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next }); vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const frame = async () => { const callbacks = [...frames.values()]; frames.clear(); await act(async () => { for (const cb of callbacks) cb(now); await flush() }) }
    const pointer = (name: string, kind: 'pointerdown' | 'pointerup' | 'pointercancel') => { now++; const e = new MouseEvent(kind, { bubbles: true, button: 0 }); Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 } }); fireEvent(screen.getByRole('button', { name }), e) }
    const choose = async (p: IstPlan) => {
      pointer('选择' + (p.majority === 'blue-circle' ? '蓝圆' : '橙三角'), 'pointerdown'); pointer('选择' + (p.majority === 'blue-circle' ? '蓝圆' : '橙三角'), 'pointerup')
      // Exercise a real callback that wakes before the performance-clock deadline.
      const judgedAt = now; now = judgedAt + 1999
      await act(async () => { vi.advanceTimersByTime(2000); await flush() }); expect(screen.getByRole('group', { name: '25格棋盘' })).toBeTruthy()
      now = judgedAt + 2000; await act(async () => { vi.advanceTimersByTime(1); await flush() })
    }
    const v = render(<IstTask context={f.context} ports={f.ports} />); expect(screen.getByRole('region', { name: '完整说明与例子' })).toBeTruthy(); expect(screen.getByText('例子：揭7格不等于整个棋盘')).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: '准备练习' })); await act(async () => flush()); fireEvent.click(screen.getByRole('button', { name: '开始本局' })); await frame()
    expect(screen.getAllByRole('button', { name: /格子\d+ 未打开/ })).toHaveLength(25); pointer('格子1 未打开', 'pointerdown'); pointer('格子1 未打开', 'pointercancel'); expect(screen.getAllByRole('button', { name: /格子\d+ 未打开/ })).toHaveLength(25)
    const tile = screen.getByRole('button', { name: '格子1 未打开' }); fireEvent.keyDown(tile, { key: 'Enter', code: 'Enter' }); now++; fireEvent.keyUp(tile, { key: 'Enter', code: 'Enter' }); expect(screen.getAllByRole('button', { name: /格子\d+ 未打开/ })).toHaveLength(24)
    fireEvent.blur(window); await act(async () => flush()); fireEvent.click(screen.getByRole('button', { name: '重新阅读完整说明与例子' })); expect(screen.getByRole('region', { name: '完整说明与例子' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: '开始下一组练习' })); await frame()
    const plans = istPlan(f.snapshot.config, f.context.randomSeed, 'practice', 1); await choose(plans[0]); fireEvent.click(screen.getByRole('button', { name: '下一局练习' })); await choose(plans[1]); fireEvent.click(screen.getByRole('button', { name: '回答3道理解题' })); expect(screen.getByRole('button', { name: '确认理解题答案' })).toHaveProperty('disabled', true)
    for (const [i, q] of IST_QUESTIONS.zh.entries()) fireEvent.click(within(screen.getByRole('group', { name: q.question })).getAllByRole('radio')[[0, 1, 1][i]])
    fireEvent.click(screen.getByRole('button', { name: '确认理解题答案' })); await act(async () => flush()); expect(screen.getByText('规则已理解')).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: '准备正式任务' })); expect(screen.getByText('准备正式任务')).toBeTruthy()
    v.rerender(<IstTask context={{ ...f.context, contextKey: 'new-epoch' }} ports={f.ports} />); expect(screen.getByRole('alert')).toBeTruthy(); expect(screen.queryByRole('button', { name: '开始本局' })).toBeNull(); cleanup(); render(<IstInstructions config={f.snapshot.config} language="en" />); expect(screen.getByText('Example: seven revealed tiles are not the whole board')).toBeTruthy(); expect(screen.getByText('Two easy practice rounds and three rule questions')).toBeTruthy()
  })
  it('uses the same public gate for report text, the optional image and download through partial, invalid and stale versions', () => {
    const f = fixture(), c = new IstCapture(f.snapshot.config, istPlan(f.snapshot.config, f.context.randomSeed)[0], 100), p = c.raw.plan
    c.input({ kind: 'activate', atMs: 101, target: 'choice:' + p.majority, input: 'assistive', token: 'assistive', key: null, repeat: false }); c.interrupt('synthetic-after-choice', 102)
    const report = projectIstReport(scoreIst({ session: f.snapshot, config: f.snapshot.config, randomSeed: f.context.randomSeed, trials: [istEnvelope(c.raw)] })), invalid = projectIstReport(scoreIst({ session: f.snapshot, config: f.snapshot.config, randomSeed: f.context.randomSeed, trials: [] }))
    const v = render(<IstReport report={report} />); expect(screen.getByText(/本次记录不完整/)).toBeTruthy(); expect(screen.getByRole('button', { name: '下载本次公开摘要' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: '查看一张小图' })); expect(screen.getAllByRole('img')).toHaveLength(1); expect(screen.getByRole('img').getAttribute('src')).toContain('EDUK12.TOP')
    v.rerender(<IstReport report={invalid} />); expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByRole('button', { name: '下载本次公开摘要' })).toBeNull(); expect(screen.queryByText('平均揭格')).toBeNull(); v.rerender(<IstReport report={{ ...report, reportDefinitionVersion: 'next' } as never} />); expect(screen.getByRole('alert')).toBeTruthy()
  })
})
