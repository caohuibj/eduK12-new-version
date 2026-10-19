import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('../../../api/client', () => ({ default: api }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true }))
vi.mock('../../../components/staff-ui/useStaffFeedback', () => ({ useStaffFeedback: () => ({ confirm: vi.fn(), feedback: null }) }))
import { QuestionnaireProductList } from '../QuestionnaireProducts'
import AssessmentTemplates from '../AssessmentTemplates'
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear() })
describe('template delivery policy guidance', () => {
  it('explains scoped reset before saving without changing normal copy or submitting on cancel', async () => {
    api.get.mockResolvedValue({ code: 0, data: { list: [{ id: 'q', name: 'Training', status: 'PUBLISHED', kind: 'COLLECTION', editHref: '/questionnaire-products/q' }], total: 1 } })
    render(<MemoryRouter><QuestionnaireProductList /></MemoryRouter>)
    await userEvent.setup().click(await screen.findByRole('button', { name: '保存为组合模板' }))
    const panel = screen.getByRole('region', { name: '保存组合模板' })
    expect(within(panel).getByText(/模板不保留学员反馈开放时间、草稿保留时长或课程级作答计时选项/)).toHaveTextContent('认知任务的刺激时序不变')
    expect(within(panel).getByText(/请为新课程重新选择/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(within(panel).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('region', { name: '保存组合模板' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '复制为新草稿' })).toBeEnabled()
    expect(api.post).not.toHaveBeenCalled()
  })
  it('shows new-course selection guidance before instantiate and sends only the existing request identity', async () => {
    api.get.mockResolvedValue({ code: 0, data: { list: [{ id: 't', name: '私有模板' }], total: 1 } })
    api.post.mockResolvedValue({ code: 0, data: { id: 'draft' } })
    render(<MemoryRouter><Routes><Route path="/" element={<AssessmentTemplates />} /><Route path="/questionnaire-products/draft" element={<p>新草稿</p>} /></Routes></MemoryRouter>)
    const copy = await screen.findByRole('button', { name: '复制为新草稿' })
    expect(screen.getByText(/学员反馈开放时间、草稿保留时长和课程级作答计时选项不随模板复制/)).toHaveTextContent('请为新课程重新选择这些投放设置后再发布')
    expect(screen.getByText(/刺激时序不变/)).toBeInTheDocument()
    await userEvent.setup().click(copy)
    expect(await screen.findByText('新草稿')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/templates/t/instantiate', { requestId: expect.any(String) })
    expect(Object.keys(api.post.mock.calls[0][1])).toEqual(['requestId'])
  })
})
