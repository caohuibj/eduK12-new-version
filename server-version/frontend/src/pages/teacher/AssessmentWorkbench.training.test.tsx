import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AssessmentWorkbench from './AssessmentWorkbench'
const get = vi.hoisted(() => vi.fn())
vi.mock('../../api/client', () => ({ default: { get } }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'trainer' } }) }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organizations: [], active: null, activeLoading: false }) }))
vi.mock('../../training/context', () => ({ isTrainingHost: () => true }))
beforeEach(() => get.mockReset())
describe('training results course context beyond the resource catalog page', () => {
 it.each([['trainer', true], ['other-trainer', false]])('verifies the exact course owner %s before offering the option', async (owner, allowed) => {
  get.mockImplementation(async (url: string) => {
   if (url === '/questionnaire-products/resources') return { code: 0, data: { courses: [{ id: 'first-page', title: '目录中的课程' }] } }
   if (url === '/courses/later-course') return { code: 0, data: { id: 'later-course', title: '第101门课程', creatorId: owner, isLibrary: false } }
   return { code: 0, data: { course: { id: 'later-course', title: '第101门课程' }, list: [], quality: [], pageSize: 20, total: 0 } }
  })
  render(<MemoryRouter initialEntries={['/assessment-workbench?courseId=later-course']}><AssessmentWorkbench /></MemoryRouter>)
  await waitFor(() => expect(get).toHaveBeenCalledWith('/courses/later-course'))
  if (allowed) expect(await screen.findByRole('option', { name: '第101门课程' })).toBeInTheDocument()
  else expect(screen.queryByRole('option', { name: '第101门课程' })).not.toBeInTheDocument()
  expect(screen.queryByText('群体概览与纵向变化')).not.toBeInTheDocument()
 })
})
