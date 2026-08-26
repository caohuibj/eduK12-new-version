import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { mockGet, authState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  authState: { user: { id: 'teacher-1', role: 'TEACHER' as 'TEACHER' | 'ADMIN' } },
}))

vi.mock('../../api/client', () => ({
  default: { get: mockGet, post: vi.fn(), delete: vi.fn() },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

import ScaleList from '../ScaleList'

const scale = (overrides: Record<string, unknown> = {}) => ({
  id: 'scale-1',
  code: 'S1',
  name: '焦虑量表',
  description: null,
  status: 'PUBLISHED',
  estimatedTime: 5,
  instruction: null,
  tags: [],
  source: 'owned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  creator: { id: 'teacher-1', username: 'tea', nickname: '教师' },
  course: null,
  _count: { items: 1, dimensions: 1, assessments: 0 },
  ...overrides,
})

describe('ScaleList grant badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'teacher-1', role: 'TEACHER' }
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/tags')) return Promise.resolve({ code: 0, data: { tags: [] } })
      return Promise.resolve({ code: 0, data: { list: [scale({ source: 'granted', creator: { id: 'admin-1', username: 'admin', nickname: '管理员' } })], total: 1 } })
    })
  })

  it('hides edit and export for granted scales and shows a read-only badge', async () => {
    render(
      <MemoryRouter>
        <ScaleList />
      </MemoryRouter>
    )
    expect(await screen.findByText('管理员授权 · 只读')).toBeInTheDocument()
    expect(screen.queryByTitle('编辑')).not.toBeInTheDocument()
    expect(screen.queryByTitle('导出数据')).not.toBeInTheDocument()
    expect(screen.queryByTitle('授权给教师')).not.toBeInTheDocument()
  })

  it('lets ADMIN grant a published other scale while keeping edit', async () => {
    authState.user = { id: 'admin-1', role: 'ADMIN' }
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/tags')) return Promise.resolve({ code: 0, data: { tags: [] } })
      return Promise.resolve({
        code: 0,
        data: {
          list: [scale({
            source: 'other',
            creator: { id: 'teacher-1', username: 'tea', nickname: '教师' },
            _count: { items: 1, dimensions: 1, assessments: 2 },
          })],
          total: 1,
        },
      })
    })
    render(
      <MemoryRouter>
        <ScaleList />
      </MemoryRouter>
    )
    expect(await screen.findByTitle('编辑')).toBeInTheDocument()
    expect(screen.getByTitle('授权给教师')).toBeInTheDocument()
    expect(screen.queryByText('管理员授权 · 只读')).not.toBeInTheDocument()
  })
})
