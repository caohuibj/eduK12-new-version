import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CognitiveFocusStage } from '../tasks/shared/CognitiveFocusStage'
import { CognitiveFocusProgressContext } from '../tasks/shared/focus-progress'

describe('visible progress inside the cognitive focus stage', () => {
  it('shows and updates the fixed-trial position without remounting the task', () => {
    const view = (completed: number) => <CognitiveFocusProgressContext.Provider value={{completed,total:20}}><CognitiveFocusStage><input aria-label="保留作答" defaultValue="已输入" /></CognitiveFocusStage></CognitiveFocusProgressContext.Provider>
    const {rerender} = render(view(0))
    const task = screen.getByLabelText('保留作答')
    expect(screen.getByText('1 / 20')).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','1')
    rerender(view(7))
    expect(screen.getByText('8 / 20')).toBeVisible()
    expect(screen.getByLabelText('保留作答')).toBe(task)
  })
  it('shows recorded observations without inventing an adaptive-task denominator', () => {
    render(<CognitiveFocusProgressContext.Provider value={{completed:6}}><CognitiveFocusStage>任务</CognitiveFocusStage></CognitiveFocusProgressContext.Provider>)
    expect(screen.getByText('正式测试 · 已记录 6 次')).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
  it('keeps formal progress out of the practice stage', () => {
    render(<CognitiveFocusProgressContext.Provider value={{completed:0,total:20}}><CognitiveFocusStage ariaLabel="反应速度练习">练习 1 / 3</CognitiveFocusStage></CognitiveFocusProgressContext.Provider>)
    expect(screen.getByText('练习 1 / 3')).toBeVisible()
    expect(screen.queryByText(/正式测试/)).not.toBeInTheDocument()
  })
  it('uses a runner-provided fixed total and clamps the last position', () => {
    render(<CognitiveFocusStage progress={{completed:20,total:20}}>任务</CognitiveFocusStage>)
    expect(screen.getByText('20 / 20')).toBeVisible()
  })
})
