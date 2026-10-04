import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ list: vi.fn(), classification: vi.fn(), audit: vi.fn() }))
vi.mock('../../../api/organizationInvitations', () => ({ organizationInvitationsApi: { list: mocks.list } }))
vi.mock('../../../api/organizations', () => ({ organizationApi: { classification: mocks.classification, audit: mocks.audit } }))
vi.mock('../../../hooks/useSessionResource', () => ({
  useSessionResource: () => ({ data: { list: [{ id: 'invite', persona: 'STUDENT', status: 'CONSUMED', createdAt: '2026-10-04T07:18:40Z', expiresAt: '2026-10-05T07:18:40Z' }] }, loading: false, reload: vi.fn() }),
  resourceError: () => '失败',
}))
import OrganizationInvitationsPanel from '../OrganizationInvitationsPanel'
import OrganizationClassificationPanel from '../OrganizationClassificationPanel'
it('distinguishes invitation creation and expiry in Chinese with an explicit offset', () => {
  render(<MemoryRouter><OrganizationInvitationsPanel organizationId="org" /></MemoryRouter>)
  const row = screen.getByText(/创建于/)
  expect(row.textContent).toContain('有效至')
  expect(row.textContent).toContain('已使用')
  expect(row.textContent).toContain('2026')
  expect(row.textContent).toContain('UTC')
  expect(row.textContent).not.toContain('PM')
})
it('shows audit actor and member names while retaining the IDs in accessible titles', async () => {
  mocks.classification.mockResolvedValue({ dimensions: [], labels: [], assignments: [], relationships: [], historyLimit: 100 })
  mocks.audit.mockResolvedValue({ list: [{ id: 'audit', action: 'MEMBER_INVITATION_ACCEPTED', actorUserId: 'student-uuid', actorDisplayName: '合成学生甲', targetType: 'MEMBERSHIP', targetId: 'membership-uuid', targetDisplayName: '合成学生甲', createdAt: '2026-10-04T07:18:44Z' }] })
  render(<MemoryRouter><OrganizationClassificationPanel organizationId="org" memberships={[]} /></MemoryRouter>)
  const event = await screen.findByText(/MEMBER_INVITATION_ACCEPTED/)
  expect(within(event).getAllByText('合成学生甲')).toHaveLength(2)
  expect(event.querySelector('[title="student-uuid"]')).not.toBeNull()
  expect(event.querySelector('[title="membership-uuid"]')).not.toBeNull()
  expect(event.textContent).toContain('UTC')
  expect(event.textContent).not.toContain('student-uuid')
})
