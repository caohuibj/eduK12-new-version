import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockNavigate, mockGet, mockCompositeApi, authState } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGet: vi.fn(),
  mockCompositeApi: {
    list: vi.fn(),
    listLibrary: vi.fn(),
    copy: vi.fn(),
    create: vi.fn(),
  },
  authState: { user: { id: 'teacher-1', role: 'TEACHER' as 'TEACHER' | 'ADMIN' } },
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
  useAuth: () => ({ user: authState.user }),
}))

import CompositeAssessmentList from '../CompositeAssessmentList'

describe('CompositeAssessmentList library tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'teacher-1', role: 'TEACHER' }
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
          { id: 'c1', title: '语文', courseCode: 'YU', isLibrary: false, creatorId: 'teacher-1' },
          { id: 'c2', title: '数学', courseCode: 'SHU', isLibrary: false, creatorId: 'teacher-1' },
          { id: 'lib-course', title: '模板库', courseCode: 'LIB', isLibrary: true, creatorId: 'admin-1' },
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

  it('lets an admin copy only onto their own non-library courses', async () => {
    authState.user = { id: 'admin-1', role: 'ADMIN' }
    mockGet.mockResolvedValue({
      code: 0,
      data: {
        list: [
          { id: 'own', title: '我的授课课', courseCode: 'OWN', isLibrary: false, creatorId: 'admin-1' },
          { id: 'other-t', title: '王老师的课', courseCode: 'WT', isLibrary: false, creatorId: 'teacher-2' },
          { id: 'lib-course', title: '模板库', courseCode: 'LIB', isLibrary: true, creatorId: 'admin-1' },
          { id: 'peer', title: '同事授课课', courseCode: 'COL', isLibrary: false, creatorId: 'admin-2' },
        ],
      },
    })

    const user = userEvent.setup()
    render(<CompositeAssessmentList />)
    await screen.findByText('我的测评')
    await user.click(screen.getByRole('button', { name: /管理员模板/ }))

    expect(screen.getByRole('option', { name: /我的授课课/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /王老师的课/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /同事授课课/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /模板库/ })).not.toBeInTheDocument()
  })

  it('shows a library course badge on 我的 when the composite is bound to a library course', async () => {
    mockCompositeApi.list.mockResolvedValue({
      code: 0,
      data: {
        list: [{
          id: 'lib-comp',
          name: '库上的模板',
          code: 'LIBC',
          status: 'PUBLISHED',
          itemCount: 1,
          copyable: true,
          canSetCopyable: true,
          createdBy: 'admin-1',
          creator: { id: 'admin-1', role: 'ADMIN' },
          course: { id: 'lib-course', title: '模板库', courseCode: 'LIB', isLibrary: true },
          attemptCounts: { started: 0, completed: 0 },
        }],
      },
    })

    render(<CompositeAssessmentList />)
    expect(await screen.findByText('库上的模板')).toBeInTheDocument()
    expect(screen.getByText('库课程')).toBeInTheDocument()
    expect(screen.getByText('可复制')).toBeInTheDocument()
  })
})
