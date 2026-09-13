import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRunner } from '../registry'

let nextFrameId = 1
let frameCallbacks: Map<number, FrameRequestCallback>

beforeEach(() => {
  vi.useFakeTimers()
  nextFrameId = 1
  frameCallbacks = new Map()
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = nextFrameId
    nextFrameId += 1
    frameCallbacks.set(id, callback)
    return id
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
    frameCallbacks.delete(id)
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const flushFrame = (framePerfMs: number) => {
  const callbacks = Array.from(frameCallbacks.values())
  frameCallbacks.clear()
  act(() => callbacks.forEach((callback) => callback(framePerfMs)))
}

const baseContext = {
  sessionId: 's-fe07b-frame',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  randomSeed: 'seed-1',
}

const requireRunner = (testType: string) => {
  const Runner = resolveRunner(testType, '1.0.0')?.RunnerComponent
  if (!Runner) throw new Error(`missing runner for ${testType}/1.0.0`)
  return Runner
}

describe('FE-07B Go/No-Go and CPT frame timing routing', () => {
  it('keeps frozen Go/No-Go configs on the legacy path by default', () => {
    const Runner = requireRunner('gonogo')
    render(
      <Runner
        taskContext={{
          ...baseContext,
          testType: 'gonogo',
          config: { totalTrials: 8, nogoRatio: 0.25, stimulusMs: 50, isiMs: 20, validRtFloorMs: 100 },
        }}
        trialIndex={0}
        onTrialComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('开始练习'))
    act(() => vi.advanceTimersByTime(20))

    expect(screen.getByLabelText('respond').className).toContain('bg-green-500')
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('waits for the animation frame for the Go/No-Go timing-pilot config', () => {
    const Runner = requireRunner('gonogo')
    render(
      <Runner
        taskContext={{
          ...baseContext,
          configVersion: '1.1.0',
          testType: 'gonogo',
          config: {
            totalTrials: 8,
            nogoRatio: 0.25,
            stimulusMs: 50,
            isiMs: 20,
            validRtFloorMs: 100,
          },
        }}
        trialIndex={0}
        onTrialComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('开始练习'))
    act(() => vi.advanceTimersByTime(20))
    expect(screen.getByLabelText('respond').className).toContain('bg-gray-200')
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    flushFrame(100)
    expect(screen.getByLabelText('respond').className).toContain('bg-green-500')
    act(() => vi.advanceTimersByTime(49))
    expect(screen.getByLabelText('respond').className).toContain('bg-green-500')
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByLabelText('respond').className).toContain('bg-gray-200')
  })

  it('waits for the animation frame for the CPT timing-pilot config', () => {
    const Runner = requireRunner('cpt')
    render(
      <Runner
        taskContext={{
          ...baseContext,
          configVersion: '1.1.0',
          testType: 'cpt',
          config: {
            totalTrials: 12,
            targetRatio: 0.25,
            blockCount: 1,
            stimulusMs: 50,
            isiMs: 20,
          },
        }}
        trialIndex={0}
        onTrialComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('开始练习'))
    act(() => vi.advanceTimersByTime(20))
    expect(screen.queryByText('X')).toBeNull()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    flushFrame(200)
    expect(screen.getByText('X')).toBeTruthy()
    act(() => vi.advanceTimersByTime(49))
    expect(screen.getByText('X')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('X')).toBeNull()
  })
})
