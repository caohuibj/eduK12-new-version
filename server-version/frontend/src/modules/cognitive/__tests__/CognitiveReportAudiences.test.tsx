import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CognitiveV2ReportCard from '../CognitiveV2ReportCard'
import CognitiveProfessionalReport from '../CognitiveProfessionalReport'
import CognitiveProfessionalReports from '../CognitiveProfessionalReports'
import type { CognitiveV2Report } from '../types'

const mocks = vi.hoisted(() => ({ professionalReports: vi.fn() }))
vi.mock('../api', () => ({ cognitiveApi: mocks }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const metric = { key: 'medianRtMs', label: '中位反应时', participantLabel: '典型反应用时', formatted: '310 毫秒', value: 310, direction: 'lower_is_better' as const, unit: 'ms', category: 'processing_speed' }
const report: CognitiveV2Report = {
  schemaVersion: 2, title: '简单反应时', qualityState: 'interpretable', conclusion: '有效记录', headline: [metric], user: [], detail: [metric], quality: [], practicalTips: [], disclaimer: '仅描述本次任务',
  method: { testType: 'reaction', engineVersion: '1.0.0', scoringVersion: '1.1.0', configVersion: '1.1.0', protocolSignature: 'frozen', profile: 'standard' },
  reading: { schemaVersion: 2, reportVersion: '1.1.0', presentationVersion: '1.2.0', title: '从看见，到出手', introduction: '了解这次记录', interpretation: { state: 'available', reasons: [], withheldMetricKeys: [] }, feedback: { summary: '通常一次回应用了310毫秒', evidenceMetricKeys: ['medianRtMs'], nextStep: '比较时保持相同设备' }, caveats: ['没有同龄人排名'], methodCaveats: ['原协议限制'], visuals: [],
    popular: { conceptTitle: '反应时是什么', concept: '1毫秒是千分之一秒', takeaway: '快，是看清之后的回应。', exampleTitle: '驾驶中的及时回应', example: '不能预测驾驶安全', scene: 'signal', frames: [{ title: '信号', text: '观察' }, { title: '判断', text: '看清' }, { title: '回应', text: '行动' }], boundary: '不是职业适合度评估', metricHelp: { medianRtMs: { label: '通常一次回应用了多久', explanation: '取中间的那个用时' } } },
    professional: { construct: '视觉响应潜伏期', procedure: '有效RT按冻结时限纳入', interpretation: '结合有效记录与遗漏率', confounders: ['设备延迟'], parameters: [{ label: '正式试次数', value: '20' }], metrics: [{ key: 'medianRtMs', label: '中位反应时', formatted: '310 毫秒', unit: 'ms', definition: '有效反应时排序后的中位数', readingHint: '结合样本数量' }], quality: [{ key: 'interrupted', label: '作答中断', active: false, description: '存在中断事件', effect: 'limited' }], withheld: [] },
  },
}
describe('popular and professional report voices', () => {
  it('defaults participants to the magazine voice and scoped occupational examples', () => {
    render(<CognitiveV2ReportCard report={report} />)
    expect(screen.getByRole('heading', { name: '从看见，到出手' })).toBeInTheDocument()
    expect(screen.getByText('通常一次回应用了多久')).toBeInTheDocument()
    expect(screen.getByText('不能预测驾驶安全')).toBeInTheDocument()
    expect(screen.queryByText('视觉响应潜伏期')).not.toBeInTheDocument()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: '打印这份报告' })); expect(print).toHaveBeenCalledOnce(); print.mockRestore()
  })
  it('presents the specialist report with formal labels, formulas, parameters and quality', () => {
    render(<CognitiveProfessionalReport report={report} />)
    expect(screen.getByRole('table')).toHaveTextContent('有效反应时排序后的中位数')
    expect(screen.getByText('视觉响应潜伏期')).toBeInTheDocument()
    expect(screen.getByText('正式试次数')).toBeInTheDocument()
    expect(screen.getByText('未触发')).toBeInTheDocument()
    expect(screen.queryByText('快，是看清之后的回应。')).not.toBeInTheDocument()
  })
  it('retains anonymous record context and omits absent or invalid dates', () => {
    const view = render(<CognitiveV2ReportCard report={report} anonymousCode="DEMO-2026-0001" attemptNo={2} finishedAt="2026-10-01T08:30:00Z" />)
    const record = screen.getByText('匿名编号').closest('dl')!
    expect(record).toHaveTextContent('DEMO-2026-0001')
    expect(record.querySelector('time')).toHaveAttribute('datetime', '2026-10-01T08:30:00Z')
    expect(screen.getByText(/第 2 次/)).toBeInTheDocument()
    view.rerender(<CognitiveV2ReportCard report={report} finishedAt="bad-date" />)
    expect(screen.queryByText('匿名编号')).not.toBeInTheDocument()
    expect(screen.queryByText('完成时间')).not.toBeInTheDocument()
  })
  it('offers frozen detail metrics in a closed plain-language layer and excludes withdrawn keys', () => {
    const detailed = structuredClone(report)
    detailed.detail.push({ ...metric, key: 'accuracyByRuleFamily', label: '各规则族正确率', participantLabel: '按规律类别看看', formatted: '递进：100%', value: { progression: 1 }, explanation: '不同规律分开统计' })
    detailed.detail.push({ ...metric, key: 'withdrawn', label: '不可读取的数值', formatted: '999 毫秒' })
    detailed.reading!.interpretation.withheldMetricKeys = ['withdrawn']
    render(<CognitiveV2ReportCard report={detailed} references={[{ metricKey: 'withdrawn', label: '不可读取的参考' }, { metricKey: 'accuracyByRuleFamily', label: '参考暂不可用', unavailableReason: '没有可比样本' }]} />)
    const summary = screen.getByText('进一步看这次记录')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    fireEvent.click(summary)
    expect(screen.getByText('按规律类别看看')).toBeInTheDocument()
    expect(screen.getByText('递进：100%')).toBeInTheDocument()
    expect(screen.getByText(/没有可比样本/)).toBeInTheDocument()
    expect(screen.queryByText(/999/)).not.toBeInTheDocument()
    expect(screen.queryByText(/不可读取的参考/)).not.toBeInTheDocument()
    expect(screen.getAllByText('310 毫秒')).toHaveLength(1)
  })
  it('puts assignment and stable record context inside the professional report', () => {
    render(<CognitiveProfessionalReport report={report} assignmentTitle="任务A" reportId="CR-DEMO1" finishedAt="2026-10-01T08:30:00Z" />)
    const article = screen.getByRole('article')
    expect(article).toHaveTextContent('任务A')
    expect(article).toHaveTextContent('CR-DEMO1')
    expect(article.querySelector('time')).toHaveAttribute('datetime', '2026-10-01T08:30:00Z')
  })
  it('does not put withdrawn numeric estimates back into professional summaries', () => {
    const limited = structuredClone(report)
    limited.headline = []; limited.detail = []
    limited.reading!.interpretation = { state: 'withheld', reasons: ['不足'], withheldMetricKeys: ['medianRtMs'] }
    limited.reading!.professional!.metrics = []
    limited.reading!.professional!.withheld = [{ key: 'medianRtMs', label: '中位反应时', reasons: ['有效记录不足'] }]
    render(<CognitiveProfessionalReport report={limited} references={[{ metricKey: 'medianRtMs', label: '不可用参考' }]} />)
    expect(screen.queryByText(/310/)).not.toBeInTheDocument()
    expect(screen.queryByText(/不可用参考/)).not.toBeInTheDocument()
    expect(screen.getByText(/有效记录不足/)).toBeInTheDocument()
  })
  it('loads the authorized staff reader and surfaces permission errors without showing a cached report', async () => {
    mocks.professionalReports.mockResolvedValueOnce({ code: 0, data: { assignmentTitle: '任务A', total: 1, offset: 0, nextOffset: null, records: [{ label: '记录1', report, references: [] }] } })
    const view = render(<CognitiveProfessionalReports assignmentId="a" />)
    expect(await screen.findByText('任务A · 专业报告阅读')).toBeInTheDocument()
    expect(mocks.professionalReports).toHaveBeenCalledWith('a', 0)
    mocks.professionalReports.mockResolvedValueOnce({ code: 403, message: '无权读取任务B' })
    view.rerender(<CognitiveProfessionalReports assignmentId="b" />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('无权读取任务B'))
    expect(screen.queryByText('任务A · 专业报告阅读')).not.toBeInTheDocument()
  })
})
