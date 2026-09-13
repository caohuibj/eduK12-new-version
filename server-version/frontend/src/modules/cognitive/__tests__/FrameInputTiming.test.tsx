import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRunner } from '../registry'
import { deterministicForeperiod } from '../tasks/reaction/prng'

let now = 0
let nextFrameId = 1
let frameCallbacks: Map<number, FrameRequestCallback>

beforeEach(() => {
  vi.useFakeTimers()
  now = 0
  nextFrameId = 1
  frameCallbacks = new Map()
  vi.spyOn(performance, 'now').mockImplementation(() => now)
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const flushFrame = (framePerfMs: number) => {
  now = framePerfMs
  const callbacks = Array.from(frameCallbacks.values())
  frameCallbacks.clear()
  act(() => callbacks.forEach((callback) => callback(framePerfMs)))
}

const dispatchPointer = (
  element: Element,
  input: { timeStamp: number; pointerType?: string; isPrimary?: boolean; button?: number },
) => {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    timeStamp: { configurable: true, value: input.timeStamp },
    pointerType: { configurable: true, value: input.pointerType ?? 'touch' },
    isPrimary: { configurable: true, value: input.isPrimary ?? true },
    button: { configurable: true, value: input.button ?? 0 },
  })
  fireEvent(element, event)
}

const dispatchKey = (input: { timeStamp: number; repeat?: boolean; key?: string }) => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: input.key ?? ' ',
    repeat: input.repeat ?? false,
  })
  Object.defineProperty(event, 'timeStamp', { configurable: true, value: input.timeStamp })
  fireEvent(window, event)
}

const requireRunner = (testType: string) => {
  const Runner = resolveRunner(testType, '1.0.0')?.RunnerComponent
  if (!Runner) throw new Error(`missing runner for ${testType}/1.0.0`)
  return Runner
}

const enterReactionFormal = async (onTrialComplete: ReturnType<typeof vi.fn>) => {
  const Runner = requireRunner('reaction')
  const config = {
    totalTrials: 20,
    foreperiodMinMs: 700,
    foreperiodMaxMs: 1500,
    timeoutMs: 2000,
    readyDurationMs: 1000,
    report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
  }
  render(
    <Runner
      taskContext={{
        sessionId: 'reaction-frame',
        testType: 'reaction',
        engineVersion: '1.0.0',
        scoringVersion: '1.1.0',
        configVersion: '1.2.0',
        attemptNo: 1,
        config,
        randomSeed: 'seed-frame-input',
      }}
      trialIndex={0}
      onTrialComplete={onTrialComplete}
    />,
  )
  fireEvent.click(screen.getByText('开始练习'))
  for (let index = 0; index < 3; index += 1) {
    act(() => vi.advanceTimersByTime(1000))
    now += 250
    fireEvent.click(screen.getByLabelText(`practice trial ${index}`))
    await act(async () => {})
    fireEvent.click(screen.getByText(index === 2 ? '开始正式测评' : '下一个'))
    await act(async () => {})
  }
  act(() => vi.advanceTimersByTime(1000))
  act(() => vi.advanceTimersByTime(deterministicForeperiod('seed-frame-input', 0, 700, 1500)))
  flushFrame(2000)
}

describe('FE-07B direct input timestamps', () => {
  it('uses primary touch pointerdown timestamp for Reaction RT and provenance', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterReactionFormal(onTrialComplete)

    now = 2325
    dispatchPointer(screen.getByLabelText('trial 0'), { timeStamp: 2300, pointerType: 'touch' })
    await act(async () => {})

    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({
      rtMs: 300,
      inputMode: 'touch',
      interrupted: false,
    })
  })

  it('ignores keyboard repeat and uses the first non-repeat key timestamp for Reaction RT', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterReactionFormal(onTrialComplete)

    now = 2225
    dispatchKey({ timeStamp: 2200, repeat: true })
    expect(onTrialComplete).not.toHaveBeenCalled()

    now = 2275
    dispatchKey({ timeStamp: 2250 })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({ rtMs: 250, inputMode: 'keyboard' })
  })

  it('rejects an epoch-like Reaction event timestamp, falls back to monotonic now, and marks interruption', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterReactionFormal(onTrialComplete)

    now = 2400
    dispatchPointer(screen.getByLabelText('trial 0'), {
      timeStamp: performance.timeOrigin + 2400,
      pointerType: 'mouse',
      button: 0,
    })
    await act(async () => {})

    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toMatchObject({
      rtMs: 400,
      inputMode: 'pointer',
      interrupted: true,
    })
  })

  it('uses CPT keydown event timestamp and ignores repeat without changing payload shape', async () => {
    const Runner = requireRunner('cpt')
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(
      <Runner
        taskContext={{
          sessionId: 'cpt-frame',
          testType: 'cpt',
          engineVersion: '1.0.0',
          scoringVersion: '1.0.0',
          configVersion: '1.1.0',
          attemptNo: 1,
          randomSeed: 'seed-1',
          config: {
            totalTrials: 12,
            targetRatio: 0.25,
            blockCount: 1,
            stimulusMs: 500,
            isiMs: 20,
          },
        }}
        trialIndex={0}
        onTrialComplete={onTrialComplete}
      />,
    )

    fireEvent.click(screen.getByText('开始练习'))
    for (let index = 0; index < 4; index += 1) {
      act(() => vi.advanceTimersByTime(20))
      flushFrame(1000 + index * 1000)
      if (index % 2 === 0) {
        now += 200
        const practiceRoot = screen.getByRole('button')
        const event = new KeyboardEvent('keydown', { bubbles: true, key: ' ', repeat: false })
        Object.defineProperty(event, 'timeStamp', { configurable: true, value: now - 25 })
        fireEvent(practiceRoot, event)
      }
      act(() => vi.advanceTimersByTime(500 + 600))
    }

    const startFormal = screen.getByText('开始正式测验')
    fireEvent.click(startFormal)
    act(() => vi.advanceTimersByTime(20))
    flushFrame(6000)

    const root = screen.getByRole('button')
    const repeated = new KeyboardEvent('keydown', { bubbles: true, key: ' ', repeat: true })
    Object.defineProperty(repeated, 'timeStamp', { configurable: true, value: 6200 })
    now = 6220
    fireEvent(root, repeated)
    expect(onTrialComplete).not.toHaveBeenCalled()

    const accepted = new KeyboardEvent('keydown', { bubbles: true, key: ' ', repeat: false })
    Object.defineProperty(accepted, 'timeStamp', { configurable: true, value: 6250 })
    now = 6270
    fireEvent(root, accepted)
    await act(async () => {})

    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(Object.keys(onTrialComplete.mock.calls[0][0]).sort()).toEqual([
      'blockIndex', 'interrupted', 'isTarget', 'responded', 'rtMs', 'stimulus',
    ])
    expect(onTrialComplete.mock.calls[0][0].rtMs).toBe(250)
  })
})
