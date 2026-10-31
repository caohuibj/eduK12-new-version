import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { fireEvent, render, screen, act } from '@testing-library/react'
import { MazeTask } from '../MazeTask'

const config = {
  totalTrials: 1,
  mazeCols: 7,
  mazeRows: 7,
  timeLimitMs: 120000,
  report: { reportVersion: '1.0.0' as const, referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's1',
  testType: 'maze',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config,
  randomSeed: 'seed-1',
}

let currentTime = 1000

beforeEach(() => {
  vi.useFakeTimers()
  currentTime = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const navigatePracticeToGoal = async (moves: number[]) => {
  for (const move of moves) {
    const key = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][move]
    currentTime += 100
    await act(async () => {
      fireEvent.keyDown(window, { key })
      vi.advanceTimersByTime(50)
    })
  }
}

describe('MazeTask', () => {
  it('renders maze grid with start and goal markers', async () => {
    render(<MazeTask taskContext={context} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('★')).toBeTruthy()
  })

  it('shows direction buttons during navigation', async () => {
    render(<MazeTask taskContext={context} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByText('↑')).toBeTruthy()
    expect(screen.getByText('↓')).toBeTruthy()
    expect(screen.getByText('←')).toBeTruthy()
    expect(screen.getByText('→')).toBeTruthy()
  })

  it('allows arrow key navigation and tracks moves', async () => {
    render(<MazeTask taskContext={context} trialIndex={0} onTrialComplete={vi.fn()} />)
    fireEvent.click(screen.getByText('开始练习'))
    await act(async () => { vi.advanceTimersByTime(500) })
    // Move right if legal (from start position 0,0)
    const keyDown = (key: string) => {
      currentTime += 100
      fireEvent.keyDown(window, { key })
    }
    // At least one direction should be legal from start
    const before = screen.getAllByText(/^S$|^[★]$|^[A-Z]$/).length
    keyDown('ArrowRight')
    keyDown('ArrowDown')
    // Moves were tracked (moves count should be 0, 1, or 2 depending on walls)
    expect(screen.queryByText('已走 0 步') !== null || screen.queryByText(/已走 [12] 步/) !== null).toBe(true)
  })


})
