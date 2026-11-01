import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BundleReport from '../BundleReport'
vi.mock('../../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
afterEach(cleanup)
const item = (constructKey: string, value: unknown, sourceKind = 'COGNITIVE_METRIC', quality = 'interpretable', state = 'present') => ({ evidenceKey: constructKey, constructKey, sourceKind, quality, value: { state, value } })
const report = (evidence: ReturnType<typeof item>[], overall = 'interpretable'): any => ({ schemaVersion: 1, snapshotFamily: 'ASSESSMENT_BUNDLE', analysisId: 'synthetic', status: 'READY', purpose: 'INITIAL', factsHash: 'x', definitionHash: 'x', retryCount: 0, reportDefinition: { title: '描述性报告', sections: {} }, view: { quality: { overall }, evidence, limitations: [], blocks: [] } })
const rows = () => [item('gonogo.commission_rate', .2), item('gonogo.nogo_trial_count', 30), item('cpt.omission_rate', 5 / 36), item('cpt.target_count', 36), item('cpt.rt_icv', 1.2), item('cpt.d_prime', -.15), item('adexi_v1.working_memory_sum', 23, 'SCALE_SCORE'), item('adexi_v1.inhibition_sum', 17, 'SCALE_SCORE')]
const show = (data: any) => render(<BundleReport report={data} attemptId="synthetic" staff={false} reload={() => {}} />)
describe('separate cognitive and questionnaire evidence display', () => {
  it('uses original ranges and actual denominators; leaves d-prime and RT variability unscaled', () => {
    show(report(rows()))
    expect(screen.getByRole('heading', { name: '任务中的本次表现' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '日常生活中的体验' })).toBeInTheDocument()
    expect(screen.getByText('20%')).toBeInTheDocument()
    expect(screen.getByText('13.9%')).toBeInTheDocument()
    expect(screen.getByText(/本次分母 30 次/)).toBeInTheDocument()
    expect(screen.getByText(/本次分母 36 次/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /工作记忆.*范围 9 到 45.*本次结果 23/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /抑制.*范围 5 到 25.*本次结果 17/ })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /d′|变异系数/ })).toBeNull()
    expect(screen.getAllByText('-0.15').length).toBeGreaterThan(0)
  })
  it('keeps legitimate zero and limited markers distinct from missing, invalid or redacted numbers', () => {
    const evidence = rows()
    evidence[0] = item('gonogo.commission_rate', 0, 'COGNITIVE_METRIC', 'limited')
    evidence[2] = item('cpt.omission_rate', 999, 'COGNITIVE_METRIC', 'invalid')
    evidence[6] = item('adexi_v1.working_memory_sum', 888, 'SCALE_SCORE', 'unavailable', 'redacted')
    evidence[7] = item('adexi_v1.inhibition_sum', null, 'SCALE_SCORE', 'unavailable', 'missing')
    show(report(evidence, 'limited'))
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.getByText(/仅支持有限解释。/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /工作记忆|抑制|CPT-X/ })).toBeNull()
    expect(screen.queryByText(/999|888/)).toBeNull()
  })
  it.each(['invalid', 'unavailable'])('does not draw performance charts for overall %s', overall => {
    show(report(rows(), overall))
    expect(screen.queryByRole('img')).toBeNull()
  })
  it('does not clamp out-of-range values into a fabricated endpoint or infer a scale from a suffix', () => {
    const evidence = rows(); evidence[0] = item('gonogo.commission_rate', 1.2)
    evidence[7] = item('unknown.inhibition_sum', 17, 'SCALE_SCORE')
    show(report(evidence))
    expect(screen.queryByRole('img', { name: /Go\/No-Go/ })).toBeNull()
    expect(screen.getByText(/数值超出原量尺，本次不绘图。/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /抑制/ })).toBeNull()
  })
  it('renders without network calls; unknown historical evidence stays readable', async () => {
    const api = (await import('../../../api/client')).default
    vi.clearAllMocks()
    show(report([item('unknown.metric', 7), item('unknown.score', 3, 'SCALE_SCORE')]))
    expect(screen.getByText('unknown.metric')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(api.get).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled()
  })
})
