import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssessmentShell } from '..'

describe('AssessmentShell presentation contract', () => {
  it('renders fixed-count progress without owning domain interaction state', () => {
    render(
      <AssessmentShell
        title="示例量表"
        instructions="按真实感受作答"
        progress={{ kind: 'count', completed: 3, total: 10, label: '答题进度' }}
        saveStatus={{ state: 'saved' }}
      >
        <fieldset><legend>领域内容</legend></fieldset>
      </AssessmentShell>,
    )

    expect(screen.getByRole('heading', { level: 1, name: '示例量表' })).toBeInTheDocument()
    const progress = screen.getByRole('progressbar', { name: '答题进度' })
    expect(progress).toHaveAttribute('aria-valuenow', '3')
    expect(progress).toHaveAttribute('aria-valuemax', '10')
    expect(screen.getByText('3 / 10')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '领域内容' })).toBeInTheDocument()
  })

  it('supports real positional progress without confusing it with completion count', () => {
    render(
      <AssessmentShell title="分段问卷" progress={{ kind: 'position', current: 2, total: 5, label: '区段位置' }}>
        <div>section</div>
      </AssessmentShell>,
    )

    const progress = screen.getByRole('progressbar', { name: '区段位置' })
    expect(progress).toHaveAttribute('aria-valuenow', '2')
    expect(progress).toHaveAttribute('aria-valuemax', '5')
    expect(screen.getByText('第 2 / 5')).toBeInTheDocument()
  })

  it('does not invent a percentage for phase or open-path progress', () => {
    const { rerender } = render(
      <AssessmentShell title="认知任务" progress={{ kind: 'phase', phase: '练习阶段', detail: '完成后进入正式任务' }}>
        <div>task</div>
      </AssessmentShell>,
    )

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText('练习阶段')).toBeInTheDocument()

    rerender(
      <AssessmentShell title="情境任务" progress={{ kind: 'open-path', visited: 2, current: '第二轮决策' }}>
        <div>scene</div>
      </AssessmentShell>,
    )

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText('已完成 2 个步骤')).toBeInTheDocument()
    expect(screen.getByText('当前：第二轮决策')).toBeInTheDocument()
  })

  it('keeps local save, recovery, readiness and FINAL state visibly distinct', () => {
    const { rerender } = render(
      <AssessmentShell
        title="任务"
        saveStatus={{ state: 'saving' }}
        interactionReadiness={{ state: 'preparing', message: '正在准备媒体' }}
      >
        <div>content</div>
      </AssessmentShell>,
    )

    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.getByText('正在准备交互')).toBeInTheDocument()
    expect(screen.getByText('正在保存到本机')).toBeInTheDocument()

    rerender(
      <AssessmentShell
        title="任务"
        recoveryState={{ state: 'blocked', message: '需要先核对服务器终态' }}
        submissionStatus={{ state: 'pending', title: '提交内容已封存', message: '保持同一 submissionId' }}
      >
        <div>content</div>
      </AssessmentShell>,
    )

    expect(screen.getByText('需要处理恢复状态')).toBeInTheDocument()
    expect(screen.getByText('提交内容已封存')).toBeInTheDocument()
    expect(screen.getByText('保持同一 submissionId')).toBeInTheDocument()
  })
})
