import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CognitivePracticeResult,
  CognitiveTaskCompletionNotice,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
} from '../tasks/shared/CognitiveTaskPresentation'

describe('Cognitive task presentation primitives', () => {
  it('renders a reusable instruction panel without owning task state', () => {
    const start = vi.fn()
    render(
      <CognitiveTaskIntro
        title="持续注意"
        description="只在目标刺激出现时作答。"
        hint="练习不计入正式成绩。"
        onAction={start}
      />,
    )

    expect(screen.getByRole('heading', { name: '持续注意' })).toBeInTheDocument()
    expect(screen.getByText('练习不计入正式成绩。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开始练习' }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('projects pass/fail practice state without calculating it', () => {
    const proceed = vi.fn()
    const retry = vi.fn()
    const { rerender } = render(
      <CognitivePracticeResult correct={4} total={4} passed onContinue={proceed} onRetry={retry} detail="上一题：正确" title="第一阶段练习结果" />,
    )
    expect(screen.getByRole('heading', { name: '第一阶段练习结果' })).toBeInTheDocument()
    expect(screen.getByText('上一题：正确')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '开始正式测验' }))
    expect(proceed).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()

    rerender(<CognitivePracticeResult correct={1} total={4} passed={false} onContinue={proceed} onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: '重新练习' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('renders task transition and completion presentation only', () => {
    const proceed = vi.fn()
    const { rerender } = render(
      <CognitiveTaskTransition
        title="区块完成"
        meta="区块 2 / 3"
        description="准备好后继续。"
        actionLabel="继续下一组"
        onAction={proceed}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '继续下一组' }))
    expect(proceed).toHaveBeenCalledTimes(1)

    rerender(<CognitiveTaskCompletionNotice>请完成本次测评。</CognitiveTaskCompletionNotice>)
    expect(screen.getByRole('heading', { name: '正式试次已完成' })).toBeInTheDocument()
  })
})
