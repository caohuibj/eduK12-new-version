import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QuestionnaireResult from '../../../pages/student/QuestionnaireResult'
import PublicQuestionnaireResult from '../../../pages/public/PublicQuestionnaireResult'

const { mockClient, mockResumeToken } = vi.hoisted(() => ({
  mockClient: { get: vi.fn() },
  mockResumeToken: vi.fn(),
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))
vi.mock('../../../utils/questionnaireResume', () => ({
  readQuestionnaireResumeToken: mockResumeToken,
}))

const report = {
  questionnaireId: 'questionnaire-1',
  questionnaireName: '学习问卷',
  completedAt: '2026-08-20T01:00:00.000Z',
  totalTime: 0,
  totalDimensions: 2,
  backgroundValues: [{ itemId: 'form-1', type: 'FORM' as const, kind: 'background' as const, label: '年级', value: '三年级' }],
  unitReports: [{
    itemId: 'scale-1',
    type: 'SCALE' as const,
    kind: 'scale' as const,
    scaleId: 'scale-1',
    scaleCode: 'S-1',
    scaleName: '学习投入',
    dimensionScores: [],
    feedback: {
      overall: '单项反馈',
      dimensions: [
        { dimensionId: 'd-zero', dimensionCode: 'zero', dimensionName: '零分维度', score: 0, minScore: 0, maxScore: 10, level: 'low', interpretation: '', suggestions: [] },
        { dimensionId: 'd-null', dimensionCode: 'missing', dimensionName: '缺失维度', score: null, minScore: 0, maxScore: 10, level: null, interpretation: '', suggestions: [] },
      ],
    },
    caveats: ['仅用于本次作答解读。'],
    disclaimer: '不构成医学诊断。',
    completedAt: '2026-08-20T01:00:00.000Z',
    totalTime: 0,
    method: { scaleId: 'scale-1', scaleCode: 'S-1', reportDefinitionVersion: 'scale-unit-report-v1' },
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockResumeToken.mockReturnValue('resume-capability')
  mockClient.get.mockResolvedValue({ code: 0, data: report })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ code: 0, message: 'ok', data: report }),
  }))
})

const renderPublicResult = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/public/questionnaire/:token/result" element={<PublicQuestionnaireResult />} />
      <Route path="/public/questionnaire/:token" element={<div>QUESTIONNAIRE_ENTRY</div>} />
    </Routes>
  </MemoryRouter>,
)

describe('Questionnaire Scale report UI matrix', () => {
  it('renders the shared DTO without aggregate/overall semantics in authenticated and public pages', async () => {
    const authenticated = render(
      <MemoryRouter initialEntries={['/student/questionnaires/assessment-1/result']}>
        <QuestionnaireResult />
      </MemoryRouter>,
    )
    expect(await screen.findByText('学习问卷')).toBeTruthy()
    expect(screen.getByText('仅用于本次作答解读。')).toBeTruthy()
    expect(screen.queryByText(/averageScore|overallScore|总体评价|聚合测评报告/)).toBeNull()
    authenticated.unmount()

    renderPublicResult('/public/questionnaire/token/result?sessionId=session-1')
    expect(await screen.findByText('学习问卷')).toBeTruthy()
    expect(screen.getByText('不构成医学诊断。')).toBeTruthy()
    expect(screen.queryByText(/averageScore|overallScore|总体评价|聚合测评报告/)).toBeNull()
  })

  it('does not leave a missing public session id in an infinite loading state', async () => {
    renderPublicResult('/public/questionnaire/token/result')

    expect(await screen.findByText('无法打开问卷报告')).toBeTruthy()
    expect(screen.getByText(/缺少问卷会话参数/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '返回问卷入口' })).toBeTruthy()
    expect(screen.queryByText('正在生成报告...')).toBeNull()
  })

  it('fails closed with an actionable entry path when the public resume capability is missing', async () => {
    mockResumeToken.mockReturnValue('')
    renderPublicResult('/public/questionnaire/token/result?sessionId=session-1')

    expect(await screen.findByText('无法打开问卷报告')).toBeTruthy()
    expect(screen.getByText(/缺少本次问卷的恢复凭据/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '返回问卷入口' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '重试读取报告' })).toBeNull()
  })
})
