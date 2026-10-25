import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { User } from '../../../types'

const state = vi.hoisted(() => ({ user: null as User | null, educationLoads: vi.fn(), surveyLoads: vi.fn(), trainingLoads: vi.fn(), authLoading: false }))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user, isLoading: state.authLoading, logout: vi.fn() }),
  AccountViewProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCapabilities: () => ({ cognitiveEnabled: false, parentPortalEnabled: false }) }))
vi.mock('../../../contexts/OrganizationContext', () => ({
  OrganizationProvider: ({ children }: { children: ReactNode }) => children,
  useOrganization: () => ({ organizations: [], allowedActions: [], total: 0 }),
}))
vi.mock('../../../contexts/RelationalAvailabilityContext', () => ({
  RelationalAvailabilityProvider: ({ children }: { children: ReactNode }) => children,
  useRelationalAvailability: () => ({ status: 'empty' }),
}))
vi.mock('../../../training/context', async original => ({
  ...await original<typeof import('../../../training/context')>(), isTrainingHost: () => true,
}))
vi.mock('../../../pages/admin/EducationAdminShell', () => {
  state.educationLoads()
  return { default: ({ children }: { children: ReactNode }) => <section aria-label="education frame">{children}</section> }
})
vi.mock('../../../survey/SurveyAdminShell', () => {
  state.surveyLoads()
  return { default: ({ children }: { children: ReactNode }) => <section aria-label="survey frame">{children}</section> }
})
vi.mock('../../../training/TrainingAdminShell', () => {
  state.trainingLoads()
  return { default: ({ children }: { children: ReactNode }) => <section aria-label="training frame">{children}</section> }
})
import AppShell from '../AppShell'

it('loads management frames only after their existing route and grant checks match', async () => {
  const frame = (path: string) => <MemoryRouter key={path} initialEntries={[path]}><AppShell><p>route content</p></AppShell></MemoryRouter>
  const view = render(frame('/'))
  for (const path of ['/login', '/register', '/teacher/register?code=example', '/student/register?course=example']) {
    view.rerender(frame(path))
    expect(screen.getByText('route content')).toBeVisible()
  }
  state.user = { id: 'ordinary', role: 'TEACHER', platformRole: 'STANDARD', username: 'teacher', entryGrants: [] } as User
  for (const path of ['/dashboard', '/admin/training/resources', '/admin/huischool', '/admin/huiteacher', '/admin/survey-researchers']) {
    view.rerender(frame(path))
    expect(screen.queryByRole('region', { name: /frame/ })).not.toBeInTheDocument()
  }
  expect(state.trainingLoads).not.toHaveBeenCalled()
  expect(state.educationLoads).not.toHaveBeenCalled()
  expect(state.surveyLoads).not.toHaveBeenCalled()

  state.user = { ...state.user, entryGrants: [{ entry: 'HUISCHOOL', version: 1 }] } as User
  view.rerender(frame('/admin/huischool'))
  expect(await screen.findByRole('region', { name: 'education frame' })).toHaveTextContent('route content')
  expect(state.educationLoads).toHaveBeenCalledTimes(1)
  expect(state.surveyLoads).not.toHaveBeenCalled()

  state.user = { ...state.user, entryGrants: [{ entry: 'SURVEY', version: 1 }] } as User
  view.rerender(frame('/admin/survey-researchers'))
  expect(await screen.findByRole('region', { name: 'survey frame' })).toHaveTextContent('route content')
  expect(state.surveyLoads).toHaveBeenCalledTimes(1)

  state.user = { ...state.user, entryGrants: [{ entry: 'TRAINING', version: 1 }] } as User
  state.authLoading = true
  view.rerender(frame('/admin/training/resources'))
  expect(state.trainingLoads).not.toHaveBeenCalled()
  state.authLoading = false
  view.rerender(frame('/admin/training/resources'))
  expect(await screen.findByRole('region', { name: 'training frame' })).toHaveTextContent('route content')
  expect(state.trainingLoads).toHaveBeenCalledTimes(1)

  state.user = null
  view.rerender(frame('/login'))
  expect(screen.queryByRole('region', { name: /frame/ })).not.toBeInTheDocument()
  expect(screen.getByText('route content')).toBeVisible()
})
