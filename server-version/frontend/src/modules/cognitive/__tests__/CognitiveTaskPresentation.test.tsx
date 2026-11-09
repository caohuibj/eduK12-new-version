import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CognitiveHint,
  CognitivePracticeResult,
  CognitiveProgress,
  CognitiveResponseButton,
  CognitiveTaskCompletionNotice,
  CognitiveTaskIntro,
  CognitiveTaskTransition,
  CognitiveTaskStartContext,
  CognitivePracticeFeedback,
} from '../tasks/shared/CognitiveTaskPresentation'
import { cognitiveRunnerEntries } from '../generated/runners'
import { resolveTaskGuide } from '../tasks/shared/task-guides'

describe('Cognitive task presentation primitives', () => {
  it('provides a task-specific example for every registered real task', () => {
    for (const entry of cognitiveRunnerEntries.filter(entry => entry.testType !== 'fake')) {
      expect(resolveTaskGuide(entry.testType, entry.engineVersion), `${entry.testType}/${entry.engineVersion}`).toBeDefined()
    }
  })

  it('shows the shared example while preserving the task-owned start action', () => {
    const start = vi.fn()
    render(<CognitiveTaskStartContext.Provider value={{ taskIdentity: { testType: 'flanker', engineVersion: '1.0.0' } }}>
      <CognitiveTaskIntro title="箭头判断" description="只看中央箭头" onAction={start} />
    </CognitiveTaskStartContext.Provider>)
    expect(screen.getByText('→ → ← → →')).toBeVisible()
    expect(screen.getByText('选择向左')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '开始练习' }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('keeps feedback until the task receives the explicit continue action', () => {
    const proceed = vi.fn()
    render(<CognitivePracticeFeedback outcome="incorrect" badge="漏按" actions={<button onClick={proceed}>继续下一题</button>}>
      当前字母与对照字母相同，应该按一次；你没有按。
    </CognitivePracticeFeedback>)
    expect(screen.getByRole('alert')).toHaveTextContent('应该按一次')
    expect(proceed).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '继续下一题' }))
    expect(proceed).toHaveBeenCalledTimes(1)
  })
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



  it('renders response controls without owning answer state', () => {
    const choose = vi.fn()
    render(
      <CognitiveResponseButton selected keyHint="F" onClick={choose}>
        左侧目标
      </CognitiveResponseButton>,
    )

    const response = screen.getByRole('button', { name: '左侧目标 F' })
    expect(response).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(response)
    expect(choose).toHaveBeenCalledTimes(1)
  })

  it('projects resolved progress values without advancing them', () => {
    render(<CognitiveProgress current={2} total={4} label="区块进度" />)

    const progress = screen.getByRole('progressbar', { name: '区块进度' })
    expect(progress).toHaveAttribute('aria-valuenow', '2')
    expect(progress).toHaveAttribute('aria-valuemax', '4')
    expect(screen.getByText('2 / 4')).toBeInTheDocument()
  })

  it('renders an optional non-timed cue without task semantics', () => {
    render(
      <CognitiveHint label="作答提示" keyHint="Space">
        仅在目标出现时作答。
      </CognitiveHint>,
    )

    expect(screen.getByRole('note')).toHaveTextContent('作答提示')
    expect(screen.getByRole('note')).toHaveTextContent('仅在目标出现时作答。')
    expect(screen.getByText('Space')).toBeInTheDocument()
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
