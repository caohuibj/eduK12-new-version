import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ login: vi.fn(), post: vi.fn(), user: null as any }))
vi.mock('./context', () => ({ isTrainingHost: () => true, trainingNavigation: () => [] }))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, login: mocks.login }) }))
vi.mock('../api/client', () => ({ default: { post: mocks.post } }))
vi.mock('../components/app-shell/LoginRecoveryNotice', () => ({ default: () => null }))
import TrainingLogin from './TrainingLogin'
import TrainingRegister from './TrainingRegister'
import TrainingAuthRedirect from './TrainingAuthRedirect'
function Destination() {
  const location = useLocation()
  return <div data-testid="destination">{location.pathname}{location.search}|{JSON.stringify(location.state)}</div>
}
beforeEach(() => { vi.clearAllMocks(); mocks.user = null })
describe('unified training authentication', () => {
  it.each([['STUDENT', '/student'], ['TEACHER', '/dashboard']])('uses server %s role for a safe home and never sends a selected role', async (role, home) => {
    mocks.login.mockImplementation(async () => { mocks.user = { id: 'local', role } })
    render(<MemoryRouter initialEntries={['/login?returnTo=%2Fusers']}><Routes><Route path="/login" element={<TrainingLogin />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>)
    expect(screen.queryByText('学员入口')).not.toBeInTheDocument()
    expect(screen.getByText(/从一门课程启程，.*在探索中求知，在实践中成长。/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'localuser' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Local12345' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByTestId('destination')).toHaveTextContent(home)
    expect(mocks.login).toHaveBeenCalledWith('localuser', 'Local12345')
  })
  it('keeps rejected credentials on the login form', async () => {
    mocks.login.mockRejectedValue(new Error('用户名或密码错误'))
    render(<MemoryRouter initialEntries={['/login']}><TrainingLogin /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'localuser' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码错误')
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled()
  })
  it.each([
    [{ kind: 'STUDENT', code: 'OLD123', course: { courseId: 'course-1', courseName: '合成课程' } }, '/student/register?course=OLD123'],
    [{ kind: 'TEACHER', code: 'ABCD1234' }, '/teacher/register?code=ABCD1234'],
  ])('routes only according to the verified code result', async (entry, destination) => {
    mocks.post.mockResolvedValue({ code: 0, data: entry })
    render(<MemoryRouter initialEntries={['/register?returnTo=%2Fstudent']}><Routes><Route path="/register" element={<TrainingRegister />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>)
    expect(screen.queryByText('学员入口')).not.toBeInTheDocument()
    expect(screen.getByText(/从一门课程启程，.*在探索中求知，在实践中成长。/)).toBeInTheDocument()
    expect(screen.getByText('验证注册码').closest('li')).toHaveAttribute('aria-current', 'step')
    fireEvent.change(screen.getByLabelText('注册码'), { target: { value: ' INPUT123 ' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))
    expect(await screen.findByTestId('destination')).toHaveTextContent(destination + '&returnTo=%2Fstudent')
    expect(mocks.post).toHaveBeenCalledWith('/auth/training-resolve-code', { code: 'INPUT123' })
    expect(mocks.login).not.toHaveBeenCalled()
  })
  it('fails closed on an unknown code classification', async () => {
    mocks.post.mockResolvedValue({ code: 0, data: { kind: 'ADMIN', code: 'bad' } })
    render(<MemoryRouter initialEntries={['/register']}><TrainingRegister /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('注册码'), { target: { value: 'unknown' } })
    fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('注册码暂不可用')
    expect(mocks.login).not.toHaveBeenCalled()
  })
  it.each(['/login', '/register'] as const)('keeps old entrance safe return links when redirecting to %s', async to => {
    render(<MemoryRouter initialEntries={['/old?returnTo=%2Fstudent']}><Routes><Route path="/old" element={<TrainingAuthRedirect to={to} />} /><Route path="*" element={<Destination />} /></Routes></MemoryRouter>)
    await waitFor(() => expect(screen.getByTestId('destination')).toHaveTextContent(to + '?returnTo=%2Fstudent'))
  })
})
