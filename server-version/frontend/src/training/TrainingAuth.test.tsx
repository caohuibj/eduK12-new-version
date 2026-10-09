import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./context', () => ({
  isTrainingHost: () => true,
  trainingNavigation: () => [],
}))

import AuthShell from '../components/auth/AuthShell'

describe('training authentication shell', () => {
  it('uses learner terminology and removes unrelated school messaging', () => {
    render(<MemoryRouter><AuthShell tone="student" title="学生登录" description="使用学生账号登录">
      <button type="button">登录</button>
    </AuthShell></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '学员登录' })).toBeInTheDocument()
    expect(screen.getByText('使用学员账号登录')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Huitraining/i })).toHaveTextContent('Huitraining')
    expect(screen.getByRole('link', { name: /Huitraining/i }).querySelector('img')).toBeInTheDocument()
    expect(screen.queryByText(/Healthier Students/)).toBeNull()
    expect(screen.getByRole('link', { name: /Huitraining/i })).toHaveAttribute('href', '/')
  })

  it.each([
    ['/student/login', '/student/login', '/student/course-login', 'student', '登录'],
    ['/student/course-login', '/student/login', '/student/course-login', 'student', '注册'],
    ['/teacher/account-login', '/teacher/account-login', '/teacher/login', 'teacher', '登录'],
    ['/teacher/login', '/teacher/account-login', '/teacher/login', 'teacher', '注册'],
  ] as const)('keeps %s mode navigation consistent and preserves the return destination', (path, loginPath, registerPath, tone, selected) => {
    render(<MemoryRouter initialEntries={[`${path}?returnTo=%2Fstudent%2Fcourses%2Fcourse-1`]}>
      <AuthShell tone={tone} title="账号入口" description="测试"><input aria-label="账号" /></AuthShell>
    </MemoryRouter>)
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', `${loginPath}?returnTo=%2Fstudent%2Fcourses%2Fcourse-1`)
    expect(screen.getByRole('link', { name: '注册' })).toHaveAttribute('href', `${registerPath}?returnTo=%2Fstudent%2Fcourses%2Fcourse-1`)
    expect(screen.getByRole('link', { name: selected })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: selected === '登录' ? '注册' : '登录' })).not.toHaveAttribute('aria-current')
  })

  it('keeps the verification step active when an account page has not verified its code', () => {
    render(<MemoryRouter initialEntries={['/student/register']}>
      <AuthShell tone="student" title="学生账号注册" description="需要先完成课程码验证" registrationStep="verify"><p>请先输入课程码。</p></AuthShell>
    </MemoryRouter>)
    expect(screen.getByText('验证课程码').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('创建账号').closest('li')).not.toHaveAttribute('aria-current')
    expect(screen.queryByText('✓')).toBeNull()
  })

  it('uses trainer terminology without hiding the current login form', () => {
    render(<MemoryRouter><AuthShell tone="teacher" title="教师登录" description="教师邀请码注册">
      <input aria-label="登录账号" />
    </AuthShell></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '培训师登录' })).toBeInTheDocument()
    expect(screen.getByText('培训师注册码注册')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '登录账号' })).toBeInTheDocument()
  })
})
