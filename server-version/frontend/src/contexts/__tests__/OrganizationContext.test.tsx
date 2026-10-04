import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  allowedActions: [] as string[],
}

function Probe() {
  const { active, isLoading, activeLoading, allowedActions, refresh, selectOrganization } = useOrganization()
  return (
    <>
      <output aria-label="active-organization">{active?.organization.id ?? 'none'}</output>
      <output aria-label="directory-actions">{allowedActions.join(',')}</output>
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
    auth.value = { isAuthenticated: true, isLoading: false, user: { id: 'user-1', username: 'teacher', role: 'STUDENT' } }
    api.list.mockResolvedValue(listProjection)
    api.context.mockResolvedValue(contextProjection)
  })

  it('preserves descendant login/recovery state while clearing another principal’s authority and pending responses', async () => {
    let resolveOld: ((value: typeof contextProjection) => void) | undefined
    function RecoveryProbe() {
      const [draft, setDraft] = useState('')
      return <><input aria-label="recovery-state" value={draft} onChange={event => setDraft(event.target.value)} /><Probe /></>
    }
    const { rerender } = render(<OrganizationProvider><RecoveryProbe /></OrganizationProvider>)
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
    await act(async () => screen.getByRole('button', { name: 'select' }).click())
    expect(screen.getByLabelText('active-organization')).toHaveTextContent('org-1')
    const input = screen.getByLabelText('recovery-state') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'pending-return-target' } })
    // DOM identity also catches remounts that lose login navigation callbacks.
    api.context.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    act(() => screen.getByRole('button', { name: 'select' }).click())
    auth.value = { ...auth.value, user: { ...auth.value.user, id: 'user-2' } }
    api.list.mockResolvedValue({ ...listProjection, list: [], total: 0 })
    rerender(<OrganizationProvider><RecoveryProbe /></OrganizationProvider>)
    expect(screen.getByLabelText('recovery-state')).toBe(input)
    expect(input.value).toBe('pending-return-target')
    expect(screen.getByLabelText('active-organization')).toHaveTextContent('none')
    await act(async () => { resolveOld?.(contextProjection); await Promise.resolve() })
    expect(screen.getByLabelText('active-organization')).toHaveTextContent('none')
  })

  it('preserves a deep-link selection started by a child mount effect', async () => {
    function DeepLink() {
      const { selectOrganization } = useOrganization()
      useEffect(() => { void selectOrganization('org-1') }, [selectOrganization])
      return <Probe />
    }
    render(<OrganizationProvider><DeepLink /></OrganizationProvider>)
    await waitFor(() => expect(screen.getByLabelText('active-organization')).toHaveTextContent('org-1'))
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

it('clears stale active authority when discovery confirms zero accessible organizations', async () => {
  render(<OrganizationProvider><Probe /></OrganizationProvider>)
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
  await act(async () => screen.getByRole('button', { name: 'select' }).click())
  expect(screen.getByLabelText('active-organization')).toHaveTextContent('org-1')
  api.list.mockResolvedValue({ ...listProjection, list: [], total: 0 })
  await act(async () => screen.getByRole('button', { name: 'refresh' }).click())
  expect(screen.getByLabelText('active-organization')).toHaveTextContent('none')
  expect(screen.getByLabelText('actions')).toHaveTextContent('none')
})

it('uses directory actions and clears them across principal changes', async () => {
  api.list.mockResolvedValue({ ...listProjection, platformRole: 'SYSTEM_ADMIN', allowedActions: ['CREATE_ORGANIZATION'] })
  const view = render(<OrganizationProvider><Probe /></OrganizationProvider>)
  await waitFor(() => expect(screen.getByLabelText('directory-actions')).toHaveTextContent('CREATE_ORGANIZATION'))
  api.list.mockResolvedValue({ ...listProjection, list: [], total: 0 })
  auth.value = { ...auth.value, user: { ...auth.value.user, id: 'user-2' } }
  view.rerender(<OrganizationProvider><Probe /></OrganizationProvider>)
  expect(screen.getByLabelText('directory-actions')).toBeEmptyDOMElement()
})

})
