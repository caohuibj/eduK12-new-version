import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveRunner } from '../registry'
import { MatrixTask } from '../tasks/matrix/MatrixTask'
import { MentalrotationTask } from '../tasks/mentalrotation/MentalrotationTask'
import { TowerTask } from '../tasks/tower/TowerTask'
import { applyTowerMove, matrixSequence, mentalRotationSequence, towerSequence, type TowerMove, type TowerState } from '../tasks/shared/prng'
import golden from '../../../../../cognitive-randomization-golden-v1.json'

const context = { sessionId: 'session-pr5', testType: 'matrix', engineVersion: '1.0.0', scoringVersion: '1.0.0', configVersion: '1.0.0', attemptNo: 1, randomSeed: 'golden-seed', config: {} }
const shortestPath = (initial: TowerState, target: TowerState): Array<Omit<TowerMove, 'atMs'>> => {
  const queue: Array<{ state: TowerState; path: Array<Omit<TowerMove, 'atMs'>> }> = [{ state: initial, path: [] }]
  const visited = new Set([initial.join('')])
  while (queue.length) {
    const current = queue.shift()!
    if (current.state.every((value, index) => value === target[index])) return current.path
    for (let disk = 0; disk < 3; disk += 1) for (let from = 0; from < 3; from += 1) for (let to = 0; to < 3; to += 1) {
      const move = { disk, from, to }; const applied = applyTowerMove(current.state, move); const key = applied.state.join('')
      if (applied.valid && !visited.has(key)) { visited.add(key); queue.push({ state: applied.state, path: [...current.path, move] }) }
    }
  }
  throw new Error('missing path')
}

afterEach(() => vi.useRealTimers())

describe('Round 2 PR5 task runners', () => {
  it('registers exact versions and matches backend golden fixtures', () => {
    expect(resolveRunner('matrix', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('mentalrotation', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('tower', '1.0.0')?.completionMode).toBe('task')
    expect(resolveRunner('matrix', 'latest')).toBeUndefined()
    expect(matrixSequence(golden.seed, 6)).toEqual(golden.matrix)
    expect(mentalRotationSequence(golden.seed, 12)).toEqual(golden.mentalrotation)
    expect(towerSequence(golden.seed, 4)).toEqual(golden.tower)
  })

  it('does not persist failed practices and offers retry', () => {
    const matrixTrial = vi.fn()
    const matrix = render(<MatrixTask taskContext={{ ...context, config: { itemCount: 6, itemTimeoutMs: 1000 } }} trialIndex={0} onTrialComplete={matrixTrial} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const item of matrixSequence('matrix-practice-v1', 6).slice(0, 4)) fireEvent.click(screen.getByRole('button', { name: `选项 ${(item.correctOption + 1) % 4 + 1}` }))
    expect(screen.getByText('重新练习')).toBeInTheDocument(); expect(matrixTrial).not.toHaveBeenCalled(); matrix.unmount()

    const rotationTrial = vi.fn()
    const rotation = render(<MentalrotationTask taskContext={{ ...context, testType: 'mentalrotation', config: { totalTrials: 12, stimulusMs: 50, isiMs: 1 } }} trialIndex={0} onTrialComplete={rotationTrial} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) fireEvent.click(screen.getByText('镜像图形'))
    expect(screen.getByText('重新练习')).toBeInTheDocument(); expect(rotationTrial).not.toHaveBeenCalled(); rotation.unmount()

    const towerTrial = vi.fn()
    render(<TowerTask taskContext={{ ...context, testType: 'tower', config: { problemCount: 4, maxMovesFactor: 3, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={towerTrial} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) { fireEvent.click(screen.getByText('本题无法完成')); fireEvent.click(screen.getByText(index === 3 ? '查看练习结果' : '下一题')) }
    expect(screen.getByText('重新练习')).toBeInTheDocument(); expect(towerTrial).not.toHaveBeenCalled()
  })

  it('hides matrix design difficulty and submits the frozen item', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<MatrixTask taskContext={{ ...context, config: { itemCount: 6, itemTimeoutMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const item of matrixSequence('matrix-practice-v1', 6).slice(0, 4)) fireEvent.click(screen.getByRole('button', { name: `选项 ${item.correctOption + 1}` }))
    fireEvent.click(screen.getByText('开始正式测验'))
    expect(screen.queryByText(/难度\s*[123]/)).not.toBeInTheDocument()
    const item = matrixSequence(context.randomSeed, 6)[0]
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `选项 ${item.correctOption + 1}` })) })
    expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({ itemId: item.itemId, selectedOption: item.correctOption, timedOut: false }))
  })

  it('does not expose rotation answer metadata and supports formal keyboard response', async () => {
    vi.useFakeTimers()
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<MentalrotationTask taskContext={{ ...context, testType: 'mentalrotation', config: { totalTrials: 12, stimulusMs: 50, isiMs: 1 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const item of mentalRotationSequence('rotation-practice-v1', 12).slice(0, 4)) fireEvent.click(screen.getByText(item.correctResponse === 'same' ? '同一图形' : '镜像图形'))
    fireEvent.click(screen.getByText('开始正式测验'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2) })
    expect(screen.queryByLabelText(/镜像旋转|旋转 \d+ 度/)).not.toBeInTheDocument()
    const item = mentalRotationSequence(context.randomSeed, 12)[0]
    fireEvent.keyDown(window, { key: item.correctResponse === 'same' ? 'ArrowLeft' : 'ArrowRight' })
    await vi.waitFor(() => expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({ itemId: item.itemId, response: item.correctResponse, timedOut: false })))
  })

  it('does not reveal Tower optimal-move targets and submits replayable moves', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(true)
    render(<TowerTask taskContext={{ ...context, testType: 'tower', config: { problemCount: 4, maxMovesFactor: 3, inactivityGuardMs: 1000 } }} trialIndex={0} onTrialComplete={onTrialComplete} />)
    fireEvent.click(screen.getByText('开始练习'))
    for (const [index, [from, to]] of [[0, 1], [1, 0], [2, 1], [0, 2]].entries()) {
      fireEvent.click(screen.getByRole('button', { name: `当前状态 柱 ${from + 1}` })); fireEvent.click(screen.getByRole('button', { name: `当前状态 柱 ${to + 1}` })); fireEvent.click(screen.getByText(index === 3 ? '查看练习结果' : '下一题'))
    }
    fireEvent.click(screen.getByText('开始正式测验'))
    expect(screen.queryByText(/最短\s*\d+\s*步/)).not.toBeInTheDocument()
    expect(screen.queryByText(/已移动\s*0\s*\/\s*\d+/)).not.toBeInTheDocument()
    const problem = towerSequence(context.randomSeed, 4)[0]
    const path = shortestPath(problem.initialState, problem.targetState)
    for (const move of path) { fireEvent.click(screen.getByRole('button', { name: `当前状态 柱 ${move.from + 1}` })); fireEvent.click(screen.getByRole('button', { name: `当前状态 柱 ${move.to + 1}` })) }
    await act(async () => { fireEvent.click(screen.getByText('提交已解问题')) })
    expect(onTrialComplete).toHaveBeenCalledWith(expect.objectContaining({ problemId: problem.problemId, gaveUp: false, moves: expect.any(Array), timedOut: false }))
  }, 10_000)
})
