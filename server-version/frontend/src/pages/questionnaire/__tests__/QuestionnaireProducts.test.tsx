import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: api }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../../components/PublicDeliveryManager', () => ({
  PublicDeliveryManager: () => null,
}))
import { QuestionnaireProductEdit } from '../QuestionnaireProducts'
function mount(id = 'new', search = '') {
  render(
    <MemoryRouter initialEntries={['/questionnaire-products/' + id + search]}>
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
  it('exposes the active composition section to keyboard and screen-reader users', async () => {
    mount()
    const steps = screen.getByRole('navigation', { name: '编制步骤' })
    const basic = steps.querySelector('a[href="#questionnaire-basic"]')!
    const delivery = steps.querySelector('a[href="#questionnaire-delivery"]')!
    expect(basic).toHaveAttribute('aria-current', 'step')
    fireEvent.click(delivery)
    expect(delivery).toHaveAttribute('aria-current', 'step')
    expect(basic).not.toHaveAttribute('aria-current')
  })

  it('prefills only an authorized course passed by the Training course route', async () => {
    mount('new', '?courseId=c')
    const courseCheck = await screen.findByRole('checkbox', { name: '课程' })
    await waitFor(() => expect(courseCheck).toBeChecked())
  })

  it('does not preselect an unlisted course from a tampered URL', async () => {
    mount('new', '?courseId=outside')
    const courseCheck = await screen.findByRole('checkbox', { name: '课程' })
    expect(courseCheck).not.toBeChecked()
  })

  it('discards a previous questionnaire response after switching pages', async () => {
    let resolveOld!: (value: unknown) => void
    const oldRequest = new Promise(resolve => { resolveOld = resolve })
    const row = (name: string) => ({ name, status: 'DRAFT', revision: 1, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false })
    api.get.mockImplementation(async path => path.endsWith('/resources')
      ? { code: 0, data: { scales: [], cognitive: [], situational: [], courses: [] } }
      : path.endsWith('/old') ? oldRequest : { code: 0, data: row('当前问卷') })
    render(<MemoryRouter initialEntries={['/questionnaire-products/old']}><Link to="/questionnaire-products/current">切换问卷</Link><Routes><Route path="/questionnaire-products/:id" element={<QuestionnaireProductEdit />} /></Routes></MemoryRouter>)
    await userEvent.setup().click(screen.getByRole('link', { name: '切换问卷' }))
    await screen.findByDisplayValue('当前问卷')
    await act(async () => { resolveOld({ code: 0, data: row('迟到的旧问卷') }); await oldRequest })
    expect(screen.getByLabelText('测评名称')).toHaveValue('当前问卷')
  })
  it('offers publication for a saved draft while preserving the revision guard', async () => {
    const row = { name: '待发布测评', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 0, data: { ...row, status: 'PUBLISHED', revision: 8 } })
    mount('saved')
    const publish = await screen.findByRole('button', { name: '发布组合测评' })
    expect(publish.closest('section')).toHaveAttribute('aria-label', '正式发布')
    await userEvent.setup().click(publish)
    expect(api.post).toHaveBeenCalledWith('/questionnaire-products/saved/publish', { revision: 7 })
    await waitFor(() => expect(screen.queryByRole('button', { name: '发布组合测评' })).not.toBeInTheDocument())
  })

  it('identifies and focuses an empty name without sending a request', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请填写测评名称')
    expect(screen.getByLabelText('测评名称')).toHaveFocus()
    expect(screen.getByLabelText('测评名称')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(api.post).not.toHaveBeenCalled()
  })
  it('preserves API message objects and permits course-less drafts under the actual rule', async () => {
    const user = userEvent.setup()
    api.post.mockRejectedValue({ message: '该名称暂不可用' })
    mount()
    await user.type(screen.getByLabelText('测评名称'), '合成问卷')
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('该名称暂不可用')
    expect(api.post).toHaveBeenCalledWith(
      '/questionnaire-products',
      expect.objectContaining({ courseIds: [], name: '合成问卷' }),
    )
    expect(screen.getByLabelText('测评名称')).toHaveValue('合成问卷')
  })
  it('shows a field-level deadline requirement for public drafts', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('测评名称'), '公开问卷')
    await user.selectOptions(screen.getByLabelText('投放方式'), 'GENERAL')
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '公开问卷需要设置截止时间',
    )
    expect(screen.getByLabelText('截止时间')).toHaveFocus()
    expect(api.post).not.toHaveBeenCalled()
  })
  it('rejects a deadline earlier than the opening time before saving', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('测评名称'), { target: { value: '时间校验' } })
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-10-20T09:00' } })
    fireEvent.change(screen.getByLabelText('截止时间'), { target: { value: '2026-10-19T18:00' } })
    fireEvent.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent('截止时间不能早于开始时间')
    expect(screen.getByLabelText('截止时间')).toHaveFocus()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('blocks publication and hides stale checks after editing delivery settings', async () => {
    const row = { name: '投放测评', status: 'DRAFT', revision: 7, questionnaireType: 'COURSE', questionnaireCourses: [], items: [], formSections: [], publicEnabled: false }
    api.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/resources') ? { scales: [], cognitive: [], situational: [], courses: [] } : row }))
    api.post.mockResolvedValue({ code: 0, data: { revision: 7, ok: true, checks: [] } })
    mount('saved')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '发布前自检' }))
    await screen.findByRole('heading', { name: '当前草稿自检通过' })
    fireEvent.change(screen.getByLabelText('开始时间'), { target: { value: '2026-10-20T09:00' } })
    expect(screen.getByRole('button', { name: '发布组合测评' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: '当前草稿自检通过' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存投放设置' })).toBeEnabled()
  })

  it('rejects incomplete and invalid calendar dates before creating a public draft', async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('测评名称'), '公开问卷')
    await user.selectOptions(screen.getByLabelText('投放方式'), 'GENERAL')
    fireEvent.change(screen.getByLabelText('截止时间'), { target: { value: '2026-02' } })
    expect(screen.getByLabelText('截止时间')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('截止时间'), { target: { value: '2026-02-31T23:59' } })
    await user.click(screen.getByRole('button', { name: '创建草稿' }))
    expect(screen.getByRole('alert')).toHaveTextContent('公开问卷需要设置截止时间')
    expect(screen.getByLabelText('截止时间')).toHaveFocus()
    expect(api.post).not.toHaveBeenCalled()
  })
})
