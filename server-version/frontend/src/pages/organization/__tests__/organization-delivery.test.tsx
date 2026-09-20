import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import OrganizationDeliveryPage from '../OrganizationDeliveryPage'

const api = vi.hoisted(() => ({
  listSafetyCases: vi.fn(),
  readSafetyCase: vi.fn(),
  createArtifactExport: vi.fn(),
  createSafetyExport: vi.fn(),
  downloadExport: vi.fn(),
}))
const org = vi.hoisted(() => ({
  active: {
    organization: { id: 'org-1', name: '测试组织', status: 'ACTIVE' },
    access: {
      membershipId: 'membership-1',
      orgRole: 'ORG_ADMIN',
      capabilities: ['REPORT_EXPORT'],
      personas: [],
      explicitDenies: [],
      canGovern: true,
    },
  } as any,
  activeLoading: false,
  activeError: null,
  selectOrganization: vi.fn(),
}))

vi.mock('../../../api/delivery', () => ({ deliveryApi: api }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => org }))

const safetyCase = (caseId: string) => ({
  caseId,
  projection: 'ACTION',
  status: 'OPEN',
  createdAt: '2026-09-19T00:00:00.000Z',
  acknowledgedAt: null,
  disposedAt: null,
  ackDueAt: '2026-09-19T01:00:00.000Z',
  disposeDueAt: '2026-09-20T00:00:00.000Z',
})

function OrganizationSwitcher() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate('/organizations/org-2/delivery')}>switch organization</button>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/organizations/org-1/delivery']}>
      <OrganizationSwitcher />
      <Routes><Route path="/organizations/:organizationId/delivery" element={<OrganizationDeliveryPage />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  org.active = {
    organization: { id: 'org-1', name: '测试组织', status: 'ACTIVE' },
    access: {
      membershipId: 'membership-1',
      orgRole: 'ORG_ADMIN',
      capabilities: ['REPORT_EXPORT'],
      personas: [],
      explicitDenies: [],
      canGovern: true,
    },
  } as any
  org.activeLoading = false
  org.activeError = null
  api.listSafetyCases.mockResolvedValue({ list: [safetyCase('case-1')], truncated: false })
  api.readSafetyCase.mockResolvedValue({ projection: 'ACTION', data: { caseId: 'case-1', status: 'OPEN' } })
  api.createArtifactExport.mockResolvedValue({ exportId: 'export-1', expiresAt: '2026-09-19T01:15:00.000Z' })
  api.createSafetyExport.mockResolvedValue({ exportId: 'export-2', expiresAt: '2026-09-19T01:15:00.000Z' })
})

describe('Organization Safety and CSV delivery', () => {
  it('renders only server-provided Safety inbox summaries and re-reads exact projection', async () => {
    renderPage()
    expect(await screen.findByRole('radio')).toBeChecked()
    expect(screen.getByText('ACTION')).toBeInTheDocument()
    expect(screen.getAllByText('case-1')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '读取 exact projection' }))
    await waitFor(() => expect(api.readSafetyCase).toHaveBeenCalledWith('org-1', 'case-1'))
    expect(await screen.findByText('Exact Safety projection')).toBeInTheDocument()
  })

  it('creates an immutable artifact export ticket without reconstructing CSV client-side', async () => {
    renderPage()
    const artifactInput = await screen.findByPlaceholderText('artifact UUID')
    await userEvent.type(artifactInput, 'artifact-1')
    await userEvent.click(screen.getByRole('button', { name: '创建 CSV ticket' }))
    await waitFor(() => expect(api.createArtifactExport).toHaveBeenCalledWith('org-1', 'AGGREGATE', 'artifact-1'))
    expect(await screen.findByText(/AGGREGATE · artifact-1/)).toBeInTheDocument()
  })

  it('creates Safety export tickets from the selected authorized inbox case', async () => {
    renderPage()
    await screen.findByRole('radio')
    await userEvent.click(screen.getByRole('button', { name: '创建 SAFETY CSV ticket' }))
    await waitFor(() => expect(api.createSafetyExport).toHaveBeenCalledWith('org-1', 'case-1'))
    expect(await screen.findByText(/SAFETY · case-1/)).toBeInTheDocument()
  })

  it('ignores stale Safety inbox responses after organization navigation', async () => {
    let resolveFirst!: (value: { list: ReturnType<typeof safetyCase>[]; truncated: boolean }) => void
    const firstResponse = new Promise<{ list: ReturnType<typeof safetyCase>[]; truncated: boolean }>((resolve) => {
      resolveFirst = resolve
    })
    api.listSafetyCases
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({ list: [safetyCase('case-2')], truncated: false })

    renderPage()
    await waitFor(() => expect(api.listSafetyCases).toHaveBeenCalledWith('org-1'))

    org.active = {
      ...org.active,
      organization: { id: 'org-2', name: '第二组织', status: 'ACTIVE' },
    } as any
    await userEvent.click(screen.getByRole('button', { name: 'switch organization' }))
    await waitFor(() => expect(api.listSafetyCases).toHaveBeenCalledWith('org-2'))
    expect((await screen.findAllByText('case-2')).length).toBeGreaterThan(0)

    resolveFirst({ list: [safetyCase('case-1')], truncated: false })
    await waitFor(() => expect(screen.queryAllByText('case-1')).toHaveLength(0))
    expect(screen.getAllByText('case-2').length).toBeGreaterThan(0)
  })
  it('removes a previously returned FULL payload when exact reauthorization fails', async () => {
    api.readSafetyCase.mockResolvedValueOnce({ projection: 'FULL', data: { sensitive: 'private-trigger' } })
    renderPage()
    await screen.findByRole('radio')
    await userEvent.click(screen.getByRole('button', { name: '读取 exact projection' }))
    expect(await screen.findByText(/private-trigger/)).toBeInTheDocument()
    api.readSafetyCase.mockRejectedValueOnce(new Error('authority revoked'))
    await userEvent.click(screen.getByRole('button', { name: '读取 exact projection' }))
    expect(await screen.findByText('authority revoked')).toBeInTheDocument()
    expect(screen.queryByText(/private-trigger/)).not.toBeInTheDocument()
  })

})
