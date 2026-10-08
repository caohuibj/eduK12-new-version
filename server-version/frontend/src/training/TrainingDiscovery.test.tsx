import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
const { list, exact, catalog, tasks } = vi.hoisted(() => ({
  list: vi.fn(), exact: vi.fn(), catalog: vi.fn(), tasks: vi.fn(),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'trainer-1', role: 'TEACHER', mustChangePassword: false },
  }),
}))
vi.mock('../api/organizations', () => ({
  organizationApi: { list, context: exact },
}))
vi.mock('../api/relational', () => ({
  relationalApi: { catalog, tasks },
}))
import { OrganizationProvider, useOrganization } from '../contexts/OrganizationContext'
import { RelationalAvailabilityProvider, useRelationalAvailability } from '../contexts/RelationalAvailabilityContext'

function OrganizationProbe() {
  const value = useOrganization()
  return <div>{value.active ? '已选择组织' : '无组织上下文'}</div>
}
function RelationalProbe() {
  return <div>测评状态：{useRelationalAvailability().status}</div>
}

describe('Training presentation must not perform unrelated discovery', () => {
  it('suspends organization directory fetch for native course-first pages', async () => {
    list.mockReset()
    exact.mockReset()
    render(<OrganizationProvider suspended><OrganizationProbe /></OrganizationProvider>)
    expect(await screen.findByText('无组织上下文')).toBeInTheDocument()
    await waitFor(() => expect(list).not.toHaveBeenCalled())
  })
  it('suspends relational catalog and task fetch for native course-first pages', async () => {
    catalog.mockReset()
    tasks.mockReset()
    render(<RelationalAvailabilityProvider suspended><RelationalProbe /></RelationalAvailabilityProvider>)
    expect(await screen.findByText('测评状态：empty')).toBeInTheDocument()
    await waitFor(() => {
      expect(catalog).not.toHaveBeenCalled()
      expect(tasks).not.toHaveBeenCalled()
    })
  })
})
