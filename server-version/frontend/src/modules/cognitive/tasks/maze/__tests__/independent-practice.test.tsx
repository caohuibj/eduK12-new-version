import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MazeTask } from '../MazeTask'
import { generateMaze, isMoveLegal, type MazeGrid } from '../generator'
import { generateMazePracticeV11 } from '../practice'

const config = { totalTrials: 2, mazeCols: 7, mazeRows: 7, timeLimitMs: 120000, report: { reportVersion: '1.1.0', referenceMode: 'none' } }
const context = { sessionId: 'synthetic', testType: 'maze', engineVersion: '1.1.0', scoringVersion: '1.0.1', configVersion: '1.1.0', attemptNo: 1, randomSeed: 'independent-practice-check', config }
const keys = ['ArrowUp','ArrowRight','ArrowDown','ArrowLeft']
const path = (maze: MazeGrid) => {
  const queue: Array<{ row: number; col: number; moves: number[] }> = [{ row: 0, col: 0, moves: [] }]
  const seen = new Set(['0,0'])
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]
    if (node.row === maze.rows - 1 && node.col === maze.cols - 1) return node.moves
    for (let direction = 0; direction < 4; direction++) {
      if (!isMoveLegal(maze.walls, node.row, node.col, direction)) continue
      const row = node.row + [-1,0,1,0][direction], col = node.col + [0,1,0,-1][direction], key = `${row},${col}`
      if (!seen.has(key)) { seen.add(key); queue.push({ row, col, moves: [...node.moves,direction] }) }
    }
  }
  throw Error('No route')
}
let now = 1000
beforeEach(() => { vi.useFakeTimers(); now = 1000; vi.spyOn(performance,'now').mockImplementation(() => now) })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
const prepare = async () => { now += 500; await act(async () => { vi.advanceTimersByTime(500) }) }
const walk = async (moves: number[]) => { for (const direction of moves) { now += 100; await act(async () => { fireEvent.keyDown(window,{ key: keys[direction] }) }) } }

describe('C1.1 independent maze practice', () => {
  it('uses a smaller deterministic practice outside every supported formal size', () => {
    const practice = generateMazePracticeV11(context.randomSeed)
    expect(practice).toEqual(generateMazePracticeV11(context.randomSeed))
    expect([practice.cols,practice.rows]).toEqual([3,3])
    for (const [cols,rows] of [[5,5],[7,7],[15,15]]) {
      const formal = generateMaze(context.randomSeed,0,cols,rows)
      expect(practice.walls).not.toEqual(formal.walls)
    }
    expect(path(practice).length).toBe(practice.optimalPathLength)
  })
  it.each([0,1])('does not save training and preserves the exact formal path at trial %i', async trialIndex => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined), onTaskComplete = vi.fn()
    render(<MazeTask taskContext={context} trialIndex={trialIndex} onTrialComplete={onTrialComplete} onTaskComplete={onTaskComplete} />)
    fireEvent.click(screen.getByText('开始练习')); await prepare()
    await walk(path(generateMazePracticeV11(context.randomSeed)))
    expect(screen.getByRole('button',{ name:'开始正式测评' })).toBeInTheDocument()
    expect(onTrialComplete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('开始正式测评')); await prepare()
    const formalPath = path(generateMaze(context.randomSeed,trialIndex,7,7))
    await walk(formalPath)
    expect(onTrialComplete).toHaveBeenCalledExactlyOnceWith({ mazeIndex: trialIndex, moves: formalPath, completionTimeMs: 500 + formalPath.length * 100, completed: true, interrupted: false })
    expect(onTaskComplete).toHaveBeenCalledTimes(trialIndex === 1 ? 1 : 0)
  })
  it('keeps C1.0.1 practice on its original first formal grid', async () => {
    render(<MazeTask taskContext={{...context,engineVersion:'1.0.1',configVersion:'1.0.1'}} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习')); await prepare()
    await walk(path(generateMaze(context.randomSeed,0,7,7)))
    expect(screen.getByRole('button',{ name:'开始正式测评' })).toBeInTheDocument()
  })
})
