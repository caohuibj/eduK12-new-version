import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), userId: 'reviewer' }))
vi.mock('../../../api/client', () => ({ default: mocks }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.userId, role: 'ADMIN' } }) }))
import BundleAuthoring from '../BundleAuthoring'
const record = { id: 'one', bundleKey: 'approved_content', bundleVersion: '1.0.0', status: 'DRAFT', installedBy: 'author', contentHash: 'a'.repeat(64), content: { schemaVersion: 1 } }
const preview = { contentHash: record.contentHash, blockers: [], requiredClaims: ['independent_summary'], definition: { name: '合成包', bundleVersion: '1.0.0', slots: [] }, scenarios: [{ name: 'missing', kind: 'UNAVAILABLE', ruleIds: [] }], report: {}, scientific: {} }
beforeEach(() => {
  vi.clearAllMocks(); mocks.userId = 'reviewer'
  mocks.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/definitions') ? [record] : record }))
  mocks.post.mockResolvedValue({ code: 0, data: preview })
})
async function open(published = false) {
  render(<MemoryRouter><BundleAuthoring /></MemoryRouter>)
  await userEvent.click(await screen.findByRole('button', { name: '查看定义与审批' }))
  await screen.findByRole('button', { name: published ? '独立续审并发布' : '独立审批发布' })
}
describe('fixed package independent review', () => {
  it.each(['author', 'reviewer'])('makes HOLD restoration explicit and independently reviewed for %s', async userId => {
    mocks.userId = userId
    const held = { ...record, status: 'HOLD', review: { expiresAt: '2099-01-01T00:00:00.000Z' } }
    mocks.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/definitions') ? [held] : held }))
    render(<MemoryRouter><BundleAuthoring /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: '查看定义与审批' }))
    const action = await screen.findByRole('button', { name: '重新审核并恢复发布' })
    expect(action).toBeDisabled()
    expect(screen.getByText(/此版本暂停新投放/)).toBeInTheDocument()
    if (userId === 'author') {
      expect(screen.getByText('此版本由你登记，请交由另一位管理员审核。')).toBeInTheDocument()
      return
    }
    const user = userEvent.setup()
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox)
    await user.click(action)
    expect(await screen.findByRole('dialog', { name: '重新审核并恢复固定包发布' })).toBeInTheDocument()
    mocks.post.mockResolvedValue({ code: 0, data: { ...held, status: 'PUBLISHED' } })
    await user.click(screen.getByRole('button', { name: '重新审核并恢复' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/bundle-products/admin/definitions/approved_content/1.0.0/approve', {
      contentHash: record.contentHash, scientific: true, rights: true, language: true, report: true, claims: ['independent_summary'],
    }))
    await waitFor(() => expect(screen.getByRole('button', { name: '独立续审并发布' })).toBeDisabled())
  })
  it('keeps the installing administrator from approving their own version', async () => {
    mocks.userId = 'author'
    await open()
    expect(screen.getByText('此版本由你登记，请交由另一位管理员审核。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '独立审批发布' })).toBeDisabled()
    expect(screen.getAllByRole('checkbox').every(element => (element as HTMLInputElement).disabled || element.closest('fieldset')?.disabled)).toBe(true)
  })
  it('requires four explicit checks and confirmation, and submits only the reviewed content hash', async () => {
    await open()
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: '独立审批发布' })).toBeDisabled()
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox)
    await user.click(screen.getByRole('button', { name: '独立审批发布' }))
    expect(await screen.findByRole('dialog', { name: '审批并发布固定包版本' })).toBeInTheDocument()
    mocks.post.mockResolvedValue({ code: 0, data: { ...record, status: 'PUBLISHED' } })
    await user.click(screen.getByRole('button', { name: '审批发布' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/bundle-products/admin/definitions/approved_content/1.0.0/approve', {
      contentHash: record.contentHash, scientific: true, rights: true, language: true, report: true, claims: ['independent_summary'],
    }))
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain('signature')
    await waitFor(() => expect(screen.getByRole('button', { name: '独立续审并发布' })).toBeDisabled())
  })
  it.each(['author', 'reviewer'])('provides expired-version renewal with independent review for %s', async userId => {
    mocks.userId = userId
    const published = { ...record, status: 'PUBLISHED', review: { expiresAt: '2020-01-01T00:00:00.000Z' } }
    mocks.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/definitions') ? [published] : published }))
    await open(true)
    expect(screen.getByText(/审批已到期/)).toBeInTheDocument()
    const action = screen.getByRole('button', { name: '独立续审并发布' })
    expect(action).toBeDisabled()
    if (userId === 'author') {
      expect(screen.getByText('此版本由你登记，请交由另一位管理员审核。')).toBeInTheDocument()
      return
    }
    const user = userEvent.setup()
    for (const checkbox of screen.getAllByRole('checkbox')) await user.click(checkbox)
    await user.click(action)
    expect(await screen.findByRole('dialog', { name: '续审已发布固定包版本' })).toBeInTheDocument()
    mocks.post.mockResolvedValue({ code: 0, data: { ...published, review: { expiresAt: '2099-01-01T00:00:00.000Z' } } })
    await user.click(screen.getByRole('button', { name: '确认续审' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/bundle-products/admin/definitions/approved_content/1.0.0/approve', {
      contentHash: record.contentHash, scientific: true, rights: true, language: true, report: true, claims: ['independent_summary'],
    }))
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain('signature')
    await waitFor(() => expect(screen.getByRole('button', { name: '独立续审并发布' })).toBeDisabled())
  })
})
