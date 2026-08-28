import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import QuestionnaireResult from '../../../pages/student/QuestionnaireResult'
import PublicQuestionnaireResult from '../../../pages/public/PublicQuestionnaireResult'

const { mockClient } = vi.hoisted(() => ({
  mockClient: { get: vi.fn() },
}))

vi.mock('../../../api/client', () => ({ default: mockClient }))

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
  mockClient.get.mockResolvedValue({ code: 0, data: report })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ code: 0, message: 'ok', data: report }),
  }))
})

describe('Questionnaire Scale report UI matrix', () => {
  it('renders the shared DTO without aggregate/overall semantics in authenticated and public pages', async () => {
    const authenticated = render(
      <MemoryRouter initialEntries={['/student/questionnaires/assessment-1/result']}>
        <QuestionnaireResult />
      </MemoryRouter>
    )
    expect(await screen.findByText('学习问卷')).toBeTruthy()
    expect(screen.getByText('仅用于本次作答解读。')).toBeTruthy()
    expect(screen.queryByText(/averageScore|overallScore|总体评价|聚合测评报告/)).toBeNull()
    authenticated.unmount()

    render(
      <MemoryRouter initialEntries={['/public/questionnaires/token/result?sessionId=session-1']}>
        <PublicQuestionnaireResult />
      </MemoryRouter>
    )
    expect(await screen.findByText('学习问卷')).toBeTruthy()
    expect(screen.getByText('不构成医学诊断。')).toBeTruthy()
    expect(screen.queryByText(/averageScore|overallScore|总体评价|聚合测评报告/)).toBeNull()
  })
})
