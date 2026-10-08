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
    expect(screen.getByRole('link', { name: /返回 Huisurvey Training 入口/ })).toHaveTextContent('Huisurvey Training')
    expect(screen.getByText('山')).toBeInTheDocument()
    expect(screen.queryByText(/Healthier Students/)).toBeNull()
    expect(screen.getByRole('link', { name: /返回 Huisurvey Training 入口/ })).toHaveAttribute('href', '/')
  })

  it('uses trainer terminology without hiding the current login form', () => {
    render(<MemoryRouter><AuthShell tone="teacher" title="教师登录" description="教师邀请码注册">
      <input aria-label="登录账号" />
    </AuthShell></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '培训师登录' })).toBeInTheDocument()
    expect(screen.getByText('培训师邀请码注册')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '登录账号' })).toBeInTheDocument()
  })
})
