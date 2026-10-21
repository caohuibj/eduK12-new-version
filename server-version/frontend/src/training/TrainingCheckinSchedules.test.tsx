import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const { get, post, confirm } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), confirm: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get, post } }))
vi.mock('../components/staff-ui/useStaffFeedback', () => ({ useStaffFeedback: () => ({ confirm, feedback: null }) }))
import TrainingCheckinSchedules from './TrainingCheckinSchedules'
const row = { id: 'schedule', title: '每天复盘', intervalDays: 1, durationHours: 24, nextPublishAt: '2026-10-22T09:00:00Z', endsAt: null, active: true, publishedCount: 3, timezone: 'Asia/Shanghai' }
beforeEach(() => { vi.resetAllMocks(); get.mockResolvedValue({ code: 0, data: { list: [row] } }) })
it('shows the next publication in its configured timezone without publishing anything', async () => {
  render(<TrainingCheckinSchedules courseId="course" />)
  expect(await screen.findByText('每天复盘')).toBeInTheDocument()
  expect(screen.getByText(/下次：10\/22 17:00/)).toBeInTheDocument()
  expect(get).toHaveBeenCalledWith('/checkins/schedules?courseId=course'); expect(post).not.toHaveBeenCalled()
})
it('does not stop a schedule when confirmation is cancelled', async () => {
  confirm.mockResolvedValue(false)
  render(<TrainingCheckinSchedules courseId="course" />)
  fireEvent.click(await screen.findByRole('button', { name: '停止后续发布' }))
  await waitFor(() => expect(confirm).toHaveBeenCalled())
  expect(post).not.toHaveBeenCalled()
})
it('stops the exact schedule after confirmation and refreshes its status', async () => {
  confirm.mockResolvedValue(true); post.mockResolvedValue({ code: 0 })
  get.mockResolvedValueOnce({ code: 0, data: { list: [row] } }).mockResolvedValueOnce({ code: 0, data: { list: [{ ...row, active: false, nextPublishAt: null }] } })
  render(<TrainingCheckinSchedules courseId="course" />)
  fireEvent.click(await screen.findByRole('button', { name: '停止后续发布' }))
  expect(await screen.findByText('后续发布已结束')).toBeInTheDocument()
  expect(post).toHaveBeenCalledWith('/checkins/schedules/schedule/stop')
  expect(screen.queryByRole('button', { name: '停止后续发布' })).toBeNull()
})
it('keeps the existing schedule visible when stopping fails', async () => {
  confirm.mockResolvedValue(true); post.mockRejectedValue(new Error('暂时不可用'))
  render(<TrainingCheckinSchedules courseId="course" />)
  fireEvent.click(await screen.findByRole('button', { name: '停止后续发布' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时不可用')
  expect(screen.getByText('每天复盘')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '停止后续发布' })).toBeEnabled()
})
