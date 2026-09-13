import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COGNITIVE_SOFTWARE_TIMING_POLICY_V1 } from '../../../core/timing'
import { ReactionTask } from '../ReactionTask'
import { deterministicForeperiod } from '../prng'

const config = {
  totalTrials: 20,
  foreperiodMinMs: 700,
  foreperiodMaxMs: 1500,
  timeoutMs: 2000,
  readyDurationMs: 1000,
  timingPolicyVersion: COGNITIVE_SOFTWARE_TIMING_POLICY_V1,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

const context = {
  sessionId: 's-fe07b',
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.1.0',
  configVersion: '1.1.0',
  attemptNo: 1,
  config,
  randomSeed: 'seed-fe07b',
}

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

const flushAnimationFrame = (framePerfMs: number) => {
  const callbacks = Array.from(frameCallbacks.values())
  frameCallbacks.clear()
  act(() => {
    callbacks.forEach((callback) => callback(framePerfMs))
  })
}

const enterFormal = async () => {
  const onTrialComplete = vi.fn().mockResolvedValue(undefined)
  render(<ReactionTask taskContext={context} trialIndex={0} onTrialComplete={onTrialComplete} />)
  fireEvent.click(screen.getByText('开始练习'))

  for (let index = 0; index < 3; index += 1) {
    act(() => vi.advanceTimersByTime(1000))
    now += 250
    fireEvent.click(screen.getByLabelText(`practice trial ${index}`))
    await act(async () => {})
    fireEvent.click(screen.getByText(index === 2 ? '开始正式测评' : '下一个'))
    await act(async () => {})
  }

  return onTrialComplete
}

describe('FE-07B Reaction software-frame-v1 onset', () => {
  it('does not expose formal green until the post-foreperiod animation frame and uses that frame timestamp as onset', async () => {
    const onTrialComplete = await enterFormal()

    act(() => vi.advanceTimersByTime(1000))
    act(() => vi.advanceTimersByTime(deterministicForeperiod('seed-fe07b', 0, 700, 1500)))

    expect(screen.getByText('等待…')).toBeTruthy()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    flushAnimationFrame(2000)
    expect(screen.getByText('点击！')).toBeTruthy()

    now = 2320
    fireEvent.click(screen.getByLabelText('trial 0'))
    await act(async () => {})

    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0]).toEqual({
      foreperiodMs: deterministicForeperiod('seed-fe07b', 0, 700, 1500),
      rtMs: 320,
      prematureCount: 0,
      interrupted: false,
      inputMode: 'pointer',
    })
  })
})
