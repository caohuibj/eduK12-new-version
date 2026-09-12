import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('../../../api/client', () => ({
  default: { get: mockGet },
}))

import StudentScales from '../StudentScales'

describe('StudentScales reference journey entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses semantic links for new, active, and completed Scale journeys', async () => {
    mockGet.mockResolvedValue({
      code: 0,
      message: 'ok',
      data: {
        list: [
          {
            id: 'scale-new',
            code: 'NEW',
            name: '新量表',
            description: '尚未开始',
            estimatedTime: 5,
            course: null,
            itemCount: 5,
            completed: false,
            completedAt: null,
            assessmentId: null,
          },
          {
            id: 'scale-active',
            code: 'ACTIVE',
            name: '进行中量表',
            description: '继续当前尝试',
            estimatedTime: 8,
            course: null,
            itemCount: 8,
            completed: false,
            inProgress: true,
            completedAt: null,
            assessmentId: 'attempt-active',
            activeAttempt: { id: 'attempt-active', startedAt: '2026-09-12T00:00:00.000Z', progress: 50 },
          },
          {
            id: 'scale-done',
            code: 'DONE',
            name: '已完成量表',
            description: '查看结果',
            estimatedTime: 3,
            course: null,
            itemCount: 3,
            completed: true,
            completedAt: '2026-09-12T00:00:00.000Z',
            assessmentId: 'attempt-done',
          },
        ],
      },
    })

    render(<MemoryRouter><StudentScales /></MemoryRouter>)

    expect(await screen.findByRole('link', { name: '新量表，开始测评' })).toHaveAttribute('href', '/student/scales/scale-new')
    expect(screen.getByRole('link', { name: '进行中量表，继续作答' })).toHaveAttribute('href', '/student/scales/scale-active')
    expect(screen.getByRole('link', { name: '已完成量表，查看结果' })).toHaveAttribute('href', '/student/scales/result/attempt-done')
    expect(screen.getByText('已有进行中的尝试，进入后继续当前本地作答。')).toBeInTheDocument()
  })

  it('shows a visible error instead of silently rendering an empty journey when loading fails', async () => {
    mockGet.mockRejectedValue(new Error('network down'))
    render(<MemoryRouter><StudentScales /></MemoryRouter>)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })
})
