import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveRunner } from '../registry'
import { DigitbackwardTask } from '../tasks/digitbackward/DigitbackwardTask'
import { PicturesequenceTask } from '../tasks/picturesequence/PicturesequenceTask'
import { PairedassociateTask } from '../tasks/pairedassociate/PairedassociateTask'
import { digitBackwardSequence, pairedAssociateSet, pictureSequenceItems } from '../tasks/shared/prng'
import golden from '../../../../../cognitive-randomization-golden-v1.json'

const context = {
  sessionId: 'session-pr4', testType: 'digitbackward', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', attemptNo: 1, randomSeed: 'golden-seed', config: {},
}
const digitPractice = [[3, 8, 1], [6, 2, 9], [4, 7, 0], [5, 1, 8]]
const picturePracticeLabels = [
  ['拿出水杯', '倒入清水', '喝水'],
  ['倒入清水', '喝水', '拿出水杯'],
  ['喝水', '拿出水杯', '倒入清水'],
  ['拿出水杯', '喝水', '倒入清水'],
]
const actions = ['整理书包', '走进教室', '打开课本', '听老师讲解', '记录重点', '完成练习', '收好文具', '走向操场', '准备午餐', '清理桌面', '阅读图书', '归还图书', '参加活动', '整理座位', '离开校园']
const sceneLabel = (itemId: string) => {
  const number = Number(itemId.slice(-2))
  return `故事 ${Math.floor((number - 1) / 15) + 1} · ${actions[(number - 1) % 15]}`
}

afterEach(() => vi.useRealTimers())

