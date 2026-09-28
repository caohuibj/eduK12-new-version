import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OrganizationRunDetailPage from '../OrganizationRunDetailPage'

const api = vi.hoisted(() => ({
  resources: vi.fn(),
  detail: vi.fn(),
  progress: vi.fn(),
  addTrack: vi.fn(),
  publish: vi.fn(),
  preview: vi.fn(),
  close: vi.fn(),
  cancel: vi.fn(),
}))
const org = vi.hoisted(() => ({
  active: {
    organization: { id: 'org-1', name: '测试组织', status: 'ACTIVE' },
    access: { canGovern: true },
  } as any,
  activeLoading: false,
  activeError: null,
  selectOrganization: vi.fn(),
}))

vi.mock('../../../api/runs', () => ({ runApi: api }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => org }))

const draftDetail = {
  run: {
    id: 'run-1', organizationId: 'org-1', name: 'Pilot Run', status: 'DRAFT', version: 2,
    createdByUserId: 'owner', intakeDeadline: null, publishedAt: null, closedAt: null, cancelledAt: null,
    createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z', trackCount: 1, executionCount: 0,
  },
  tracks: [{
    id: 'track-1', resourceFamily: 'BUNDLE', resourceKey: 'pilot-bundle', resourceVersion: '1.0.0',
    subjectSelector: { kind: 'ALL_CURRENT' }, respondentSelector: { kind: 'ALL_CURRENT' },
    requestedPolicy: { subjectRoles: ['STUDENT'], respondentRoles: ['STUDENT'], relationshipKinds: ['SELF'], perspectives: ['SELF_REPORT'], analysisMode: 'INDIVIDUAL_ONLY', visibilityPolicyKey: 'ORG_SELF_V1', minimumRespondents: null },
    frozenResourcePolicy: null, resourcePolicyHash: null,
  }],
  frozenPopulation: { actors: [], relationships: [] },
  executions: [],
}

function renderPage() {
  return render(<MemoryRouter initialEntries={['/organizations/org-1/runs/run-1']}><Routes><Route path="/organizations/:organizationId/runs/:runId" element={<OrganizationRunDetailPage />} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  org.activeLoading = false
  org.activeError = null
  org.selectOrganization.mockResolvedValue(null)
  api.resources.mockResolvedValue({ list: [] })
  api.detail.mockResolvedValue(draftDetail)
  api.preview.mockResolvedValue({ runId: 'run-1', version: 2, tracks: [{ trackId: 'track-1', subjectCount: 1, respondentCount: 1, executionCount: 1 }] })
  api.publish.mockResolvedValue({ runId: 'run-1', version: 3, trackCount: 1, executionCount: 1 })
  api.progress.mockResolvedValue({ runId: 'run-1', total: 1, counts: { NOT_STARTED: 1, STARTING: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, EXPIRED: 0, UNKNOWN: 0 }, executions: [] })
})

describe('Organization Run product journey', () => {
  it('publishes using the exact server-returned optimistic version', async () => {
    renderPage()
    const publish = await screen.findByRole('button', { name: '发布测评批次' })
    await userEvent.click(publish)
    expect(api.publish).not.toHaveBeenCalled()
    await userEvent.click(await screen.findByRole('button', { name: '确认发布' }))
    await waitFor(() => expect(api.publish).toHaveBeenCalledWith('org-1', 'run-1', 2))
  })

  it('renders frozen population summaries supplied by the server', async () => {
    api.detail.mockResolvedValue({
      ...draftDetail,
      run: { ...draftDetail.run, status: 'PUBLISHED', version: 3, executionCount: 1, publishedAt: '2026-09-19T01:00:00.000Z' },
      tracks: [{ ...draftDetail.tracks[0], resourcePolicyHash: 'hash-1', frozenResourcePolicy: { scientificMaturity: 'PILOT' } }],
      frozenPopulation: {
        actors: [{ provenanceKind: 'ORG_MEMBER', actorRole: 'STUDENT', count: 1 }],
        relationships: [{ relationshipKind: 'SELF', count: 1 }],
      },
      executions: [{ status: 'ASSIGNED', count: 1 }],
    })
    renderPage()
    expect(await screen.findByText('Actor snapshots · 1')).toBeInTheDocument()
    expect(screen.getByText('ORG_MEMBER / STUDENT: 1')).toBeInTheDocument()
    expect(screen.getByText('SELF: 1')).toBeInTheDocument()
    await waitFor(() => expect(api.progress).toHaveBeenCalledWith('org-1', 'run-1'))
  })
})
