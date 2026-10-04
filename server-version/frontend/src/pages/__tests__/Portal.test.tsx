import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ parentPortalEnabled: false, isLoading: false, status:'ready', retry:vi.fn() }))
vi.mock('../../contexts/CapabilitiesContext', () => ({ useCapabilities: () => state }))
vi.mock('../../components/app-shell/useAuthLinks', () => ({ useAuthLinks: () => (path: string) => path }))
import Portal from '../Portal'

describe('portal role discovery', () => {
  it('shows retry for failed availability instead of claiming closure',()=>{state.status='error';render(<MemoryRouter><Portal /></MemoryRouter>);expect(screen.getByText('家长入口状态读取失败，请重试。')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'重试'}));expect(state.retry).toHaveBeenCalled();state.status='ready'})
  it('places all enabled links before the unavailable parent card in DOM and keyboard order', () => {
    render(<MemoryRouter><Portal /></MemoryRouter>)
    const navigation = screen.getByRole('navigation', { name: '身份入口' })
    const cards = [...navigation.children]
    expect(cards.map(card => card.querySelector('strong')?.textContent)).toEqual(['学生入口', '教师入口', '管理员入口', '家长入口'])
    expect(screen.getByRole('link', { name: /管理员入口/ })).toHaveAttribute('href', '/admin/login')
    expect(screen.queryByRole('link', { name: /家长入口/ })).not.toBeInTheDocument()
    expect(screen.getByText('家长入口尚未开放，请以学校通知为准。')).toBeInTheDocument()
  })
})
