import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CompositeAttemptState, CompositeCurrentItem, CompositeItemType } from '../../modules/composite/types'
import FinalCompositeAssessment from '../FinalCompositeAssessment'

const fallbackUnit = (
  index: number,
  completed: boolean,
): CompositeAttemptState['items'][number] => {
  const defaults: Array<{ id: string; type: CompositeItemType; label: string }> = [
    { id: 'scale-slot', type: 'SCALE', label: '量表' },
    { id: 'cognitive-slot', type: 'COGNITIVE', label: '认知' },
    { id: 'form-slot', type: 'FORM_SECTION', label: '表单' },
    { id: 'situational-slot', type: 'SITUATIONAL', label: '情境' },
  ]
  const unit = defaults[index] || { id: `slot-${index}`, type: 'FORM_SECTION' as const, label: `单元 ${index + 1}` }
  return { ...unit, position: index, completed, index }
}

const stateFor = (currentItem: CompositeCurrentItem, completedItems = 1, totalItems = 4): CompositeAttemptState => {
  const items = Array.from({ length: totalItems }, (_, index) => fallbackUnit(index, index < completedItems))
  items[completedItems] = {
    id: currentItem.id,
    type: currentItem.type,
    position: completedItems,
    label: '当前任务',
    completed: false,
    index: completedItems,
  }

  return {
    id: 'bundle-attempt-1',
    assessmentId: 'bundle-1',
    name: '四域综合测评',
    instruction: '按顺序完成每个单元。',
    status: 'IN_PROGRESS',
    progress: Math.round((completedItems / totalItems) * 100),
    completedItems,
    totalItems,
    currentIndex: completedItems,
    startedAt: '2026-09-14T00:00:00.000Z',
    lastSavedAt: '2026-09-14T00:00:00.000Z',
    completedAt: null,
    anonymousCode: null,
    items,
    currentItem,
    deliveryMode: 'FINAL_ONLY',
    attemptEpoch: 1,
    contextSnapshotHash: null,
  }
}

const sharedProps = {
  submitFormSection: vi.fn(),
  submitScale: vi.fn(),
  onReload: vi.fn().mockResolvedValue(undefined),
  onExit: vi.fn(),
  onCompleted: vi.fn(),
  onRestart: vi.fn(),
}

describe('FinalCompositeAssessment Bundle shell', () => {
  it('uses server parent counts and frozen Cognitive readiness without creating child state', async () => {
    const user = userEvent.setup()
    const onEnterCognitive = vi.fn()
    const item: CompositeCurrentItem = {
      id: 'cognitive',
      type: 'COGNITIVE',
      position: 1,
      required: true,
      cognitiveSession: {
        sessionId: 'cognitive-session-1',
        testType: 'reaction',
        engineVersion: '1.0.0',
      } as CompositeCurrentItem['cognitiveSession'],
    }

    render(
      <FinalCompositeAssessment
        {...sharedProps}
        state={stateFor(item)}
        onEnterCognitive={onEnterCognitive}
        onEnterSituational={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', { name: '四域综合测评' })).toBeInTheDocument()
    expect(screen.getByText('当前单元：当前任务')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '综合测评单元进度' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('可用输入：键盘、鼠标/指针、触控')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开始/继续认知任务' }))
    expect(onEnterCognitive).toHaveBeenCalledWith(item)
    expect(sharedProps.submitFormSection).not.toHaveBeenCalled()
    expect(sharedProps.submitScale).not.toHaveBeenCalled()
  })

  it('shows frozen Situational runtime support and delegates entry to the existing child attempt', async () => {
    const user = userEvent.setup()
    const onEnterSituational = vi.fn()
    const item: CompositeCurrentItem = {
      id: 'situational',
      type: 'SITUATIONAL',
      position: 3,
      required: true,
      situationalAttemptId: 'situational-attempt-1',
      instrument: {
        key: 'sjt-1',
        version: '1.0.0',
        definitionHash: 'definition',
        compiledRuntimeHash: 'runtime',
        scoringVersion: '1.0.0',
        definition: {},
        runtimeCapabilities: {
          standalone: true,
          embedded: true,
          aggregateEligible: true,
          collectionFacts: true,
          supported: true,
        },
      },
    }

    render(
      <FinalCompositeAssessment
        {...sharedProps}
        state={stateFor(item, 3, 4)}
        onEnterCognitive={vi.fn()}
        onEnterSituational={onEnterSituational}
      />,
    )

    expect(screen.queryByText('Bundle 嵌入运行：支持')).not.toBeInTheDocument()
    expect(await screen.findByText('问卷内参与：支持')).toBeInTheDocument()
    expect(screen.getByText('当前单元：当前任务')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '综合测评单元进度' })).toHaveAttribute('aria-valuenow', '3')
    await user.click(screen.getByRole('button', { name: '开始/继续文字情境测评' }))
    expect(onEnterSituational).toHaveBeenCalledWith(item)
  })
})
