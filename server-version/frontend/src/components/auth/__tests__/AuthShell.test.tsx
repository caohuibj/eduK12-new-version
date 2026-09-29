import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AuthShell from '../AuthShell'

describe('AuthShell back control', () => {
  it('keeps the existing link-backed return behavior by default', () => {
    render(
      <MemoryRouter>
        <AuthShell tone="teacher" title="登录" description="测试">
          <div>内容</div>
        </AuthShell>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '返回入口' })).toHaveAttribute('href', '/')
  })

  it('uses the provided action instead of navigation when requested', () => {
    const onBack = vi.fn()
    render(
      <MemoryRouter>
        <AuthShell tone="student" title="修改密码" description="测试" backLabel="退出" onBack={onBack}>
          <div>内容</div>
        </AuthShell>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: '退出' })).toBeNull()
  })
})
