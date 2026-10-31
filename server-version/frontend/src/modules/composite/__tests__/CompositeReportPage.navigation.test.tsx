import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import CompositeReportPage from '../CompositeReportPage'

const m = vi.hoisted(() => ({ view: vi.fn(), navigate: vi.fn() }))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => true }))
vi.mock('../../../training/learnerNavigation', () => ({ useTrainingLearnerNavigation: () => ({ enabled: false, navigate: m.navigate }) }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('../api', () => ({ compositeApi: {}, publicCompositeApi: (credential: string) => ({
  reportView: (id: string, wait: number, signal: AbortSignal) => m.view(credential, id, wait, signal),
}) }))
const response = (id: string) => ({ code: 0, data: {
  generation: { reportStatus: { state: 'READY' } },
  report: { id, assessmentId: 'synthetic-assessment', name: `报告 ${id}`, completedAt: null, totalTime: null, anonymousCode: null, backgroundValues: [], unitReports: [] },
} })
function Navigation() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/public/composite/attempts/b/report')}>切换报告 B</button>
}
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear() })

it('pairs the next report attempt with its own recovery proof and clears the previous report', async () => {
  sessionStorage.setItem('composite:recovery:attempt:a', 'synthetic-recovery-a')
  sessionStorage.setItem('composite:recovery:attempt:b', 'synthetic-recovery-b')
  let finish!: (value: ReturnType<typeof response>) => void
  const pending = new Promise<ReturnType<typeof response>>(resolve => { finish = resolve })
  m.view.mockImplementation((_credential: string, id: string) => id === 'b' ? pending : Promise.resolve(response(id)))
  render(<MemoryRouter initialEntries={['/public/composite/attempts/a/report']}><Navigation /><Routes>
    <Route path="/public/composite/attempts/:attemptId/report" element={<CompositeReportPage />} />
  </Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: '报告 a' })
  fireEvent.click(screen.getByRole('button', { name: '切换报告 B' }))
  await waitFor(() => expect(m.view).toHaveBeenCalledTimes(2))
  expect.soft(m.view.mock.calls.map(([credential, id]) => [credential, id])).toEqual([
    ['synthetic-recovery-a', 'a'], ['synthetic-recovery-b', 'b'],
  ])
  expect(screen.queryByRole('heading', { name: '报告 a' })).toBeNull()
  await act(async () => { finish(response('b')) })
  expect(await screen.findByRole('heading', { name: '报告 b' })).toBeInTheDocument()
})
