import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MoreActions from '../MoreActions'

describe('more actions outside clipping ancestors', () => {
  it('carries only its own Training teacher skin into the portalled menu', () => {
    render(<div className="training-teacher-visual"><MoreActions label="教师操作"><button>编辑</button></MoreActions></div>)
    fireEvent.click(screen.getByRole('button', { name: '教师操作' }))
    expect(screen.getByRole('group', { name: '教师操作菜单' })).toHaveAttribute('data-training-teacher', 'true')
  })
  it('does not apply the teacher skin to an ordinary menu', () => {
    render(<MoreActions label="普通操作"><button>编辑</button></MoreActions>)
    fireEvent.click(screen.getByRole('button', { name: '普通操作' }))
    expect(screen.getByRole('group', { name: '普通操作菜单' })).not.toHaveAttribute('data-training-teacher')
  })
  it('opens labelled actions outside the table and restores focus with Escape', () => {
    render(<div data-testid="clipping-table" style={{ overflow: 'hidden' }}><MoreActions label="合成练习操作"><button>编辑练习</button></MoreActions></div>)
    const trigger = screen.getByRole('button', { name: '合成练习操作' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('group', { name: '合成练习操作菜单' })
    expect(screen.getByTestId('clipping-table')).not.toContainElement(menu)
    expect(screen.getByRole('button', { name: '编辑练习' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('group')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
  it('focuses the opening action without scrolling the page and dismissing the menu', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    render(<MoreActions><button>令牌管理</button></MoreActions>)
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(screen.getByRole('button', { name: '令牌管理' })).toHaveFocus()
    focus.mockRestore()
  })
  it('runs an action once and closes; outside clicks also dismiss', () => {
    const edit = vi.fn()
    render(<><MoreActions><button onClick={edit}>编辑</button></MoreActions><button>其他操作</button></>)
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    expect(edit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: '其他操作' }))
    expect(screen.queryByRole('group')).toBeNull()
  })
  it('ignores automatic table scroll but dismisses on outside wheel or touch intent', () => {
    render(<MoreActions><button>编辑</button></MoreActions>)
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.scroll(screen.getByRole('group'))
    expect(screen.getByRole('group')).toBeInTheDocument()
    fireEvent.scroll(window)
    expect(screen.getByRole('group')).toBeInTheDocument()
    fireEvent.wheel(screen.getByRole('group'))
    expect(screen.getByRole('group')).toBeInTheDocument()
    fireEvent.wheel(window)
    expect(screen.queryByRole('group')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '更多操作' }))
    fireEvent.touchMove(window)
    expect(screen.queryByRole('group')).toBeNull()
  })

})
