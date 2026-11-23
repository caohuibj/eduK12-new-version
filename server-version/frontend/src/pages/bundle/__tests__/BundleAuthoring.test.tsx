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
async function open(status = 'DRAFT') {
  render(<MemoryRouter><BundleAuthoring /></MemoryRouter>)
  await userEvent.click(await screen.findByRole('button', { name: '查看与发布' }))
  if (['DRAFT', 'HOLD'].includes(status)) {
    await screen.findByRole('button', { name: status === 'HOLD' ? '恢复发布此版本' : '发布此版本' })
  } else {
    await screen.findByText(/当前版本已发布/)
  }
}
describe('fixed package single-admin functional publish', () => {
  it.each(['author', 'reviewer'])('allows a system admin (%s) to restore a HOLD version once structural checks pass', async userId => {
    mocks.userId = userId
    const held = { ...record, status: 'HOLD' }
    mocks.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/definitions') ? [held] : held }))
    render(<MemoryRouter><BundleAuthoring /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: '查看与发布' }))
    const action = await screen.findByRole('button', { name: '恢复发布此版本' })
    expect(action).toBeEnabled()
    expect(screen.getByText(/此版本当前处于暂停状态/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(action)
    expect(await screen.findByRole('dialog', { name: '恢复固定包发布' })).toBeInTheDocument()
    mocks.post.mockResolvedValue({ code: 0, data: { ...held, status: 'PUBLISHED' } })
    await user.click(screen.getByRole('button', { name: '确认恢复发布' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/bundle-products/admin/definitions/approved_content/1.0.0/approve', {
      contentHash: record.contentHash, claims: ['independent_summary'],
    }))
    expect(await screen.findByText(/当前版本已发布/)).toBeInTheDocument()
  })
  it('allows the installing administrator to publish directly once structural and synthetic checks pass', async () => {
    mocks.userId = 'author'
    await open()
    const user = userEvent.setup()
    const publishBtn = screen.getByRole('button', { name: '发布此版本' })
    expect(publishBtn).toBeEnabled()
    await user.click(publishBtn)
    expect(await screen.findByRole('dialog', { name: '发布固定包版本' })).toBeInTheDocument()
    mocks.post.mockResolvedValue({ code: 0, data: { ...record, status: 'PUBLISHED' } })
    await user.click(screen.getByRole('button', { name: '确认发布' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/bundle-products/admin/definitions/approved_content/1.0.0/approve', {
      contentHash: record.contentHash, claims: ['independent_summary'],
    }))
    expect(JSON.stringify(mocks.post.mock.calls)).not.toContain('signature')
    expect(await screen.findByText(/当前版本已发布/)).toBeInTheDocument()
  })
  it('keeps published version immutable without arbitrary 7-day expiry timers', async () => {
    const published = { ...record, status: 'PUBLISHED', review: { expiresAt: '2020-01-01T00:00:00.000Z' } }
    mocks.get.mockImplementation(async path => ({ code: 0, data: path.endsWith('/definitions') ? [published] : published }))
    await open('PUBLISHED')
    expect(screen.queryByRole('button', { name: '发布此版本' })).toBeNull()
    expect(screen.queryByText(/审批已到期/)).toBeNull()
    expect(screen.getByText(/当前版本已发布/)).toBeInTheDocument()
  })
})
