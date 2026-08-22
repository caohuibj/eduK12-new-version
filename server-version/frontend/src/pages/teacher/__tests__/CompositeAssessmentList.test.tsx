import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockNavigate, mockGet, mockCompositeApi } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGet: vi.fn(),
  mockCompositeApi: {
    list: vi.fn(),
    listLibrary: vi.fn(),
    copy: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../modules/composite/api', () => ({
  compositeApi: mockCompositeApi,
}))

vi.mock('../../../api/client', () => ({
  default: { get: mockGet },
}))

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }),
}))

import CompositeAssessmentList from '../CompositeAssessmentList'

describe('CompositeAssessmentList library tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCompositeApi.list.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'mine-1',
          name: '我的测评',
          code: 'MINE',
          status: 'DRAFT',
          itemCount: 1,
          copyable: false,
          canSetCopyable: false,
          createdBy: 'teacher-1',
          creator: { id: 'teacher-1', role: 'TEACHER' },
          course: { id: 'c1', title: '语文', courseCode: 'YU', isLibrary: false },
          attemptCounts: { started: 0, completed: 0 },
        }],
      },
    })
    mockCompositeApi.listLibrary.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'lib-1',
          name: '管理员模板A',
          code: 'TPL',
          description: '焦虑与注意',
          items: [{ type: 'SCALE', position: 1, label: '焦虑量表' }],
        }],
      },
    })
    mockCompositeApi.copy.mockResolvedValue({ code: 0, data: { id: 'draft-99' } })
    mockGet.mockResolvedValue({
      code: 0,
      data: {
        list: [
          { id: 'c1', title: '语文', courseCode: 'YU', isLibrary: false },
          { id: 'c2', title: '数学', courseCode: 'SHU', isLibrary: false },
          { id: 'lib-course', title: '模板库', courseCode: 'LIB', isLibrary: true },
        ],
      },
    })
  })

  it('copies a library template onto a teaching course and opens the draft', async () => {
    const user = userEvent.setup()
    render(<CompositeAssessmentList />)

    expect(await screen.findByText('我的测评')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /管理员模板/ }))

    expect(screen.getByText('管理员模板A')).toBeInTheDocument()
    expect(screen.getByText('焦虑量表')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /模板库/ })).not.toBeInTheDocument()

    const copyButton = screen.getByRole('button', { name: '复制到我的课程' })
    expect(copyButton).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('复制到我的课程'), 'c1')
    expect(copyButton).toBeEnabled()

    await user.click(copyButton)
    await waitFor(() => {
      expect(mockCompositeApi.copy).toHaveBeenCalledWith('lib-1', { courseId: 'c1' })
    })
    expect(mockNavigate).toHaveBeenCalledWith('/composite-assessments/draft-99')
  })
})
