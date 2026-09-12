import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from '../AppShell'
import { RouteAccess } from '../RouteAccess'
import { rememberReauthReturn } from '../access'
import type { User } from '../../../types'

const auth = vi.hoisted(() => ({ user: null as User | null, isLoading: false, logout: vi.fn() }))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../../../contexts/CapabilitiesContext', () => ({ useCognitiveEnabled: () => true }))
vi.mock('../../../pages/FirstLoginPasswordChange', () => ({ default: () => <p>修改临时密码</p> }))
const student = { id: 's1', role: 'STUDENT', username: 'student' } as User
beforeEach(() => { auth.user = student; auth.isLoading = false; sessionStorage.clear() })
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output> }
it('preserves protected deep-link query and hash through sign-in redirect', () => {
  auth.user = null
  render(<MemoryRouter initialEntries={['/student/scales/1?attempt=a#answer']}><Routes><Route path="/student/scales/:id" element={<RouteAccess roles={['STUDENT']}><p>private</p></RouteAccess>} /><Route path="/student/login" element={<Location />} /></Routes></MemoryRouter>)
  expect(screen.getByRole('status')).toHaveTextContent('/student/login?returnTo=%2Fstudent%2Fscales%2F1%3Fattempt%3Da%23answer')
  expect(screen.queryByText('private')).not.toBeInTheDocument()
})
it('never mounts protected children for another account after expiry', () => {
  rememberReauthReturn({ id: 'original', role: 'STUDENT' }, '/student/scales/1?returnTo=%2Fstudent')
  const child = vi.fn(() => <p>draft contents</p>)
  const Child = child
  render(<MemoryRouter initialEntries={['/student/scales/1']}><RouteAccess roles={['STUDENT']}><Child /></RouteAccess></MemoryRouter>)
  expect(screen.getByText('请使用原账户继续')).toBeInTheDocument()
  expect(child).not.toHaveBeenCalled()
})
it('resumes the original account and retains mandatory password change', () => {
  rememberReauthReturn(student, '/student/scales/1')
  const { rerender } = render(<MemoryRouter initialEntries={['/student/scales/1']}><RouteAccess roles={['STUDENT']}><p>authorized page</p></RouteAccess></MemoryRouter>)
  expect(screen.getByText('authorized page')).toBeInTheDocument()
  auth.user = { ...student, mustChangePassword: true }
  rerender(<MemoryRouter><RouteAccess roles={['STUDENT']}><p>authorized page</p></RouteAccess></MemoryRouter>)
  expect(screen.getByText('修改临时密码')).toBeInTheDocument()
  expect(screen.queryByText('authorized page')).not.toBeInTheDocument()
})
describe('one shared chrome', () => {
  it('selects one active nav item and returns focus on Escape', async () => {
    render(<MemoryRouter initialEntries={['/student/cognitive/history']}><AppShell><h1>历史</h1></AppShell></MemoryRouter>)
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: '主要导航' })).toHaveTextContent('认知测评')
    const toggle = screen.getByRole('button', { name: '导航菜单' })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const nav = screen.getByRole('navigation', { name: '主要导航' })
    nav.querySelector('a')?.focus()
    await userEvent.keyboard('{Escape}')
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
  it('keeps focused player descendants outside product token scope', () => {
    render(<MemoryRouter initialEntries={['/public/cognitive/sessions/s1']}><AppShell><button>task control</button></AppShell></MemoryRouter>)
    expect(screen.queryByRole('navigation', { name: '主要导航' })).not.toBeInTheDocument()
    expect(screen.getByText('公开参与')).toBeInTheDocument()
    expect(screen.getByText('task control').closest('.hui-product')).toBeNull()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })
})
