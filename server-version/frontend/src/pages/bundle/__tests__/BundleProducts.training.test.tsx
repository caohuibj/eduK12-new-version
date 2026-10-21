import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), training: true }))
vi.mock('../../../api/client', () => ({ default: mocks }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher', role: 'TEACHER' } }) }))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => mocks.training }))
import { BundleProducts } from '../BundleProducts'

const catalog = [
  { name: '已授权问卷', bundleKey: 'authorized', bundleVersion: '1.0', description: '授权定义', canInstantiate: true, slots: [{ slotKey: 'wellbeing', unitType: 'SCALE', instrumentKey: 'WB', instrumentVersion: '1.0' }] },
  { name: '未授权问卷', bundleKey: 'unauthorized', bundleVersion: '2.0', canInstantiate: false, slots: [] },
]
const resources = { scales: [{ id: 'right', name: '正确量表', code: 'WB', version: '1.0' }, { id: 'wrong', name: '其他版本', code: 'WB', version: '2.0' }], cognitive: [], courses: [{ id: 'course-a', title: '来源课程' }] }
const initial = '/bundle-products?authorized=1&courseId=course-a&returnTo=' + encodeURIComponent('/courses/course-a/detail?section=assessments')
function Location() { const location = useLocation(); return <output aria-label="address">{location.pathname + location.search}</output> }
function mount(path = initial) { render(<MemoryRouter initialEntries={[path]}><Location /><Routes><Route path="/bundle-products" element={<BundleProducts />} /><Route path="/bundle-products/:id" element={<h1>投放草稿</h1>} /></Routes></MemoryRouter>) }
beforeEach(() => {
  vi.clearAllMocks(); mocks.training = true
  mocks.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/catalog') ? catalog : path.endsWith('/resources') ? resources : [] }))
  mocks.post.mockResolvedValue({ code: 0, data: { id: 'created' } })
})

describe('Training authorized questionnaires', () => {
  it('shows only currently usable versions, searches them and creates a new course delivery without copying', async () => {
    mount()
    const choose = await screen.findByRole('button', { name: '使用此问卷' })
    expect(screen.getByRole('heading', { name: '使用授权问卷' })).toBeInTheDocument()
    expect(screen.queryByText(/未授权问卷/)).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: '检索问卷' }), { target: { value: 'NOT_FOUND' } })
    expect(screen.queryByRole('button', { name: '使用此问卷' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: '检索问卷' }), { target: { value: 'authorized' } })
    fireEvent.click(screen.getByRole('button', { name: choose.textContent! }))
    expect(screen.getByRole('combobox', { name: '投放课程' })).toHaveValue('course-a')
    expect(screen.getByRole('combobox', { name: '投放课程' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /选择wellbeing/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /其他版本/ })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '选择 正确量表，版本 1.0' }))
    expect(mocks.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '创建投放草稿' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/bundle-products', expect.objectContaining({ bundleKey: 'authorized', bundleVersion: '1.0', courseId: 'course-a', bindings: [{ slotKey: 'wellbeing', resourceId: 'right' }], requestId: expect.any(String) })))
    expect(await screen.findByRole('heading', { name: '投放草稿' })).toBeInTheDocument()
    expect(screen.getByLabelText('address')).toHaveTextContent('/bundle-products/created?returnTo=%2Fcourses%2Fcourse-a%2Fdetail%3Fsection%3Dassessments&courseId=course-a')
  })

  it('does not silently change an unavailable source course into anonymous delivery', async () => {
    mocks.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/catalog') ? catalog : path.endsWith('/resources') ? { ...resources, courses: [] } : [] }))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: '使用此问卷' }))
    expect(screen.getByText(/当前课程已不可用或无投放权限/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建投放草稿' })).toBeDisabled()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('preserves the non-Training catalog and its unavailable-version explanation', async () => {
    mocks.training = false
    mount('/bundle-products')
    expect(await screen.findByText('未授权问卷 · 2.0')).toBeInTheDocument()
    expect(screen.getByText('暂不可创建：尚未发布、未授权或新建入口未开放')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '选择此包' })[1]).toBeDisabled()
  })
})
