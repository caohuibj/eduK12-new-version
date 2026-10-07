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
async function open() {
  render(<MemoryRouter><BundleAuthoring /></MemoryRouter>)
  await userEvent.click(await screen.findByRole('button', { name: '查看定义与审批' }))
  await screen.findByRole('button', { name: '独立审批发布' })
}
describe('fixed package independent review', () => {
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
  })
})