describe('Round 2 PR4 task runners', () => {
  it('registers exact versions and matches backend randomization golden', () => {
    expect(resolveRunner('digitbackward', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('picturesequence', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('pairedassociate', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('digitbackward', 'latest')).toBeUndefined()
    expect(Array.from({ length: 4 }, (_, index) => digitBackwardSequence(golden.seed, index, 2 + Math.floor(index / 2)))).toEqual(golden.digitbackward)
    expect(pictureSequenceItems(golden.seed, 12)).toEqual(golden.picturesequence)
    expect(pairedAssociateSet(golden.seed, 12)).toEqual(golden.pairedassociate)
  })

  it('does not persist failed digit-backward practice and offers retry', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn()
    render(<DigitbackwardTask taskContext={{ ...context, config: { startSpan: 2, maxSpan: 4, digitDisplayMs: 1, digitIntervalMs: 0, readyDurationMs: 1, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let question = 0; question < 4; question += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2) })
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      for (let digit = 0; digit < 3; digit += 1) fireEvent.click(screen.getByRole('button', { name: '0' }))
      fireEvent.click(screen.getByRole('button', { name: '提交' }))
      fireEvent.click(screen.getByRole('button', { name: question === 3 ? '查看练习结果' : '下一题' }))
    }
    expect(screen.getByText('重新练习')).toBeInTheDocument()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('does not persist failed picture-sequence practice and offers retry', () => {
    const onTrialComplete = vi.fn()
    render(<PicturesequenceTask taskContext={{ ...context, testType: 'picturesequence', config: { itemCount: 6, learningRounds: 2, delayedEnabled: false, delayedDelayMs: 0, studyMsPerItem: 100, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let question = 0; question < 4; question += 1) {
      fireEvent.click(screen.getByText('我记好了，开始排序'))
      for (const label of ['喝水', '倒入清水', '拿出水杯']) fireEvent.click(screen.getByRole('button', { name: label }))
      fireEvent.click(screen.getByText('提交排序'))
      fireEvent.click(screen.getByText(question === 3 ? '查看练习结果' : '下一题'))
    }
    expect(screen.getByText('重新练习')).toBeInTheDocument()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('does not persist failed paired-associate practice and offers retry', () => {
    const onTrialComplete = vi.fn()
    render(<PairedassociateTask taskContext={{ ...context, testType: 'pairedassociate', config: { pairCount: 6, learningRounds: 2, delayedEnabled: false, delayedDelayMs: 0, studyDurationMs: 100, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let question = 0; question < 4; question += 1) {
      fireEvent.click(screen.getByText('我记好了，开始作答'))
      fireEvent.click(screen.getByRole('button', { name: '位置 1' }))
      fireEvent.click(screen.getByRole('button', { name: '位置 1' }))
      fireEvent.click(screen.getByText('提交本轮'))
      fireEvent.click(screen.getByText(question === 3 ? '查看练习结果' : '下一题'))
    }
    expect(screen.getByText('重新练习')).toBeInTheDocument()
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('submits the seed-derived reverse digit trial after passing practice', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<DigitbackwardTask taskContext={{ ...context, config: { startSpan: 2, maxSpan: 4, digitDisplayMs: 1, digitIntervalMs: 0, readyDurationMs: 1, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let question = 0; question < 4; question += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(2) })
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      for (const digit of [...digitPractice[question]].reverse()) fireEvent.click(screen.getByRole('button', { name: String(digit) }))
      fireEvent.click(screen.getByRole('button', { name: '提交' }))
      fireEvent.click(screen.getByRole('button', { name: question === 3 ? '查看练习结果' : '下一题' }))
    }
    fireEvent.click(screen.getByText('开始正式测验'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    const expected = digitBackwardSequence(context.randomSeed, 0, 2)
    for (const digit of [...expected].reverse()) fireEvent.click(screen.getByRole('button', { name: String(digit) }))
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await vi.waitFor(() => expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({ sequence: expected, response: [...expected].reverse() })))
  })

  it('submits the frozen picture set after passing practice', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<PicturesequenceTask taskContext={{ ...context, testType: 'picturesequence', config: { itemCount: 6, learningRounds: 2, delayedEnabled: false, delayedDelayMs: 0, studyMsPerItem: 100, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let question = 0; question < 4; question += 1) {
      fireEvent.click(screen.getByText('我记好了，开始排序'))
      for (const label of picturePracticeLabels[question]) fireEvent.click(screen.getByRole('button', { name: label }))
      fireEvent.click(screen.getByText('提交排序'))
      fireEvent.click(screen.getByText(question === 3 ? '查看练习结果' : '下一题'))
    }
    fireEvent.click(screen.getByText('开始正式测验'))
    fireEvent.click(screen.getByText('我记好了，开始排序'))
    const expected = pictureSequenceItems(context.randomSeed, 6)
    for (const item of expected) fireEvent.click(screen.getByRole('button', { name: sceneLabel(item) }))
    fireEvent.click(screen.getByText('提交排序'))
    await vi.waitFor(() => expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({ itemIds: expected, responseOrder: expected, phase: 'learning' })))
  })

  it('submits server-replayable paired-associate responses after passing practice', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<PairedassociateTask taskContext={{ ...context, testType: 'pairedassociate', config: { pairCount: 6, learningRounds: 2, delayedEnabled: false, delayedDelayMs: 0, studyDurationMs: 100, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    const targets = [[0, 2], [1, 3], [3, 0], [2, 1]]
    for (let question = 0; question < 4; question += 1) {
      fireEvent.click(screen.getByText('我记好了，开始作答'))
      for (const target of targets[question]) fireEvent.click(screen.getByRole('button', { name: `位置 ${target + 1}` }))
      fireEvent.click(screen.getByText('提交本轮'))
      fireEvent.click(screen.getByText(question === 3 ? '查看练习结果' : '下一题'))
    }
    fireEvent.click(screen.getByText('开始正式测验'))
    fireEvent.click(screen.getByText('我记好了，开始作答'))
    const expected = pairedAssociateSet(context.randomSeed, 6)
    for (const item of expected) fireEvent.click(screen.getByRole('button', { name: `位置 ${item.targetPosition + 1}` }))
    fireEvent.click(screen.getByText('提交本轮'))
    await vi.waitFor(() => expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({ responses: expected.map((item) => ({ itemId: item.itemId, selectedPosition: item.targetPosition })), phase: 'learning' })))
  })
})
