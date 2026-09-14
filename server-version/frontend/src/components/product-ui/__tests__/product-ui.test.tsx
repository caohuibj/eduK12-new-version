import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ActionBar, DiscoveryCard, PageHeader, ProductButton, ProductPage, ProductStatus } from '..'

describe('product presentation boundaries', () => {
  it('does not create a nested main landmark or a second primary heading', () => {
    render(<main><h1>我的测评</h1><ProductPage width="assessment"><PageHeader headingLevel={2} title="本次任务" description="按提示完成" /></ProductPage></main>)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: '本次任务' })).toBeInTheDocument()
  })

  it('does not submit an enclosing form implicitly; keyboard activation stays native', async () => {
    const user = userEvent.setup()
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const click = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    render(<ProductPage><form onSubmit={submit}><ActionBar label="测评操作"><ProductButton ref={ref} onClick={click}>继续</ProductButton><ProductButton disabled>暂不可用</ProductButton><ProductButton type="submit">确认提交</ProductButton></ActionBar></form></ProductPage>)
    await user.tab()
    expect(ref.current).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(click).toHaveBeenCalledTimes(2)
    expect(submit).not.toHaveBeenCalled()
    await user.tab()
    expect(screen.getByRole('button', { name: '确认提交' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('keeps static facts quiet and announces recovery only when explicitly requested', async () => {
    const retry = vi.fn()
    const { rerender } = render(<ProductPage><ProductStatus kind="success" title="已保存在本机">可以稍后继续</ProductStatus></ProductPage>)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    rerender(<ProductPage><ProductStatus kind="error" title="回答尚未保存" announce="assertive" actions={<ProductButton onClick={retry}>重试保存</ProductButton>}>请重试后继续。</ProductStatus></ProductPage>)
    expect(screen.getByRole('alert')).toHaveTextContent('回答尚未保存')
    await userEvent.click(screen.getByRole('button', { name: '重试保存' }))
    expect(retry).toHaveBeenCalledOnce()
    rerender(<ProductPage><ProductStatus kind="pending" title="正在确认提交状态" announce="polite" /></ProductPage>)
    expect(screen.getByRole('status')).toHaveTextContent('正在确认提交状态')
  })

  it('keeps discovery destination and domain semantics caller-owned', () => {
    render(
      <MemoryRouter>
        <DiscoveryCard
          to="/student/scales/scale-1"
          title="专注力测评"
          ariaLabel="专注力测评，继续作答"
          status={<span>进行中</span>}
          meta={<><span>20 道题目</span><span>约 8 分钟</span></>}
          notice="已有进行中的尝试"
        />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: '专注力测评，继续作答' })
    expect(link).toHaveAttribute('href', '/student/scales/scale-1')
    expect(screen.getByRole('heading', { level: 2, name: '专注力测评' })).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('20 道题目')).toBeInTheDocument()
    expect(screen.getByText('已有进行中的尝试')).toBeInTheDocument()
  })
})
