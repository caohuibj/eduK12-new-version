import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizationAdminPage from '../OrganizationAdminPage'
import OrganizationProductRoutes from '../OrganizationProductRoutes'

const api = vi.hoisted(() => ({
  classification: vi.fn(),
  audit: vi.fn(),
  listMemberships: vi.fn(),
  listUnits: vi.fn(),
  listStudentAssignments: vi.fn(),
  listStaffAssignments: vi.fn(),
  listAssessmentDeliveryGrants: vi.fn(),
  grantAssessmentDelivery: vi.fn(),
  revokeAssessmentDelivery: vi.fn(),
  membershipAccessHistory: vi.fn(),
  createMembership: vi.fn(),
  endMembership: vi.fn(),
  setMembershipRole: vi.fn(),
  grantPersona: vi.fn(),
  revokePersona: vi.fn(),
  grantCapability: vi.fn(),
  revokeCapability: vi.fn(),
  suspend: vi.fn(),
  resume: vi.fn(),
  deny: vi.fn(),
  liftDeny: vi.fn(),
  createUnit: vi.fn(),
  deleteUnit: vi.fn(),
  assignStudent: vi.fn(),
  endStudentAssignment: vi.fn(),
  assignStaff: vi.fn(),
  endStaffAssignment: vi.fn(),
}))

const auth = vi.hoisted(() => ({
  user: { id: 'user-1', username: 'user-1', role: 'STUDENT', mustChangePassword: false } as any,
  isLoading: false,
  isAuthenticated: true,
}))

const org = vi.hoisted(() => ({
  active: null as any,
  activeLoading: false,
  activeError: null as string | null,
  selectOrganization: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('../../../api/organizations', () => ({ organizationApi: api }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => org }))

const baseAccess = {
  organizationId: 'org-1',
  organizationStatus: 'ACTIVE',
  userId: 'user-1',
  platformRole: 'STANDARD',
  membershipId: 'membership-1',
  orgRole: 'MEMBER',
  personas: [],
  capabilities: [],
  explicitDenies: [],
  basis: ['MEMBERSHIP'],
  canGovern: false,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizations/org-1']}>
      <Routes><Route path="/organizations/:organizationId" element={<OrganizationAdminPage />} /></Routes>
    </MemoryRouter>,
  )
}

function renderProductRoutes(path = '/organizations/org-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OrganizationProductRoutes />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 'user-1', username: 'user-1', role: 'STUDENT', mustChangePassword: false }
  auth.isLoading = false
  auth.isAuthenticated = true
  org.active = null
  org.activeLoading = false
  org.activeError = null
  org.selectOrganization.mockResolvedValue(null)
  org.refresh.mockResolvedValue(undefined)
  api.listMemberships.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 100 })
  api.classification.mockResolvedValue({ dimensions: [], labels: [], assignments: [], relationships: [], historyLimit: 100 })
  api.audit.mockResolvedValue({ list: [] })
  api.listUnits.mockResolvedValue([])
  api.listStudentAssignments.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 100 })
  api.listStaffAssignments.mockResolvedValue({ list: [], total: 0, page: 1, pageSize: 100 })
  api.listAssessmentDeliveryGrants.mockResolvedValue({ list: [], total: 0 })
})

describe('Organization product authority boundary', () => {
  it('fails closed after one direct-route context denial instead of retrying forever', async () => {
    org.activeError = '组织不存在或不可访问'
    org.selectOrganization.mockResolvedValue(null)

    renderProductRoutes('/organizations/org-hidden')

    await waitFor(() => expect(screen.getByText('无法进入组织空间')).toBeInTheDocument())
    expect(screen.getByText('组织不存在或不可访问')).toBeInTheDocument()
    expect(org.selectOrganization).toHaveBeenCalledTimes(1)
    expect(org.selectOrganization).toHaveBeenCalledWith('org-hidden')

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(org.selectOrganization).toHaveBeenCalledTimes(1)
  })

  it('does not route an unknown organization child path back to governance', async () => {
    org.active = {
      organization: { id: 'org-1', name: '成员组织', status: 'ACTIVE' },
      access: { ...baseAccess },
    }
    renderProductRoutes('/organizations/org-1/not-a-page')
    expect(await screen.findByText('找不到此组织页面')).toBeInTheDocument()
    expect(screen.queryByText('只读组织上下文')).not.toBeInTheDocument()
  })

  it('keeps an ordinary member read-only and does not probe governance endpoints', async () => {
    org.active = {
      organization: { id: 'org-1', name: '成员组织', status: 'ACTIVE' },
      access: { ...baseAccess },
    }
    renderPage()
    expect(screen.getByText('只读组织上下文')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.listMemberships).not.toHaveBeenCalled()
    expect(api.listUnits).not.toHaveBeenCalled()
  })

  it('keeps SYSTEM_ADMIN deny recovery reachable when ordinary governance is denied', () => {
    org.active = {
      allowedActions: ['MANAGE_DENIES'],
      organization: { id: 'org-1', name: '系统治理组织', status: 'ACTIVE' },
      access: {
        ...baseAccess,
        platformRole: 'SYSTEM_ADMIN',
        membershipId: null,
        orgRole: null,
        basis: ['SYSTEM_ADMIN'],
        explicitDenies: ['ORGANIZATION_GOVERNANCE'],
        canGovern: false,
      },
    }
    renderPage()
    expect(screen.getByText('当前存在显式拒绝规则')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '显式拒绝规则' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '解除拒绝' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '成员关系' })).not.toBeInTheDocument()
  })

  it('loads administration projections only after server context grants governance', async () => {
    org.active = {
      organization: { id: 'org-1', name: '治理组织', status: 'ACTIVE' },
      access: {
        ...baseAccess,
        orgRole: 'ORG_ADMIN',
        basis: ['ORG_ADMIN', 'MEMBERSHIP'],
        canGovern: true,
      },
    }
    renderPage()
    await waitFor(() => expect(api.listMemberships).toHaveBeenCalledWith('org-1'))
    expect(api.listUnits).toHaveBeenCalledWith('org-1')
    expect(api.listStudentAssignments).toHaveBeenCalledWith('org-1', false)
    expect(api.listStaffAssignments).toHaveBeenCalledWith('org-1', false)
    expect(screen.getByRole('heading', { name: '成员关系' })).toBeInTheDocument()
  })
})
