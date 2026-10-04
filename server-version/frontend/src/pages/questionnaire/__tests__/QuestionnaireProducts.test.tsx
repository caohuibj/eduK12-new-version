import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: api }))
vi.mock('../../../components/PublicDeliveryManager', () => ({
  PublicDeliveryManager: () => null,
}))
import { QuestionnaireProductEdit } from '../QuestionnaireProducts'
function mount(id = 'new') {
  render(
    <MemoryRouter initialEntries={['/questionnaire-products/' + id]}>
      <Routes>
        <Route
          path="/questionnaire-products/:id"
          element={<QuestionnaireProductEdit />}
        />
      </Routes>
    </MemoryRouter>,
  )
}
describe('questionnaire draft feedback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.get.mockResolvedValue({
      code: 0,
      data: {
        scales: [],
        cognitive: [],
        situational: [],
        courses: [{ id: 'c', title: '课程' }],
      },
    })
  })
  it('identifies and focuses an empty name without sending a request', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请填写问卷名称')
    expect(screen.getByLabelText('问卷名称')).toHaveFocus()
    expect(screen.getByLabelText('问卷名称')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(api.post).not.toHaveBeenCalled()
  })
  it('preserves API message objects and permits course-less drafts under the actual rule', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue({ message: '该名称暂不可用' })
    mount()
    await user.type(screen.getByLabelText('问卷名称'), '合成问卷')
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('该名称暂不可用')
    expect(api.post).toHaveBeenCalledWith(
      '/questionnaire-products',
      expect.objectContaining({ courseIds: [], name: '合成问卷' }),
    )
    expect(screen.getByLabelText('问卷名称')).toHaveValue('合成问卷')
  })
  it('shows a field-level deadline requirement for public drafts', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('问卷名称'), '公开问卷')
    await user.selectOptions(screen.getByLabelText('问卷类型'), 'GENERAL')
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '公开问卷需要设置截止时间',
    )
    expect(screen.getByLabelText('截止时间')).toHaveFocus()
    expect(api.post).not.toHaveBeenCalled()
  })
})
