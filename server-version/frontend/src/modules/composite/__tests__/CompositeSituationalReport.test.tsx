import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompositeReportPage from '../CompositeReportPage'

const { mockCompositeApi } = vi.hoisted(() => ({
  mockCompositeApi: {
    report: vi.fn(),
    teacherReport: vi.fn(),
    snapshots: vi.fn(),
    reanalyze: vi.fn(),
    downloadAnalysisExport: vi.fn(),
  },
}))

vi.mock('../api', () => ({
  compositeApi: mockCompositeApi,
  publicCompositeApi: () => mockCompositeApi,
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'STUDENT' } }),
}))

describe('CompositeReportPage Situational projection', () => {
  it('renders frozen Situational metrics instead of an empty titled card', async () => {
    mockCompositeApi.report.mockResolvedValue({
      code: 0,
      data: {
        id: 'attempt-sit',
        assessmentId: 'composite-1',
        name: '情境综合测评',
        anonymousCode: null,
        completedAt: '2026-09-13T00:00:00Z',
        totalTime: 120000,
        backgroundValues: [],
        unitReports: [{
          itemId: 'item-sit',
          type: 'SITUATIONAL',
          kind: 'situational',
          label: '校园协作情境',
          instrumentKey: 'school-collaboration',
          instrumentVersion: '1.0.0',
          qualityState: 'interpretable',
          metrics: [{ key: 'collaboration.behavior', value: 0.75 }],
        }],
      },
    })

    render(
      <MemoryRouter initialEntries={['/student/composite/attempts/attempt-sit/report']}>
        <Routes>
          <Route path="/student/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('校园协作情境')).toBeTruthy()
    expect(screen.getByTestId('situational-report-item-sit')).toBeTruthy()
    expect(screen.getByText('collaboration.behavior')).toBeTruthy()
    expect(screen.getByText('0.75')).toBeTruthy()
    expect(screen.getByTestId('situational-frozen-projection-limitation')).toBeTruthy()
  })
})
