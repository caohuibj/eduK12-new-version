import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../api/client', () => ({ default: { get }, sessionFetch: vi.fn() }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'teacher-1', role: 'TEACHER' } }) }))
vi.mock('../../components/RichTextEditor', () => ({ default: () => null }))
vi.mock('../../components/QuestionEditor', () => ({ default: () => null }))
vi.mock('../../components/MediaSelector', () => ({ default: () => null }))
import AssignmentList from '../AssignmentList'

describe('AssignmentList states', () => {
  beforeEach(() => { get.mockReset() })
  it('keeps failed reads distinct from empty records and retries the same list request', async () => {
    let failed = true
    get.mockImplementation(async (url: string) => url === '/assignments' && failed
      ? { code: 1, message: 'Offline' }
      : { code: 0, data: url.endsWith('/tags') ? { tags: [] } : { list: [] } })
    const user = userEvent.setup()
    render(<MemoryRouter><AssignmentList /></MemoryRouter>)
    expect(await screen.findByText('作业列表加载失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无匹配作业')).not.toBeInTheDocument()
    expect(screen.queryByText('共 0 个作业')).not.toBeInTheDocument()
    failed = false
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('暂无匹配作业')).toBeInTheDocument()
    expect(get.mock.calls.filter(([url]) => url === '/assignments')).toHaveLength(2)
  })
  it('opens course-initiated creation with the permitted course already selected', async () => {
    get.mockImplementation(async (url: string) => ({ code: 0, data: url === '/courses' ? { list: [{ id: 'course', title: '当前课程' }] } : url.endsWith('/tags') ? { tags: [] } : { list: [] } }))
    render(<MemoryRouter initialEntries={['/assignments?create=true&courseId=course']}><AssignmentList /></MemoryRouter>)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('选择课程 *')).toHaveValue('course')
  })

})
