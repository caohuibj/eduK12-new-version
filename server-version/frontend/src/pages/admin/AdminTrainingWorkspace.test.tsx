import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AdminTrainingWorkspace from './AdminTrainingWorkspace'
import { navigationFor } from '../../components/app-shell/navigation'
import { returnAfterLogin } from '../../components/app-shell/access'

describe('unified training administration', () => {
  it('exposes training workspace only in the admin menu and return gate', () => {
    expect(navigationFor('ADMIN', false).some(item => item.path === '/admin/training')).toBe(true)
    expect(navigationFor('TEACHER', false).some(item => item.path === '/admin/training')).toBe(false)
    expect(navigationFor('STUDENT', false).some(item => item.path === '/admin/training')).toBe(false)
    expect(returnAfterLogin('/admin/training', 'ADMIN')).toBe('/admin/training')
    expect(returnAfterLogin('/admin/training', 'TEACHER')).toBe('/dashboard')
  })

  it('reuses the canonical account, grant and course screens', () => {
    render(<MemoryRouter><AdminTrainingWorkspace /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: '培训版管理' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /账户审核与管理/ })).toHaveAttribute('href', '/users?workspace=training')
    expect(screen.getByRole('link', { name: /量表资源与授权/ })).toHaveAttribute('href', '/scales?workspace=training')
    expect(screen.getByRole('link', { name: /认知配置与授权/ })).toHaveAttribute('href', '/cognitive-assignments?workspace=training')
    expect(screen.getByRole('link', { name: /查看和撤销授权/ })).toHaveAttribute('href', '/admin/material-grants?workspace=training')
    expect(screen.getByRole('link', { name: /课程管理与查询/ })).toHaveAttribute('href', '/courses?workspace=training')
    expect(screen.getByText(/未建立“只属于培训版”的数据筛选/)).toBeInTheDocument()
  })
})
