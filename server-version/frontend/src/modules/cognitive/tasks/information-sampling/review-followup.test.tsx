import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { createIstSnapshot } from '../../../../../../backend/src/modules/cognitive/content-candidates/information-sampling/package'
import { scoreIst, istEnvelope } from '../../../../../../backend/src/modules/cognitive/content-candidates/information-sampling/scorer'
import { IST_IDENTITY, IST_PROTOCOL, istPlan, type IstConfig } from './generated/protocol'
import { isIstReport, istNarrative, istDownload, istTakeHomeSvg, projectIstReport, type IstReport as Report } from './generated/report'
import { digest, validateIstContext, type IstContext, type IstDraft, type IstPorts } from './contracts'
import { IstCapture } from './capture'
import { IstSession } from './session'
import { IstTask } from './IstTask'
import { IstReport } from './IstReport'
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
function fixture(language: 'zh' | 'en' = 'en') {
  const snapshot = createIstSnapshot('experience'), seed = 'ist-review-language', context: IstContext = { language, contextKey: 'synthetic-review-language-epoch', snapshot: { schemaVersion: 1, ...IST_IDENTITY, protocol: IST_PROTOCOL, config: snapshot.config, configHash: snapshot.configHash, protocolSignature: snapshot.protocolSignature, frozenAt: snapshot.frozenAt }, randomSeed: seed, manifestHash: digest(istPlan(snapshot.config, seed)) }, saved: IstDraft[] = []
  const ports: IstPorts = {
    prepareLocalAttempt: vi.fn(async (c, manifest, realm) => ({ fresh: true as const, contextKey: c.contextKey, bindingDigest: digest({ context: c, manifest, realm }) })),
    persistLocalDraft: vi.fn(async r => { saved.push(structuredClone(r)); return { retained: true as const, contextKey: r.contextKey, recordKey: r.recordKey, recordDigest: r.recordDigest } }),
    finalize: vi.fn(async claim => ({ finalSaved: true as const, contextKey: claim.contextKey, finalPayloadDigest: claim.finalPayloadDigest, receiptId: 'synthetic-language-only-no-archive', report: projectIstReport(scoreIst({ session: snapshot, config: snapshot.config, randomSeed: seed, trials: saved.filter((r): r is IstDraft & { phase: 'test' } => r.phase === 'test').map(r => istEnvelope(r.raw)) })) })),
  }
  return { context, snapshot, seed, saved, ports }
}
function reportFor(fixed: number, decreasing: number, mode: 'full' | 'partial' | 'empty' = 'full'): Report {
  const f = fixture('zh'), plans = istPlan(f.snapshot.config, f.seed), selected = mode === 'empty' ? [] : mode === 'partial' ? plans.slice(0, 1) : plans
  const raw = selected.map(p => { const cap = new IstCapture(f.snapshot.config, p, 100 + p.index * 10_000); let now = cap.raw.startedAtPerfMs; const n = p.rule === 'fixed' ? fixed : decreasing; for (let i = 0; i < n; i++) cap.input({ kind: 'activate', atMs: ++now, target: 'cell:' + i, input: 'assistive', token: 'assistive', key: null, repeat: false }); cap.input({ kind: 'activate', atMs: ++now, target: 'choice:' + p.majority, input: 'assistive', token: 'assistive', key: null, repeat: false }); cap.tick(now + 2000); return cap.raw })
  return projectIstReport(scoreIst({ session: f.snapshot, config: f.snapshot.config, randomSeed: f.seed, trials: raw.map(istEnvelope) }))
}
afterEach(() => { cleanup(); vi.restoreAllMocks() })
describe('information sampling DOT review follow-up', () => {
  it('binds teaching language to preparation, retained raw and FINAL in one partial formal flow', async () => {
    const f = fixture('en'), frozen = structuredClone(f.context), issue = vi.mocked(f.ports.finalize), realIssue = issue.getMockImplementation()!
    issue.mockImplementationOnce(async claim => { const r = await realIssue(claim); return { ...r, report: { ...r.report, configVersion: '0.1.0', presentationVersion: '0.1.0' } } })
    let clock = 100; const s = new IstSession(f.context, f.ports, () => {}, () => clock)
    expect(() => validateIstContext({ ...f.context, language: undefined } as never)).toThrow(); expect(() => validateIstContext({ ...f.context, language: 'guess' } as never)).toThrow()
    await s.prepare(); expect(vi.mocked(f.ports.prepareLocalAttempt).mock.calls[0][0].language).toBe('en'); expect(s.contextDigest).toBe(digest(frozen)); f.context.language = 'zh'; expect(s.context.language).toBe('en')
    const practice = async () => { const p = s.capture!.raw.plan; s.input({ kind: 'activate', atMs: ++clock, target: 'choice:' + p.majority, input: 'assistive', token: 'assistive', key: null, repeat: false }); clock += 2000; s.tick(clock); await flush() }
    s.begin(clock); await practice(); s.nextPractice(++clock); await practice(); s.beginQuiz(++clock); [0, 1, 1].forEach((a, i) => s.answerQuiz(i, a)); s.submitQuiz(++clock); await flush(); s.acceptPractice(); s.begin(++clock)
    const p = s.capture!.raw.plan; s.input({ kind: 'activate', atMs: ++clock, target: 'choice:' + p.majority, input: 'assistive', token: 'assistive', key: null, repeat: false }); s.stop('review-partial-stop', ++clock); await flush()
    expect(s.view).toBe('retry'); expect(s.receipt).toBeNull(); await s.retry(); expect(s.view).toBe('report'); expect(issue.mock.calls[1][0]).toEqual(issue.mock.calls[0][0]); expect(f.saved).toHaveLength(4)
    for (const r of f.saved) { expect(r).toMatchObject({ language: 'en', contextDigest: digest(frozen) }); const { recordDigest, ...payload } = r; expect(recordDigest).toBe(digest(payload)) }
    const claim = vi.mocked(f.ports.finalize).mock.calls[0][0], { finalPayloadDigest, ...payload } = claim
    expect(claim).toMatchObject({ language: 'en', contextDigest: digest(frozen), formalCount: 1, termination: 'aborted' }); expect(finalPayloadDigest).toBe(digest(payload)); expect(digest({ ...payload, language: 'zh' })).not.toBe(finalPayloadDigest)
    const m = fixture('en'); m.ports.prepareLocalAttempt = vi.fn(async (c, manifest, realm) => ({ fresh: true as const, contextKey: c.contextKey, bindingDigest: digest({ context: { ...c, language: 'zh' }, manifest, realm }) })); const rejected = new IstSession(m.context, m.ports, () => {}); await rejected.prepare(); expect(rejected.view).toBe('blocked'); expect(rejected.capture).toBeNull()
  })
  it('uses the frozen teaching language by default and rejects initial or later UI mismatches before exposure', async () => {
    const f = fixture('en'), v = render(<IstTask context={f.context} ports={f.ports} />)
    expect(screen.getByRole('region', { name: 'Complete instructions and examples' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Prepare practice' })); await act(async () => flush()); expect(screen.getByRole('button', { name: 'Start round' })).toBeTruthy()
    v.rerender(<IstTask context={f.context} ports={f.ports} language="zh" />); expect(screen.getByRole('alert')).toBeTruthy(); expect(screen.queryByRole('button', { name: '开始本局' })).toBeNull(); expect(f.ports.prepareLocalAttempt).toHaveBeenCalledTimes(1); expect(f.ports.persistLocalDraft).not.toHaveBeenCalled(); cleanup()
    const fresh = fixture('en'); render(<IstTask context={fresh.context} ports={fresh.ports} language="zh" />); expect(screen.getByRole('alert')).toBeTruthy(); expect(fresh.ports.prepareLocalAttempt).not.toHaveBeenCalled()
  })
  it('generates plain bilingual data descriptions and preserves detail placement, three public gates and legacy presentation', () => {
    for (const [a, b, zh, en] of [[9, 7, '少揭了2格', '2 fewer tiles'], [7, 9, '多揭了2格', '2 more tiles'], [7, 7, '格子数相同', 'same number of tiles'], [0, 0, '格子数相同', 'same number of tiles']] as const) {
      const r = reportFor(a, b), z = istNarrative(r, 'zh')!, e = istNarrative(r, 'en')!; expect(z).toHaveLength(2); expect(z[0]).toContain(zh); expect(e[0]).toContain(en); expect(z.join(' ')).not.toMatch(/更好|更差|能力分/); expect(e.join(' ')).not.toMatch(/better|worse|ability score/)
    }
    const r = reportFor(9, 7), v = render(<IstReport report={r} />); expect(screen.getByRole('region', { name: '本次记录的文字说明' }).textContent).toContain('少揭了2格'); expect(screen.getByText(/这是有符号的本次描述/).closest('details')).toBeTruthy(); expect(screen.queryByText(/有效判断 \/ 计划/)).toBeNull()
    v.rerender(<IstReport report={r} language="en" />); expect(screen.getByRole('region', { name: 'This session in words' }).textContent).toContain('2 fewer tiles')
    const partial = reportFor(3, 3, 'partial'); expect(istNarrative(partial, 'zh')![1]).toContain('还没有判断记录'); expect(istNarrative(partial, 'en')![1]).toContain('cannot be compared'); v.rerender(<IstReport report={partial} />); expect(screen.getByRole('region', { name: '本次记录的文字说明' }).textContent).toContain('暂不比较'); fireEvent.click(screen.getByRole('button', { name: '查看一张小图' })); expect(screen.getByRole('img')).toBeTruthy(); expect(istDownload(partial)).not.toBeNull()
    const invalid = reportFor(0, 0, 'empty'); v.rerender(<IstReport report={invalid} />); expect(istNarrative(invalid)).toBeNull(); expect(istTakeHomeSvg(invalid)).toBeNull(); expect(istDownload(invalid)).toBeNull(); expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByRole('region', { name: '本次记录的文字说明' })).toBeNull(); expect(screen.queryByRole('button', { name: '下载本次公开摘要' })).toBeNull()
    const legacy = JSON.parse(readFileSync(resolve(process.cwd(), '../../docs/cognitive-library/scenario-roadmap-20261027/domains/occupational/information-sampling-implementation/research-public-report.json'), 'utf8')) as Report
    expect(isIstReport(legacy)).toBe(true); expect(isIstReport(legacy, { profile: legacy.profile, configHash: legacy.configHash, protocolSignature: legacy.protocolSignature, configVersion: '0.1.1', presentationVersion: '0.1.1' })).toBe(false); expect(istNarrative(legacy)).toBeNull(); v.rerender(<IstReport report={legacy} />); expect(screen.queryByRole('region', { name: '本次记录的文字说明' })).toBeNull(); expect(screen.getByText(/这是有符号的本次描述/).closest('details')).toBeNull(); expect(isIstReport({ ...r, configVersion: '0.1.0', presentationVersion: '0.1.1' })).toBe(false)
    expect(r.configVersion).toBe('0.1.1'); expect(r.presentationVersion).toBe('0.1.1'); expect(() => istPlan({ ...fixture().snapshot.config, presentationVersion: '0.1.0' } as unknown as IstConfig, 'legacy')).toThrow()
  })
})
