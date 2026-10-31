import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../../api/client', () => ({ default: { get } }))
import CourseDetail from '../CourseDetail'

it('scopes both Composite availability and delivery pagination to the current course', async () => {
  const courseId = 'course-a'
  const candidates = Array.from({ length: 21 }, (_, index) => ({
    id: 'q-' + index, name: 'q-' + index, productKind: 'QUESTIONNAIRE', course: null,
    description: null, instruction: null, estimatedModules: 1, items: [], attempt: null, latestCompletedAttempt: null,
    opensAt: null, expiresAt: null, maxAttempts: 1, attemptsUsed: 0, canContinue: false, canStartNewAttempt: true, availability: 'OPEN',
  }))
  const tasks = Array.from({ length: 201 }, (_, index) => ({ id: 'other-' + index, kind: 'ASSIGNMENT', courses: [{ id: 'course-b' }] }))
  tasks[0] = { id: 'q-0', kind: 'COMPOSITE', courses: [{ id: courseId }] }
  get.mockImplementation(async (path: string, options?: any) => {
    if (path === '/courses/' + courseId) return { code: 0, data: { id: courseId, title: '合成课程', status: 'PUBLISHED' } }
    if (path === '/composite-assessments/available') return { code: 0, data: { list: options?.params?.courseId === courseId ? candidates.slice(0, 1) : candidates } }
    if (path.startsWith('/courses/my/tasks?')) {
      const query = new URL('https://synthetic.invalid' + path).searchParams
      const scoped = query.get('courseId') === courseId ? tasks.slice(0, 1) : tasks
      const page = Number(query.get('page'))
      return { code: 0, data: { list: scoped.slice((page - 1) * 100, page * 100), total: scoped.length } }
    }
    return { code: 0, data: { list: [] } }
  })
  render(<MemoryRouter initialEntries={['/student/courses/' + courseId]}><Routes>
    <Route path="/student/courses/:courseId" element={<CourseDetail />} />
  </Routes></MemoryRouter>)
  await screen.findByText('合成课程')
  fireEvent.click(screen.getByRole('button', { name: /综合测评/ }))
  await screen.findByText('q-0')
  expect(screen.queryByText('q-1')).toBeNull()
  expect({
    availabilityOptions: get.mock.calls.find(([path]) => path === '/composite-assessments/available')?.[1],
    taskURIs: get.mock.calls.filter(([path]) => path.startsWith('/courses/my/tasks?')).map(([path]) => path),
  }).toEqual({ availabilityOptions: { params: { courseId } }, taskURIs: ['/courses/my/tasks?page=1&pageSize=100&courseId=course-a'] })
})
