import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import BundleReport from '../BundleReport'
import { displayFor, hasCrossMethodEvidence } from '../bundle-evidence-display'
vi.mock('../../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
afterEach(cleanup)
const evidence = (constructKey: string, value: number, sourceKind = 'SCALE_SCORE') => ({ evidenceKey: constructKey, constructKey, sourceKind, quality: 'interpretable', value: { state: 'present', value } })
it('uses the patched observer-neutral heading and keeps all three scales and reporters separate', () => {
  const rows = [evidence('gonogo.commission_rate', .2, 'COGNITIVE_METRIC'), evidence('gonogo.nogo_trial_count', 30, 'COGNITIVE_METRIC'),
    evidence('adexi_v1.working_memory_sum', 23), evidence('texi.working_memory_mean', 3.2),
    evidence('chexi.parent.working_memory_mean', 2), evidence('chexi.teacher.working_memory_mean', 4),
    evidence('flanker.flanker_effect_ms', -12, 'COGNITIVE_METRIC')]
  expect(hasCrossMethodEvidence(rows)).toBe(true)
  // Explicit Flanker vocabulary takes precedence over the child spread, keeping
  // the more precise frozen median-RT explanation and original signed value.
  expect(displayFor(rows[6])!.label).toBe('Flanker · 干扰效应（ms）')
  const report: any = { schemaVersion: 1, snapshotFamily: 'ASSESSMENT_BUNDLE', analysisId: 'synthetic-junction', status: 'READY', purpose: 'INITIAL',
    retryCount: 0, factsHash: 'synthetic', definitionHash: 'synthetic', reportDefinition: { title: '三线合成接口夹具', sections: {} },
    view: { quality: { overall: 'interpretable' }, evidence: rows, limitations: [], blocks: [] } }
  render(<BundleReport report={report} attemptId="synthetic" staff={false} reload={() => {}} />)
  expect(screen.getByRole('heading', { name: '日常生活中的体验与观察' })).toBeInTheDocument()
  expect(screen.getByText('问卷来源')).toBeInTheDocument()
  expect(screen.getByText(/问卷反映日常生活中的体验或观察/)).toBeInTheDocument()
  expect(screen.queryByText(/自评反映日常生活中的体验/)).toBeNull()
  expect(screen.queryByText('自评问卷')).toBeNull()
  expect(screen.getByRole('img', { name: /ADEXI.*范围 9 到 45.*本次结果 23/ })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /TEXI.*范围 1 到 5.*本次结果 3.2/ })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /家长观察.*范围 1 到 5.*本次结果 2/ })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: /教师观察.*范围 1 到 5.*本次结果 4/ })).toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /干扰效应/ })).toBeNull()
  expect(screen.getAllByText('-12').length).toBeGreaterThan(0)
})
