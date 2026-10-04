import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    if (url === '/courses/course-1/questionnaires') return Promise.resolve({ code: 0, data: { list: [] } })
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

it('counts both versions of course deliveries and opens the new questionnaire editor', async () => {
  mockGet.mockImplementation((url: string) => Promise.resolve({ code: 0, data: url === '/courses/course-1'
    ? { id: 'course-1', title: '测试课程', courseCode: 'C', status: 'PUBLISHED' }
    : { list: url.endsWith('/questionnaires') ? [
      { id: 'old', kind: 'LEGACY', name: '旧版问卷', unitCount: 1, unitLabel: '个量表', manageHref: '/questionnaires/old' },
      { id: 'new', kind: 'COLLECTION', name: '新版投放问卷', unitCount: 2, unitLabel: '个单元', manageHref: '/questionnaire-products/new' },
    ] : [] } }))
  render(<MemoryRouter initialEntries={['/courses/course-1/detail']}><Routes>
    <Route path="/courses/:courseId/detail" element={<TeacherCourseDetail />} />
    <Route path="/questionnaire-products/new" element={<p>新版问卷编辑器</p>} />
  </Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: '问卷 (2)' }))
  expect(screen.getByText('旧版问卷')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /新版投放问卷/ }))
  expect(screen.getByText('新版问卷编辑器')).toBeInTheDocument()
})
it('shows a failed questionnaire read explicitly and can retry instead of claiming zero deliveries', async () => {
  mockGet.mockImplementation((url: string) => {
    if (url.endsWith('/questionnaires')) return Promise.resolve({ code: -1, message: '不可用' })
    return Promise.resolve({ code: 0, data: url === '/courses/course-1' ? { id: 'course-1', title: '测试课程', courseCode: 'C' } : { list: [] } })
  })
  render(<MemoryRouter initialEntries={['/courses/course-1/detail']}><Routes><Route path="/courses/:courseId/detail" element={<TeacherCourseDetail />} /></Routes></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: '问卷 (暂不可用)' }))
  expect(screen.getByText('课程问卷加载失败')).toBeInTheDocument()
  expect(screen.queryByText('暂无问卷')).not.toBeInTheDocument()
  mockGet.mockResolvedValueOnce({ code: 0, data: { list: [] } })
  fireEvent.click(screen.getByRole('button', { name: '重新加载问卷' }))
  expect(await screen.findByText('暂无问卷')).toBeInTheDocument()
})
