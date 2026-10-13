import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCursorList } from './useCursorList'
import StudentCheckins from '../pages/student/StudentCheckins'
import TrainingLearnerHome from '../training/TrainingLearnerHome'
const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../api/client', () => ({ default: { get } }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'student', nickname: '学员', role: 'STUDENT' } }) }))
beforeEach(() => { get.mockReset() })
function Harness({ path }: { path: string | null }) {
  const state = useCursorList<{ id: string; title: string }>(path)
  return <><p>{state.list.map(row => row.title).join(',')}</p>{state.error && <p role="alert">{state.error}</p>}{state.hasMore && <button disabled={state.loading} onClick={() => void state.more()}>更多</button>}</>
}
describe('visible cursor list continuation', () => {
  it.each([['training', '/courses/my', '加载更多课程'], ['checkins', '/checkins/my', '加载更多打卡']])('keeps the %s first page while loading the next page', async (kind, path, button) => {
    get.mockImplementation((url: string) => Promise.resolve({ code: 0, data: url === path
      ? { list: [{ id: 'a', title: '第一页', description: '描述' }], nextCursor: 'next' }
      : { list: [{ id: 'b', title: '第二页', description: '描述' }], nextCursor: null } }))
    render(<MemoryRouter>{kind === 'training' ? <TrainingLearnerHome /> : <StudentCheckins />}</MemoryRouter>)
    await screen.findByText('第一页')
    fireEvent.click(screen.getByRole('button', { name: button }))
    await screen.findByText('第二页'); expect(screen.getByText('第一页')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(path+'?cursor=next')
    expect(screen.queryByRole('button', { name: button })).toBeNull()
  })
  it('retains rows and a retryable cursor on next-page failure, deduplicating only successful pages', async () => {
    get.mockResolvedValueOnce({ code: 0, data: { list: [{ id: 'a', title: 'A' }], nextCursor: 'next' } })
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ code: 0, data: { list: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], nextCursor: null } })
    render(<Harness path="/list" />)
    await screen.findByText('A'); fireEvent.click(screen.getByText('更多'))
    await screen.findByRole('alert'); expect(screen.getByText('A')).toBeInTheDocument()
    fireEvent.click(screen.getByText('更多')); await screen.findByText('A,B')
  })
  it('ignores a response from a closed or changed list', async () => {
    let finish!: (value: unknown) => void
    get.mockImplementation((url: string) => url === '/old' ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ code: 0, data: { list: [{ id: 'b', title: 'NEW' }] } }))
    const view = render(<Harness path="/old" />)
    await waitFor(() => expect(get).toHaveBeenCalledWith('/old'))
    view.rerender(<Harness path="/new" />); await screen.findByText('NEW')
    finish({ code: 0, data: { list: [{ id: 'a', title: 'STALE' }] } })
    await waitFor(() => expect(screen.queryByText('STALE')).toBeNull())
    expect(screen.getByText('NEW')).toBeInTheDocument()
  })
})
