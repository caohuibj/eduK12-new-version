import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { CourseShare, User } from '../../types'

const { api, auth } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  auth: { user: { id: 'recipient', username: 'receiver', role: 'TEACHER' } as User },
}))
vi.mock('../../api/client', () => ({ default: api }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }))
import CourseList from '../CourseList'

const share = (sharedBy = 'sharer'): CourseShare => ({
  id: 'share-1', courseId: 'course-1', sharedBy, sharedTo: 'recipient', createdAt: '2026-10-17T10:00:00Z',
  sharer: { id: sharedBy, username: 'original', role: 'ADMIN' },
  course: {
    id: 'course-1', title: '分享的培训课程', description: '内容复用', courseCode: 'SHARE1',
    creatorId: sharedBy, status: 'PUBLISHED', isRecruiting: false,
    createdAt: '2026-10-17T10:00:00Z', updatedAt: '2026-10-17T10:00:00Z',
  },
})
let currentShare: CourseShare
const page = () => <MemoryRouter><CourseList /></MemoryRouter>

beforeEach(() => {
  vi.resetAllMocks()
  auth.user = { id: 'recipient', username: 'receiver', role: 'TEACHER' }
  currentShare = share()
  api.get.mockImplementation((url: string) => Promise.resolve({ code: 0, data: { list: url.includes('shared-to-me') ? [currentShare] : [] } }))
  api.delete.mockResolvedValue({ code: 0, data: null })
  api.post.mockResolvedValue({ code: 0, data: { courseCode: 'CLONED' } })
})

const openShared = async () => {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /分享给我的/ }))
  await screen.findByText('分享的培训课程')
  return user
}

describe('CourseShare removal follows sharedBy and business ADMIN authority', () => {
  it('lets a recipient reuse content without exposing remove, roster, or report controls', async () => {
    render(page())
    const user = await openShared()
    expect(screen.queryByTitle('移除')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /管理学生|报告/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制使用' }))
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/courses/share/share-1/clone'))
    expect(api.delete).not.toHaveBeenCalled()
  })

  it.each([
    ['TEACHER', 'STANDARD', false],
    ['TEACHER', 'SYSTEM_ADMIN', false],
    ['ADMIN', 'STANDARD', true],
    ['ADMIN', 'SYSTEM_ADMIN', true],
  ] as const)('maps role %s with platformRole %s without expanding backend permissions', async (role, platformRole, allowed) => {
    auth.user = { ...auth.user, role, platformRole }
    render(page())
    await openShared()
    if (allowed) expect(screen.getByRole('button', { name: '取消分享 分享的培训课程' })).toBeEnabled()
    else expect(screen.queryByTitle('移除')).not.toBeInTheDocument()
  })

  it.each(['sharer', 'admin'])('preserves the existing %s removal action', async authority => {
    if (authority === 'sharer') currentShare = share('recipient')
    else auth.user = { ...auth.user, role: 'ADMIN' }
    render(page())
    const user = await openShared()
    await user.click(screen.getByRole('button', { name: '取消分享 分享的培训课程' }))
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/courses/share/share-1'))
    expect(api.delete).toHaveBeenCalledTimes(1)
  })

  it('rechecks authority when a pending removal confirmation outlives the user role', async () => {
    auth.user = { ...auth.user, role: 'ADMIN' }
    const view = render(page())
    const user = await openShared()
    await user.click(screen.getByRole('button', { name: '取消分享 分享的培训课程' }))
    auth.user = { ...auth.user, role: 'TEACHER', platformRole: 'SYSTEM_ADMIN' }
    view.rerender(page())
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.queryByTitle('移除')).not.toBeInTheDocument()
  })
})
