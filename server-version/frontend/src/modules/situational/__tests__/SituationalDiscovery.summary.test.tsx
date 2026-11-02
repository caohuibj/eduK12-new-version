import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SituationalHome from '../pages/SituationalHome'
import SituationalHistory from '../pages/SituationalHistory'
const { list, history } = vi.hoisted(() => ({ list: vi.fn(), history: vi.fn() }))
vi.mock('../api', () => ({ situationalApi: { listInstruments: list, history } }))
afterEach(cleanup)
describe('Situational lightweight discovery', () => {
  it('renders catalog cards without a runner definition or report template', async () => {
    list.mockResolvedValue({ code: 0, data: { list: [{ key: 'fixture', title: '情境练习', version: '1.0',
      scienceMaturity: 'PILOT', releaseStatus: 'PUBLISHED', sceneCount: 2, description: '试点说明' }] } })
    render(<MemoryRouter><SituationalHome /></MemoryRouter>)
    expect(await screen.findByText('情境练习')).toBeInTheDocument()
    expect(screen.getByText('2 组情境')).toBeInTheDocument()
    expect(screen.getByText('试点说明')).toBeInTheDocument()
  })
  it('renders a frozen zero-valued history metric without full result bodies', async () => {
    history.mockResolvedValue({ code: 0, data: { total: 1, list: [{ attemptId: 'attempt-1',
      attempt: { instrumentKey: 'fixture', instrumentVersion: '1.0', status: 'COMPLETED', startedAt: '2026-01-01T00:00:00Z' },
      instrument: { title: '历史练习', scientificContext: { scientificMaturity: 'PILOT' } },
      hasNarrative: false, primaryMetric: { label: '表达', value: 0, displayPrecision: 1 } }] } })
    render(<MemoryRouter><SituationalHistory /></MemoryRouter>)
    expect(await screen.findByText('历史练习')).toBeInTheDocument()
    expect(screen.getByText('表达：0.0')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '历史练习，查看已完成结果' })).toHaveAttribute('href', '/student/situational/attempts/attempt-1/result')
  })
})
