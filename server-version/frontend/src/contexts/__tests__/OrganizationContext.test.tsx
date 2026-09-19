import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  context: vi.fn(),
}))

const auth = vi.hoisted(() => ({
  value: {
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'user-1', username: 'teacher', role: 'STUDENT' },
  },
}))

vi.mock('../AuthContext', () => ({
  useAuth: () => auth.value,
}))

vi.mock('../../api/organizations', () => ({
  organizationApi: {
    list: api.list,
    context: api.context,
  },
}))

import { OrganizationProvider, useOrganization } from '../OrganizationContext'

const organization = { id: 'org-1', name: 'Org 1', status: 'ACTIVE' }
const accessibleOrganization = { id: 'org-1', name: 'Org 1', status: 'ACTIVE' }
const contextProjection = {
  organization,
  allowedActions: ['REPORTING'],
  access: {
    organizationId: 'org-1',
    organizationStatus: 'ACTIVE',
    userId: 'user-1',
    platformRole: 'STANDARD',
    membershipId: 'membership-1',
    orgRole: 'MEMBER',
    personas: ['TEACHER'],
    capabilities: [],
    explicitDenies: [],
    basis: ['MEMBERSHIP', 'PERSONA'],
    canGovern: false,
  },
}

const listProjection = {
  list: [accessibleOrganization],
  total: 1,
  page: 1,
  pageSize: 100,
  platformRole: 'STANDARD',
}

function Probe() {
  const { active, isLoading, activeLoading, refresh, selectOrganization } = useOrganization()
  return (
    <>
      <output aria-label="active-organization">{active?.organization.id ?? 'none'}</output>
      <output aria-label="actions">{active?.allowedActions?.join(',') ?? 'none'}</output>
      <output aria-label="loading-state">{String(isLoading)}:{String(activeLoading)}</output>
      <button onClick={() => void selectOrganization('org-1')}>select</button>
      <button onClick={() => void refresh()}>refresh</button>
    </>
  )
}

describe('OrganizationContext concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue(listProjection)
    api.context.mockResolvedValue(contextProjection)
  })

  it('does not let a concurrent discovery refresh cancel a newer active context selection', async () => {
    let resolveRefresh: ((value: typeof listProjection) => void) | undefined
    let resolveContext: ((value: typeof contextProjection) => void) | undefined

    api.list
      .mockResolvedValueOnce(listProjection)
      .mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve }))
    api.context.mockReturnValueOnce(new Promise((resolve) => { resolveContext = resolve }))

    render(<OrganizationProvider><Probe /></OrganizationProvider>)

    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByLabelText('loading-state')).toHaveTextContent('false:false'))

    act(() => screen.getByRole('button', { name: 'select' }).click())
    await waitFor(() => expect(api.context).toHaveBeenCalledWith('org-1'))

    act(() => screen.getByRole('button', { name: 'refresh' }).click())
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveContext?.(contextProjection)
      await Promise.resolve()
    })
    expect(screen.getByLabelText('active-organization')).toHaveTextContent('org-1')

    await act(async () => {
      resolveRefresh?.(listProjection)
      await Promise.resolve()
    })
    expect(screen.getByLabelText('active-organization')).toHaveTextContent('org-1')
    await waitFor(() => expect(screen.getByLabelText('loading-state')).toHaveTextContent('false:false'))
  })
  it('refreshes current grants even while membership remains discoverable', async () => {
    render(<OrganizationProvider><Probe /></OrganizationProvider>)
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
    await act(async () => screen.getByRole('button', { name: 'select' }).click())
    expect(screen.getByLabelText('actions')).toHaveTextContent('REPORTING')
    api.context.mockResolvedValue({ ...contextProjection, allowedActions: [] })
    await act(async () => screen.getByRole('button', { name: 'refresh' }).click())
    await waitFor(() => expect(screen.getByLabelText('actions')).not.toHaveTextContent('REPORTING'))
  })

  it('clears exact context when refresh is denied and ignores discovery pagination', async () => {
    render(<OrganizationProvider><Probe /></OrganizationProvider>)
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
    await act(async () => screen.getByRole('button', { name: 'select' }).click())
    api.list.mockResolvedValue({ ...listProjection, list: [], total: 101 })
    await act(async () => screen.getByRole('button', { name: 'refresh' }).click())
    expect(screen.getByLabelText('active-organization')).toHaveTextContent('org-1')
    api.context.mockRejectedValue(new Error('authority revoked'))
    await act(async () => screen.getByRole('button', { name: 'refresh' }).click())
    await waitFor(() => expect(screen.getByLabelText('active-organization')).toHaveTextContent('none'))
  })

})
