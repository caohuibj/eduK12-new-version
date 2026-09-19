import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizationReportingPage from '../OrganizationReportingPage'
const api = vi.hoisted(() => ({ listSpecs: vi.fn(), listSources: vi.fn(), listProtectedSources: vi.fn(), listSeries: vi.fn(), readArtifact: vi.fn() }))
const org = vi.hoisted(() => ({ active: { organization: { id: 'o1' }, access: { canGovern: false } }, activeLoading: false, selectOrganization: vi.fn() }))
vi.mock('../../../api/reporting', () => ({ reportingApi: api }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => org }))
beforeEach(() => { vi.clearAllMocks(); for (const method of [api.listSpecs, api.listSources, api.listProtectedSources, api.listSeries]) method.mockResolvedValue({ list: [] }) })
it('removes an existing artifact when exact read permission is revoked', async () => {
  api.readArtifact.mockResolvedValueOnce({ artifactId: 'private-artifact', generatedAt: '2026-09-19T00:00:00Z', projection: { kind: 'GROUP', state: 'present', eligibleN: 12, resultContributorN: 12, metrics: {} } })
  render(<MemoryRouter initialEntries={['/organizations/o1/reporting']}><Routes><Route path="/organizations/:organizationId/reporting" element={<OrganizationReportingPage />} /></Routes></MemoryRouter>)
  await userEvent.type(await screen.findByPlaceholderText('artifact UUID'), 'private-artifact')
  await userEvent.click(screen.getByRole('button', { name: '读取 artifact' }))
  expect(await screen.findByText(/Artifact private-artifact/)).toBeInTheDocument()
  api.readArtifact.mockRejectedValueOnce(new Error('read revoked'))
  await userEvent.click(screen.getByRole('button', { name: '读取 artifact' }))
  await waitFor(() => expect(screen.queryByText(/Artifact private-artifact/)).not.toBeInTheDocument())
  expect(await screen.findByText('read revoked')).toBeInTheDocument()
})
