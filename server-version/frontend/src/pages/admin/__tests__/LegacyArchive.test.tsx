import { describe, beforeEach, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), overview: vi.fn(), role: 'SYSTEM_ADMIN' }))
vi.mock('../../../api/legacyArchive', () => ({ legacyArchiveApi: mocks }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ platformRole: mocks.role }) }))
import LegacyArchive from '../LegacyArchive'
const show = (path = '/admin/legacy-archive') => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/admin/legacy-archive" element={<LegacyArchive />} />
  <Route path="/admin/legacy-archive/:kind/:id" element={<LegacyArchive />} />
</Routes></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks(); mocks.role = 'SYSTEM_ADMIN'
  mocks.overview.mockResolvedValue({ code: 0, data: { assessments: 128, questionnaireAssessments: 21, formAnswers: 108 } })
  mocks.list.mockResolvedValue({ code: 0, data: { list: [{ id: 'a1', instrumentName: '旧量表', nickname: '合成用户', username: 'synthetic', status: 'IN_PROGRESS', startedAt: '2026-01-01T00:00:00Z' }], total: 1, pageSize: 25 } })
})
describe('legacy archive page', () => {
  it('marks unchanged historical states and links read-only details', async () => {
    show()
    expect(await screen.findByText('旧量表')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('未重新计分')
    expect(screen.getByText('进行中（历史状态）')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '只读查看' })).toHaveAttribute('href', '/admin/legacy-archive/assessments/a1')
    expect(screen.queryByRole('button', { name: /继续作答|编辑|提交/ })).not.toBeInTheDocument()
  })
  it('does not query archive data for a standard principal', () => {
    mocks.role = 'STANDARD'; show()
    expect(screen.getByRole('alert')).toHaveTextContent('仅系统管理员')
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.overview).not.toHaveBeenCalled()
  })
  it('renders legacy feedback as escaped text', async () => {
    mocks.detail.mockResolvedValue({ code: 0, data: { id: 'a1', instrumentName: '旧量表', username: 'synthetic', status: 'COMPLETED', startedAt: '2026-01-01T00:00:00Z', completedAt: null, scores: { raw: 42 }, feedback: '<script>malicious()</script>' } })
    show('/admin/legacy-archive/assessments/a1')
    expect(await screen.findByText('<script>malicious()</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/"raw": 42/)).toBeInTheDocument()
  })
  it('shows read failures, retries and clears stale rows', async () => {
    mocks.list.mockRejectedValueOnce(new Error('private backend error'))
    const user = userEvent.setup(); show()
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读取')
    expect(screen.queryByText('private backend error')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByText('旧量表')).toBeInTheDocument())
  })
})
