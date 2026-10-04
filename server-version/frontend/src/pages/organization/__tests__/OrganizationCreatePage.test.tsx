import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn(), state: { allowedActions: [] as string[], isLoading: true, error: null as string | null } }))
vi.mock('../../../api/organizations', () => ({ organizationApi: { create: mocks.create } }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ ...mocks.state, refresh: mocks.refresh }) }))
import OrganizationCreatePage from '../OrganizationCreatePage'
beforeEach(() => { vi.clearAllMocks(); mocks.state = { allowedActions: [], isLoading: true, error: null } })
it('shows loading, denied and failure states without mounting a submittable form', () => {
  const view = render(<MemoryRouter><OrganizationCreatePage /></MemoryRouter>)
  expect(screen.getByText('正在确认组织创建权限')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '创建组织' })).toBeNull()
  mocks.state.isLoading = false
  view.rerender(<MemoryRouter><OrganizationCreatePage /></MemoryRouter>)
  expect(screen.getByText('当前服务器未授予组织创建权限。')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).toBeNull()
  mocks.state.error = '连接失败'
  view.rerender(<MemoryRouter><OrganizationCreatePage /></MemoryRouter>)
  expect(screen.getByText('无法确认组织创建权限')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }))
  expect(mocks.refresh).toHaveBeenCalledOnce()
  expect(mocks.create).not.toHaveBeenCalled()
})
it('mounts the form only after creation is explicitly granted', () => {
  mocks.state = { allowedActions: ['CREATE_ORGANIZATION'], isLoading: false, error: null }
  render(<MemoryRouter><OrganizationCreatePage /></MemoryRouter>)
  expect(screen.getByRole('textbox', { name: '首位管理员用户 ID' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '创建组织' })).toBeEnabled()
})

it('preserves the specific API error when creation is rejected', async () => {
  mocks.state = { allowedActions: ['CREATE_ORGANIZATION'], isLoading: false, error: null }
  mocks.create.mockRejectedValue({ message: '首位管理员用户不存在', status: 400 })
  render(<MemoryRouter><OrganizationCreatePage /></MemoryRouter>)
  fireEvent.change(screen.getByRole('textbox', { name: '组织名称' }), { target: { value: '验收组织' } })
  fireEvent.change(screen.getByRole('textbox', { name: '首位管理员用户 ID' }), { target: { value: 'unknown-user' } })
  fireEvent.submit(screen.getByRole('button', { name: '创建组织' }).closest('form')!)
  expect(await screen.findByText('首位管理员用户不存在')).toBeInTheDocument()
})
