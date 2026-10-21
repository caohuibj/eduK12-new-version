import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import TrainingTaskReusePicker from './TrainingTaskReusePicker'
import type { Course } from '../types'
const m = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../api/client', () => ({ default: m }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'trainer' } }) }))
beforeEach(() => vi.resetAllMocks())
it('pages and searches all prior tasks without narrowing to the destination course', async () => {
  m.get.mockResolvedValue({ code: 0, data: { list: [{ id: 'old', title: '历史练习', courseId: 'source' }], total: 21 } })
  render(<TrainingTaskReusePicker kind="assignments" courses={[{ id: 'target', title: '当前课程', creatorId: 'trainer' } as Course]} initialCourseId="target" onClose={vi.fn()} onSelect={vi.fn()} />)
  await screen.findByText('历史练习')
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await waitFor(() => expect(m.get).toHaveBeenLastCalledWith('/assignments?view=summary&page=2&pageSize=10&search='))
  fireEvent.change(screen.getByRole('textbox', { name: '搜索已有练习' }), { target: { value: '旧内容' } })
  fireEvent.click(screen.getByRole('button', { name: '搜索' }))
  await waitFor(() => expect(m.get).toHaveBeenLastCalledWith('/assignments?view=summary&page=1&pageSize=10&search=%E6%97%A7%E5%86%85%E5%AE%B9'))
})
