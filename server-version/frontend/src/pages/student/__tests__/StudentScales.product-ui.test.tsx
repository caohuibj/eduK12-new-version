import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
  default: { get: mockGet },
}))

import StudentScales from '../StudentScales'

const scale = {
  id: 'scale-1',
  code: 'SCALE_1',
  name: '示例量表',
  description: '用于验证学生端量表入口。',
  estimatedTime: 5,
  course: null,
  itemCount: 12,
  completed: false,
  inProgress: true,
  completedAt: null,
  assessmentId: 'assessment-1',
  activeAttempt: { id: 'assessment-1', startedAt: '2026-09-12T00:00:00.000Z', progress: 25 },
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/student/scales']}>
    <StudentScales />
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StudentScales converged product UI', () => {
  it('keeps request failure distinct from a genuine empty list', async () => {
    mockGet.mockRejectedValueOnce(new Error('网络暂时不可用'))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('网络暂时不可用')
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
    expect(screen.queryByText('暂无可用量表')).not.toBeInTheDocument()
  })

  it('renders an in-progress assessment as a keyboard-accessible continue link', async () => {
    mockGet.mockResolvedValueOnce({ code: 0, message: 'ok', data: { list: [scale] } })
    renderPage()

    const heading = await screen.findByRole('heading', { name: '示例量表' })
    const link = heading.closest('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', '/student/scales/scale-1')
    expect(within(link as HTMLAnchorElement).getByText('继续作答')).toBeInTheDocument()
  })
})
