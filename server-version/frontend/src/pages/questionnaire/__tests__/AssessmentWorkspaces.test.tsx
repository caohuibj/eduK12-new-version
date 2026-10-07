import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, confirm: vi.fn(), user: { id: 'teacher-a' } }))
vi.mock('../../../api/client', () => ({ default: state.api }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organizations: [], active: { organization: { id: 'org' }, allowedActions: [] }, activeLoading: false, selectOrganization: vi.fn() }) }))
vi.mock('../../../components/staff-ui/useStaffFeedback', () => ({ useStaffFeedback: () => ({ confirm: state.confirm, feedback: null }) }))
import AssessmentTemplates from '../AssessmentTemplates'
import AssessmentManagement from '../AssessmentManagement'
import AssessmentWorkbench from '../../teacher/AssessmentWorkbench'
import ClassroomSummary from '../../teacher/ClassroomSummary'

beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); state.confirm.mockResolvedValue(true); state.user = { id: 'teacher-a' } })
const success = (data: unknown) => ({ code: 0, data })

describe('assessment workspace management boundaries', () => {
  it('retries template creation with the same principal-scoped request identity', async () => {
    state.api.get.mockResolvedValue(success({ list: [{ id: 'template', name: '私有模板' }], total: 1 }))
    state.api.post.mockRejectedValueOnce({ message: '网络中断，请重试' }).mockResolvedValueOnce(success({ id: 'copy' }))
    render(<MemoryRouter><Routes><Route path="/" element={<AssessmentTemplates />} /><Route path="/questionnaire-products/copy" element={<p>已进入新草稿</p>} /></Routes></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '复制为新草稿' }))
    await screen.findByText('网络中断，请重试')
    const identity = state.api.post.mock.calls[0][1].requestId
    expect(sessionStorage.getItem('composition-template:teacher-a:template')).toBe(identity)
    await user.click(screen.getByRole('button', { name: '复制为新草稿' }))
    await screen.findByText('已进入新草稿')
    expect(state.api.post.mock.calls[1][1].requestId).toBe(identity)
    expect(sessionStorage.getItem('composition-template:teacher-a:template')).toBeNull()
  })

  it('archives selected editable records separately and keeps acknowledged success after another failure', async () => {
    const rows = ['a', 'b'].map(id => ({ id, name: '合成对象 ' + id, kind: 'COLLECTION', status: 'DRAFT', created: '2026-10-07T00:00:00Z', editHref: '/questionnaire-products/' + id }))
    state.api.get.mockImplementation(async path => path.includes('management-events') ? success({ list: [], hasMore: false }) : path.includes('?') ? success({ list: rows, total: 2 }) : success({ revision: 7, status: 'DRAFT' }))
    state.api.post.mockImplementation(async path => { if (path.includes('/b/')) throw { message: '草稿版本已变化' }; return success({}) })
    render(<MemoryRouter><AssessmentManagement /></MemoryRouter>)
    const user = userEvent.setup()
    await screen.findByText('合成对象 a · 草稿')
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox)
    await user.click(screen.getByRole('button', { name: '预览并归档选中对象' }))
    await screen.findByText('草稿版本已变化')
    expect(screen.getByText('合成对象 a · 已归档')).toBeInTheDocument()
    expect(state.api.post).toHaveBeenCalledWith('/questionnaire-products/a/archive', { revision: 7 })
    expect(state.api.post).toHaveBeenCalledWith('/questionnaire-products/b/archive', { revision: 7 })
    expect(state.confirm).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining('2 个对象') }))
    fireEvent.change(screen.getByLabelText('名称或测试标记'), { target: { value: 'dotqa_%' } })
    await waitFor(() => expect(state.api.get).toHaveBeenCalledWith(expect.stringContaining('search=dotqa_%25')))
  })

  it('drops a stale course response and shows no organization report actions without authority', async () => {
    let resolve!: (value: unknown) => void
    const previous = new Promise(value => { resolve = value })
    const overview = (id: string) => ({ course: { id, title: id }, list: [], quality: [], total: 0, page: 1, pageSize: 20, countMeaning: '作答次数', qualityHasMore: false })
    state.api.get.mockImplementation(async path => path.includes('/resources') ? success({ courses: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }) : path.includes('/a?') ? previous : success(overview('b')))
    render(<MemoryRouter initialEntries={['/?courseId=a']}><AssessmentWorkbench /></MemoryRouter>)
    await screen.findByRole('option', { name: 'B' })
    fireEvent.change(screen.getByRole('combobox', { name: '课程' }), { target: { value: 'b' } })
    await screen.findByText('b · 投放完成情况')
    await act(async () => resolve(success(overview('a'))))
    expect(screen.queryByText('a · 投放完成情况')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /单次群体/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /家长报告批量/ })).not.toBeInTheDocument()
  })

  it('does not generate a classroom snapshot on GET or hide a generation error', async () => {
    state.api.get.mockResolvedValue(success(null))
    state.api.post.mockRejectedValue({ message: '课堂尚未结束' })
    render(<ClassroomSummary id="classroom" />)
    const button = await screen.findByRole('button', { name: '生成课堂小结' })
    await waitFor(() => expect(button).toBeEnabled())
    expect(state.api.post).not.toHaveBeenCalled()
    await userEvent.setup().click(button)
    await screen.findByText('课堂尚未结束')
    expect(state.api.post).toHaveBeenCalledWith('/classrooms/classroom/summary', {})
  })
})
