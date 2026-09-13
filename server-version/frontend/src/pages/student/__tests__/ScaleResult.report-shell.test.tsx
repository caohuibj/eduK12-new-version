import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ScaleResult from '../ScaleResult'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('../../../api/client', () => ({
  default: { get: mockGet },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ScaleResult ReportShell', () => {
  it('renders completion facts and frozen scale report content', async () => {
    mockGet.mockResolvedValue({
      code: 0,
      data: {
        id: 'assessment-1',
        status: 'COMPLETED',
        startedAt: '2026-09-13T00:00:00Z',
        completedAt: '2026-09-13T00:03:20Z',
        totalTime: 200000,
        scale: { id: 'scale-1', code: 'S1', name: '示例量表', description: null },
        result: {
          quality: { status: 'valid', flags: [] },
          scores: [],
          references: [],
          interpretations: [],
          caveats: [],
          disclaimer: '冻结免责声明',
          method: {},
        },
      },
    })

    render(
      <MemoryRouter initialEntries={['/student/scales/assessments/assessment-1/result']}>
        <Routes>
          <Route path="/student/scales/assessments/:assessmentId/result" element={<ScaleResult />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { level: 1, name: '示例量表' })).toBeTruthy()
    expect(screen.getByText('已提交')).toBeTruthy()
    expect(screen.getByTestId('report-completion-facts')).toHaveTextContent('3分20秒')
    expect(screen.getByText('冻结免责声明')).toBeTruthy()
  })

  it('keeps report read failure distinct from submission failure', async () => {
    mockGet.mockRejectedValue(new Error('网络读取失败'))

    render(
      <MemoryRouter initialEntries={['/student/scales/assessments/assessment-2/result']}>
        <Routes>
          <Route path="/student/scales/assessments/:assessmentId/result" element={<ScaleResult />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('报告暂时无法打开')).toBeTruthy()
    expect(screen.getByText('网络读取失败')).toBeTruthy()
    expect(screen.queryByText(/提交失败/)).toBeNull()
  })
})
