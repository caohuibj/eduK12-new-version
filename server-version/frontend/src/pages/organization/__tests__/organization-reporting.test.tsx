import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizationReportingPage from '../OrganizationReportingPage'
const api = vi.hoisted(() => ({ listSpecs: vi.fn(), listSources: vi.fn(), listProtectedSources: vi.fn(), listSeries: vi.fn(), cohortOptions: vi.fn(), analyzeAutomatic: vi.fn(), analyzeGroup: vi.fn(), readArtifact: vi.fn() }))
const org = vi.hoisted(() => ({ active: { organization: { id: 'o1' }, access: { canGovern: false } }, activeLoading: false, selectOrganization: vi.fn() }))
vi.mock('../../../api/reporting', () => ({ reportingApi: api }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => org }))
beforeEach(() => { vi.clearAllMocks(); api.cohortOptions.mockResolvedValue({ classes: [], dimensions: [], labels: [] }); for (const method of [api.listSpecs, api.listSources, api.listProtectedSources, api.listSeries]) method.mockResolvedValue({ list: [] }) })
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

it('uses the same label selection for group and automatic longitudinal reports', async () => {
  api.cohortOptions.mockResolvedValue({ classes: [], dimensions: [{ id: 'sex', key: 'sex', name: '性别' }], labels: [{ id: 'male', dimensionId: 'sex', name: '男生' }] })
  api.listSpecs.mockResolvedValue({ list: [
    { specId: 'group', analysisKind: 'GROUP', specKey: '群体方案', version: 1 },
    { specId: 'repeated', analysisKind: 'REPEATED_COHORT', specKey: '纵向方案', version: 1 },
  ] })
  api.listSources.mockResolvedValue({ list: [1, 2].map(n => ({ runId: `run${n}`, trackId: `track${n}`, runName: `测量${n}`, publishedAt: `2026-0${n}-01T00:00:00Z`, resource: { family: 'SCALE', key: 'grit', version: '1' } })) })
  const result = { artifactId: 'new', generatedAt: '2026-09-19T00:00:00Z', projection: { kind: 'GROUP', state: 'suppressed', metrics: {} } }
  api.analyzeGroup.mockResolvedValue(result)
  api.analyzeAutomatic.mockResolvedValue(result)
  render(<MemoryRouter initialEntries={['/organizations/o1/reporting']}><Routes><Route path="/organizations/:organizationId/reporting" element={<OrganizationReportingPage />} /></Routes></MemoryRouter>)
  await userEvent.click(await screen.findByLabelText('男生'))
  await userEvent.click(screen.getByRole('button', { name: '生成群体报告' }))
  const selector = { schemaVersion: 2, combine: 'ALL', clauses: [{ kind: 'LABELS', labelIds: ['male'], match: 'ANY' }] }
  expect(api.analyzeGroup).toHaveBeenCalledWith('o1', expect.objectContaining({ cohortSelector: selector }))
  await userEvent.selectOptions(screen.getByLabelText('选择测量项目'), 'SCALE/grit')
  const checkboxes = screen.getAllByRole('checkbox').filter(el => el.parentElement?.textContent?.includes('测量'))
  for (const checkbox of checkboxes) await userEvent.click(checkbox)
  await userEvent.selectOptions(screen.getByLabelText('人群定义'), 'BASELINE_FIXED')
  await userEvent.click(screen.getByRole('button', { name: '生成纵向报告' }))
  expect(api.analyzeAutomatic).toHaveBeenCalledWith('o1', expect.objectContaining({ cohortSelector: selector, cohortStrategy: 'BASELINE_FIXED', sources: [{ runId: 'run1', trackId: 'track1' }, { runId: 'run2', trackId: 'track2' }] }))
})
