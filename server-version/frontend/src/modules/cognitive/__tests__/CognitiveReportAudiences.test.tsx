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
