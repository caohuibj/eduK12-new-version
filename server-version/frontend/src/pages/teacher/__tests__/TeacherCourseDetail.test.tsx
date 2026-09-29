import { expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
  },
}))

import TeacherCourseDetail from '../TeacherCourseDetail'

it('keeps the loading state until course detail and related lists have all settled', async () => {
  let resolveCourse!: (value: unknown) => void
  const courseRequest = new Promise((resolve) => {
    resolveCourse = resolve
  })

  mockGet.mockImplementation((url: string) => {
    if (url === '/courses/course-1') return courseRequest
    if (url === '/courses/course-1/assignments') return Promise.resolve({ code: 0, data: { list: [] } })
    if (url === '/courses/course-1/checkins') return Promise.resolve({ code: 0, data: { list: [] } })
    if (url === '/questionnaires/available?courseId=course-1') return Promise.resolve({ code: 0, data: { list: [] } })
    throw new Error(`Unexpected GET ${url}`)
  })

  render(
    <MemoryRouter initialEntries={['/courses/course-1/detail']}>
      <Routes>
        <Route path="/courses/:courseId/detail" element={<TeacherCourseDetail />} />
      </Routes>
    </MemoryRouter>,
  )

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4))
  expect(screen.getByText('正在加载课程')).toBeInTheDocument()
  expect(screen.queryByText('课程不可用')).not.toBeInTheDocument()

  resolveCourse({
    code: 0,
    data: {
      id: 'course-1',
      title: '测试课程',
      description: '用于验证加载顺序',
      courseCode: 'ABC123',
      status: 'PUBLISHED',
      isLibrary: false,
      studentCount: 0,
    },
  })

  expect(await screen.findByRole('heading', { name: '测试课程' })).toBeInTheDocument()
})
