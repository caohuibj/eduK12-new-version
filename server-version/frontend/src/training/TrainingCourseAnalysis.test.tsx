import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { act, fireEvent, render as rtlRender, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrainingAnalysisResult, TrainingAnalysisSource } from '../api/trainingAnalysis'

const mocks = vi.hoisted(() => ({
  sources: vi.fn(), analyze: vi.fn(), qualityPage: vi.fn(), updateQuality: vi.fn(), exportData: vi.fn(),
  fetch: vi.fn(), wait: vi.fn(), download: vi.fn(), clear: vi.fn(), request: vi.fn(),
}))
vi.mock('../api/trainingAnalysis', () => ({ trainingAnalysisApi: mocks }))
vi.mock('../api/client', () => ({ sessionFetch: mocks.fetch }))
vi.mock('../utils/exportJobs', () => ({
  requestExportIntent: mocks.request, waitForExportArtifacts: mocks.wait, triggerExportDownload: mocks.download,
  clearExportIntentKey: mocks.clear, assertExportDownload: (response: { ok: boolean }) => { if (!response.ok) throw new Error('下载失败') },
  ExportJobFailedError: class extends Error {},
}))
import {TrainingLongitudinalAnalysis as TrainingCourseAnalysis} from './TrainingCourseAnalysis'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })
const metric = { itemId: 'item-1', metricKey: 'total', label: '总分' }
const baseline: TrainingAnalysisSource = { taskId: 'task-1', taskName: '基线测评', publication: '2026-10-01T00:00:00.000Z', configDigest: 'config-1', variantKey: 'group-a', metrics: [metric] }
const followup: TrainingAnalysisSource = { ...baseline, taskId: 'task-2', taskName: '随访测评', publication: '2026-10-15T00:00:00.000Z' }
const sources = [baseline, { ...baseline, variantKey: 'group-b' }, followup]
const qualityRow = { attemptId: 'attempt-1', attemptEpoch: 2, sourceHash: 'source-hash', status: 'COMPLETED', taskSatisfaction: 'SATISFIED', verdict: 'INCLUDE' as const, reason: null, revision: 3 }
const result: TrainingAnalysisResult = {
  manifest: { schemaVersion: 1, manifestHash: 'manifest-hash', definitionHash: 'definition-hash', sourceHash: 'all-source-hash', qualityHash: 'quality-hash', authorityHash: 'authority-hash', sourceCutoff: '2026-10-18T00:00:00.000Z', sourceCount: 20, observationCount: 20 },
  analysis: {
    schemaVersion: 1, kind: 'TRAINING_NUMERIC_LONGITUDINAL', courseId: 'course-1', mode: 'PAIRWISE', minimumN: 5, state: 'present', matchedEligibleN: 10,
    descriptives: [{ ...baseline, waveKey: 'baseline', itemId: metric.itemId, metricKey: metric.metricKey, measurement: null, state: 'present', eligibleN: 15, validN: 10,
      missingByReason: { QUALITY_EXCLUDED: 5 }, statistics: { mean: 10, median: 9, sdSample: 2, minMax: { min: 5, max: 15 }, quartiles: { q1: 7, q2: 9, q3: 12 } } }],
    metrics: [{ metricKey: 'total', state: 'present', countKind: 'PAIRED_VALID', validCaseN: 5,
      waveMeans: [{ waveId: 'baseline', waveKey: 'baseline', mean: 10 }, { waveId: 'followup', waveKey: 'followup', mean: 12 }],
      comparisons: [{ fromWaveId: 'baseline', toWaveId: 'followup', comparability: { level: 'EXACT', allowedOperations: ['CHANGE'], limitations: [] }, delta: 2 }],
      flow: [{ fromWaveKey: 'baseline', toWaveKey: 'followup', state: 'present', basis: 'OBSERVED_SAMPLE', fromObservedN: 10, toObservedN: 10, retainedN: 5, attritionN: 5, lateJoiningN: 5 }] }],
    limitations: ['本分析仅作描述，不代表因果效应。'],
  },
  quality: { list: [qualityRow], total: 26, page: 1, pageSize: 25 },
}
const selector = { schemaVersion: 1, courseId: 'course-1', mode: 'PAIRWISE', waves: [
  { waveKey: 'baseline', taskId: baseline.taskId, publication: baseline.publication, configDigest: baseline.configDigest, variantKey: baseline.variantKey, metrics: [{ itemId: metric.itemId, metricKey: metric.metricKey }] },
  { waveKey: 'followup', taskId: followup.taskId, publication: followup.publication, configDigest: followup.configDigest, variantKey: followup.variantKey, metrics: [{ itemId: metric.itemId, metricKey: metric.metricKey }] },
] }
function chooseWave(index: number, source: TrainingAnalysisSource) {
  fireEvent.change(screen.getByRole('combobox', { name: `波次 ${index} 任务` }), { target: { value: source.taskId } })
  fireEvent.change(screen.getByRole('combobox', { name: `波次 ${index} 发布版本` }), { target: { value: JSON.stringify([source.publication, source.configDigest]) } })
  fireEvent.change(screen.getByRole('combobox', { name: `波次 ${index} 分组` }), { target: { value: JSON.stringify([source.taskId, source.publication, source.configDigest, source.variantKey, ...(source.materialGroupKey === undefined ? [] : [source.materialGroupKey])]) } })
  const group = screen.getByRole('group', { name: index === 1 ? '基线来源' : `随访 ${index - 1}来源` })
  fireEvent.click(within(group).getByRole('checkbox', { name: /总分/ }))
}
async function selectSources() {
  await screen.findByRole('combobox', { name: '波次 1 任务' })
  chooseWave(1, baseline); chooseWave(2, followup)
}
async function analyze() {
  await selectSources()
  fireEvent.click(screen.getByRole('button', { name: '生成课程分析' }))
  await screen.findByRole('region', { name: '课程分析结果' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sources.mockResolvedValue({ list: sources, total: sources.length, canQuality: true, canExport: true })
  mocks.analyze.mockResolvedValue(structuredClone(result))
  mocks.updateQuality.mockResolvedValue(undefined)
  mocks.qualityPage.mockResolvedValue({ list: [{ ...qualityRow, attemptId: 'attempt-26' }], total: 26, page: 2, pageSize: 25 })
  mocks.exportData.mockResolvedValue({ artifacts: [{ id: 'artifact-1', fileName: 'course.csv', format: 'csv', downloadUrl: '/api/exports/returned-artifact' }] })
  mocks.wait.mockImplementation(async artifacts => artifacts)
  mocks.request.mockImplementation(async (_scope, request) => request('stable-export-request'))
  mocks.fetch.mockResolvedValue({ ok: true, blob: async () => new Blob(['numeric-data']) })
})

describe('authorized course analysis workspace', () => {
  it('requires explicit frozen task/version/group/metric choices and submits only the authorized selector', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await screen.findByRole('combobox', { name: '波次 1 任务' })
    expect(mocks.sources).toHaveBeenCalledWith('course-1')
    expect(screen.getByRole('button', { name: '生成课程分析' })).toBeDisabled()
    expect(mocks.analyze).not.toHaveBeenCalled()
    await analyze()
    expect(mocks.analyze).toHaveBeenCalledWith('course-1', selector)
    expect(screen.getByText('配对有效人数 pairedN：5')).toBeVisible()
    expect(screen.getByText(/保留 5；后续未观察到 5；后续新观察到 5/)).toBeVisible()
    expect(screen.getByText(/非招募人数或质量合格率/)).toBeVisible()
    expect(screen.getByText(/质量判断排除 5/)).toBeVisible()
    expect(screen.getByRole('table')).toHaveTextContent('四分位数 Q1 / Q3')
    expect(screen.getByText('本分析仅作描述，不代表因果效应。')).toBeVisible()
  })

  it('selects a unique version and group but requires deliberate metric selection',async()=>{
    mocks.sources.mockResolvedValue({list:[followup],total:1,canQuality:false,canExport:false})
    render(<TrainingCourseAnalysis courseId="course-1"/>)
    await screen.findByRole('combobox',{name:'波次 1 任务'})
    fireEvent.change(screen.getByRole('combobox',{name:'波次 1 任务'}),{target:{value:followup.taskId}})
    expect(screen.getByRole('combobox',{name:'波次 1 发布版本'})).toHaveValue(JSON.stringify([followup.publication,followup.configDigest]))
    expect(screen.getByRole('checkbox',{name:/总分/})).not.toBeChecked()
    expect(screen.getByRole('button',{name:'生成课程分析'})).toBeDisabled()
    expect(mocks.analyze).not.toHaveBeenCalled()
  })

  it('shows a genuine empty state without treating course sharing as result permission', async () => {
    mocks.sources.mockResolvedValue({ list: [], total: 0, canQuality: false, canExport: false })
    render(<TrainingCourseAnalysis courseId="course-1" />)
    expect(await screen.findByText(/当前没有可分析的授权数值来源/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '生成课程分析' })).toBeNull()
    expect(screen.getByText(/课程共享、模板使用权不自动授予/)).toBeVisible()
  })

  it('preserves 403 permission failure and allows a bounded source retry', async () => {
    mocks.sources.mockRejectedValueOnce({ status: 403, message: 'Forbidden' })
    render(<TrainingCourseAnalysis courseId="course-1" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('没有本课程数据分析权限')
    expect(screen.queryByRole('button', { name: '导出当前分析' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '刷新分析来源' }))
    await screen.findByRole('combobox', { name: '波次 1 任务' })
    expect(mocks.sources).toHaveBeenCalledTimes(2)
  })

  it('shows the exact ambiguous-source reason for 409 and keeps export unavailable', async () => {
    mocks.analyze.mockRejectedValue({ status: 409, message: '同一身份同一波次有多条 FINAL 记录' })
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await selectSources()
    fireEvent.click(screen.getByRole('button', { name: '生成课程分析' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('同一身份同一波次有多条 FINAL 记录')
    expect(screen.getByRole('alert')).toHaveTextContent('不会自动挑选一条记录')
    expect(screen.queryByRole('button', { name: '导出当前分析' })).toBeNull()
  })

  it('invalidates the manifest immediately when a selection changes', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    fireEvent.click(screen.getAllByText('高级：导出中的时间点标识')[1])
    fireEvent.change(screen.getByRole('textbox', { name: '波次 2 标识' }), { target: { value: 'later_followup' } })
    expect(screen.queryByRole('region', { name: '课程分析结果' })).toBeNull()
    expect(screen.queryByRole('button', { name: '导出当前分析' })).toBeNull()
    expect(screen.queryByRole('region', { name: '分析质量判断' })).toBeNull()
  })

  it('does not generate duplicate analysis requests while one is pending', async () => {
    let resolve!: (value: TrainingAnalysisResult) => void
    mocks.analyze.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await selectSources()
    const button = screen.getByRole('button', { name: '生成课程分析' })
    fireEvent.click(button); fireEvent.click(button)
    expect(mocks.analyze).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('combobox', { name: '波次 1 任务' })).toBeDisabled()
    await act(async () => resolve(result))
  })

  it('ignores stale source and analysis responses after course navigation', async () => {
    let resolve!: (value: TrainingAnalysisResult) => void
    mocks.analyze.mockImplementation(() => new Promise(done => { resolve = done }))
    const view = render(<TrainingCourseAnalysis courseId="course-1" />)
    await selectSources()
    fireEvent.click(screen.getByRole('button', { name: '生成课程分析' }))
    mocks.sources.mockResolvedValueOnce({ list: [], total: 0, canQuality: false, canExport: false })
    view.rerender(<TrainingCourseAnalysis courseId="course-2" />)
    await screen.findByText(/当前没有可分析的授权数值来源/)
    await act(async () => resolve(result))
    expect(screen.queryByRole('region', { name: '课程分析结果' })).toBeNull()
    expect(mocks.sources).toHaveBeenLastCalledWith('course-2')
  })

  it('does not replace a new course catalog with a late response from the previous course', async () => {
    let resolve!: (value: unknown) => void
    mocks.sources.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const view = render(<TrainingCourseAnalysis courseId="course-1" />)
    mocks.sources.mockResolvedValueOnce({ list: [], total: 0, canQuality: false, canExport: false })
    view.rerender(<TrainingCourseAnalysis courseId="course-2" />)
    await screen.findByText(/当前没有可分析的授权数值来源/)
    await act(async () => resolve({ list: sources, total: 3, canQuality: true, canExport: true }))
    expect(screen.queryByRole('combobox', { name: '波次 1 任务' })).toBeNull()
  })

  it('requires unique wave names and exactly two PAIRWISE waves', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await selectSources()
    fireEvent.click(screen.getAllByText('高级：导出中的时间点标识')[1])
    fireEvent.change(screen.getByRole('textbox', { name: '波次 2 标识' }), { target: { value: 'baseline' } })
    expect(screen.getByRole('button', { name: '生成课程分析' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '添加随访波次' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: '匹配方式' }), { target: { value: 'FULL_CASE' } })
    fireEvent.click(screen.getByRole('button', { name: '添加随访波次' }))
    fireEvent.click(screen.getAllByText('高级：导出中的时间点标识')[2])
    expect(screen.getByRole('textbox', { name: '波次 3 标识' })).toHaveValue('followup_2')
    fireEvent.change(screen.getByRole('combobox', { name: '匹配方式' }), { target: { value: 'PAIRWISE' } })
    expect(screen.getByRole('button', { name: '生成课程分析' })).toBeDisabled()
  })

  it('keeps answered-but-not-calculable values distinct from unanswered cells', async () => {
    const notCalculable = structuredClone(result)
    notCalculable.analysis.descriptives[0].missingByReason = { NOT_CALCULABLE: 5 }
    mocks.analyze.mockResolvedValue(notCalculable)
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    expect(screen.getByText(/无法计算数值 5/)).toBeVisible()
    expect(screen.queryByText(/未回答 5|本波次未观察到记录 5/)).toBeNull()
  })

  it('labels unobserved cells without inferring assignment or refusal', async () => {
    const unobserved = structuredClone(result)
    unobserved.analysis.descriptives[0].missingByReason = { NO_OBSERVATION: 5 }
    mocks.analyze.mockResolvedValue(unobserved)
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    expect(screen.getByText(/本波次未观察到记录 5/)).toBeVisible()
    expect(screen.queryByText(/未分配 5|未回答 5|拒答 5/)).toBeNull()
  })

  it('does not reconstruct or display suppressed descriptive, paired, or flow numbers', async () => {
    const suppressed = structuredClone(result)
    suppressed.analysis.state = 'suppressed'
    suppressed.analysis.matchedEligibleN = undefined
    suppressed.analysis.descriptives[0] = { ...suppressed.analysis.descriptives[0], state: 'suppressed', validN: 4 }
    suppressed.analysis.metrics[0] = { metricKey: 'total', state: 'suppressed', countKind: 'PAIRED_VALID', validCaseN: 4,
      flow: [{ fromWaveKey: 'baseline', toWaveKey: 'followup', state: 'suppressed', basis: 'OBSERVED_SAMPLE', attritionN: 1 }] }
    mocks.analyze.mockResolvedValue(suppressed)
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    expect(screen.getByRole('table')).toHaveTextContent('未达到披露条件')
    expect(screen.queryByText('配对有效人数 pairedN：4')).toBeNull()
    expect(screen.queryByText(/流失 1/)).toBeNull()
    expect(screen.queryByText(/质量判断排除 5/)).toBeNull()
    expect(screen.getByText(/流失与新加入人数受披露条件保护/)).toBeVisible()
  })

  it('shows non-comparability limitations without reporting a change', async () => {
    const incomparable = structuredClone(result)
    incomparable.analysis.metrics[0] = { metricKey: 'total', state: 'not_comparable', countKind: 'PAIRED_VALID', reason: 'NOT_COMPARABLE',
      comparisons: [{ fromWaveId: 'baseline', toWaveId: 'followup', comparability: { level: 'NONE', allowedOperations: [], limitations: ['计分定义变化'] }, delta: 99 }] }
    mocks.analyze.mockResolvedValue(incomparable)
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    expect(screen.getByText(/不会将不同计分含义的指标合并/)).toBeVisible()
    expect(screen.getByText(/计分定义变化/)).toBeVisible()
    expect(screen.queryByText(/均值变化 99/)).toBeNull()
  })

  it('requires a two-character quality reason and sends exact audit concurrency fields', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    expect(screen.getByText(/原始提交状态：COMPLETED · 任务完成判定：SATISFIED/)).toBeVisible()
    fireEvent.change(screen.getByRole('combobox', { name: 'attempt-1 的质量判断' }), { target: { value: 'EXCLUDE' } })
    expect(screen.getByRole('button', { name: '保存质量判断' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'attempt-1 的判断依据' }), { target: { value: '复核异常作答' } })
    fireEvent.click(screen.getByRole('button', { name: '保存质量判断' }))
    await screen.findByText(/质量判断已保存，分析已按新版本更新/)
    expect(mocks.updateQuality).toHaveBeenCalledWith('course-1', { selector, attemptId: 'attempt-1', attemptEpoch: 2, sourceHash: 'source-hash', expectedRevision: 3, verdict: 'EXCLUDE', reason: '复核异常作答' })
    expect(mocks.analyze).toHaveBeenCalledTimes(2)
  })

  it('keeps successful quality saves distinct from a later analysis-refresh failure', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    mocks.analyze.mockRejectedValueOnce({ status: 503, message: '暂时无法刷新' })
    fireEvent.change(screen.getByRole('textbox', { name: 'attempt-1 的判断依据' }), { target: { value: '人工复核通过' } })
    fireEvent.click(screen.getByRole('button', { name: '保存质量判断' }))
    expect(await screen.findByText('质量判断已保存，但分析尚未刷新。请重新生成分析。')).toBeVisible()
    expect(screen.queryByRole('button', { name: '导出当前分析' })).toBeNull()
  })

  it('drops stale results on quality revision conflicts instead of retrying a write', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    mocks.updateQuality.mockRejectedValue({ status: 409, message: '复核版本已变化' })
    fireEvent.change(screen.getByRole('textbox', { name: 'attempt-1 的判断依据' }), { target: { value: '人工复核通过' } })
    fireEvent.click(screen.getByRole('button', { name: '保存质量判断' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('复核版本已变化')
    expect(mocks.updateQuality).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '导出当前分析' })).toBeNull()
  })

  it('pages quality records using the unchanged full manifest', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    fireEvent.click(screen.getByRole('button', { name: '下一页质量记录' }))
    expect(await screen.findByText('第 2 页 · 共 26 条')).toBeVisible()
    expect(mocks.qualityPage).toHaveBeenCalledWith('course-1', selector, result.manifest, 2)
    expect(screen.getByRole('button', { name: '下一页质量记录' })).toBeDisabled()
  })

  it('does not expose quality/export controls without explicit discovery flags', async () => {
    mocks.sources.mockResolvedValue({ list: sources, total: sources.length })
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    expect(screen.queryByRole('region', { name: '分析质量判断' })).toBeNull()
    expect(screen.queryByRole('region', { name: '课程分析导出' })).toBeNull()
  })

  it('uses the existing queue and returned authenticated download URL with the full manifest', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    fireEvent.change(screen.getByRole('combobox', { name: '数据布局' }), { target: { value: 'wide' } })
    fireEvent.change(screen.getByRole('combobox', { name: '文件格式' }), { target: { value: 'zip' } })
    fireEvent.click(screen.getByRole('button', { name: '导出当前分析' }))
    await screen.findByText('已请求下载，请查看浏览器下载列表。')
    expect(mocks.exportData).toHaveBeenCalledWith('course-1', { selector, manifest: result.manifest, layout: 'wide', format: 'zip', requestKey: 'stable-export-request' })
    expect(mocks.wait).toHaveBeenCalledWith([{ id: 'artifact-1', fileName: 'course.csv', format: 'csv', downloadUrl: '/api/exports/returned-artifact' }])
    expect(mocks.fetch).toHaveBeenCalledWith('/api/exports/returned-artifact', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), 'course.csv')
  })

  it('revokes the displayed analysis when artifact download returns 403', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 403 })
    fireEvent.click(screen.getByRole('button', { name: '导出当前分析' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没有本课程数据分析权限')
    expect(screen.queryByRole('region', { name: '课程分析结果' })).toBeNull()
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('prevents a late automatic download after leaving the course analysis page', async () => {
    let resolve!: (artifacts: unknown[]) => void
    mocks.wait.mockImplementation(() => new Promise(done => { resolve = done }))
    const view = render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    fireEvent.click(screen.getByRole('button', { name: '导出当前分析' }))
    await screen.findByText('导出已进入原有队列，正在生成文件。')
    view.unmount()
    await act(async () => resolve([{ fileName: 'course.csv', downloadUrl: '/api/exports/returned-artifact' }]))
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('invalidates result/export controls after a permission loss during export', async () => {
    render(<TrainingCourseAnalysis courseId="course-1" />)
    await analyze()
    mocks.exportData.mockRejectedValue({ status: 403, message: '当前授权已撤回' })
    fireEvent.click(screen.getByRole('button', { name: '导出当前分析' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('没有本课程数据分析权限')
    expect(screen.queryByRole('region', { name: '课程分析结果' })).toBeNull()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})


it('requires and submits each explicit material arm without pretending it is a tool-subset variant', async () => {
  const a = {...baseline, configDigest: null, variantKey: null, materialGroupKey: 'a'}
  const b = {...followup, configDigest: null, variantKey: null, materialGroupKey: 'b'}
  mocks.sources.mockResolvedValue({list: [a, {...a, materialGroupKey: 'b'}, b], total: 3, canQuality: true, canExport: true})
  render(<TrainingCourseAnalysis courseId="course-1" />)
  await screen.findByRole('combobox', {name: '波次 1 任务'})
  chooseWave(1, a); chooseWave(2, b)
  expect(screen.getAllByRole('option', {name: '实验材料组 · b'})).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', {name: '生成课程分析'}))
  await screen.findByRole('region', {name: '课程分析结果'})
  expect(mocks.analyze.mock.calls[0][1].waves).toEqual([
    expect.objectContaining({materialGroupKey: 'a', configDigest: null, variantKey: null}),
    expect.objectContaining({materialGroupKey: 'b', configDigest: null, variantKey: null}),
  ])
})
