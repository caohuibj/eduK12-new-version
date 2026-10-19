import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get } }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher' } }) }))
vi.mock('../../../contexts/OrganizationContext', () => ({ useOrganization: () => ({ organizations: [], active: null, activeLoading: false, selectOrganization: vi.fn() }) }))
vi.mock('../../../training/context', () => ({ isTrainingHost: () => true }))
import AssessmentWorkbench from '../AssessmentWorkbench'
it('labels submissions and satisfaction as attempt counts with a clear denominator', async () => {
  get.mockImplementation(async (url: string) => ({ code: 0, data: url.includes('/resources') ? { courses: [{ id: 'c', title: '本课' }] } : {
    course: { id: 'c', title: '本课' }, page: 1, pageSize: 20, total: 1, quality: [], qualityHasMore: false,
    countMeaning: '已交卷次数为分母；不去重为人数。',
    list: [{ id: 'q', name: '课程问卷', status: 'PUBLISHED', productKind: 'QUESTIONNAIRE', attempts: { COMPLETED: 12, SATISFIED: 6, NOT_SATISFIED: 6, IN_PROGRESS: 2 } }],
  } }))
  render(<MemoryRouter initialEntries={['/assessment-workbench?courseId=c']}><AssessmentWorkbench /></MemoryRouter>)
  const title = await screen.findByText('课程问卷')
  const card = within(title.closest('article')!)
  expect(card.getByText('已交卷').nextElementSibling).toHaveTextContent('12')
  expect(card.getByText('任务达成').nextElementSibling).toHaveTextContent('6')
  expect(card.getByText('任务未达成').nextElementSibling).toHaveTextContent('6')
  expect(screen.getByText('已交卷次数为分母；不去重为人数。')).toBeInTheDocument()
})
