import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ReactionTask } from '../ReactionTask'
import { deterministicForeperiod } from '../prng'

/**
 * ReactionTask 组件测试（Milestone E §37）。
 *
 * 约定：
 *  - fake timers 驱动 ready→green→timeout 时序；
 *  - performance.now 用可控的 `now` stub，保证 RT 断言确定性；
 *  - 断言 payload 只含 raw trial 字段（无 score/valid/hash）。
 */

const config = {
  totalTrials: 20,
  foreperiodMinMs: 700,
  foreperiodMaxMs: 1500,
  timeoutMs: 2000,
  readyDurationMs: 1000,
  validRtFloorMs: 100,
  report: { reportVersion: '1.0.0', referenceMode: 'simulated' as const },
}

const makeContext = (trialIndex = 0, seed = 'seed-123') => ({
  sessionId: 's1',
  testType: 'reaction',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  configVersion: '1.0.0',
  attemptNo: 1,
  config,
  randomSeed: seed,
})

const PRACTICE_TRIALS = 3

let now = 0

beforeEach(() => {
  vi.useFakeTimers()
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** 走完 instruction + 3 次 practice，进入 formal（trial 0 的 ready 阶段）。 */
async function enterFormal(
  onTrialComplete: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
  trialIndex = 0,
  seed = 'seed-123'
) {
  render(
    <ReactionTask taskContext={makeContext(trialIndex, seed)} trialIndex={trialIndex} onTrialComplete={onTrialComplete} />
  )
  fireEvent.click(screen.getByText('开始练习'))
  for (let i = 0; i < PRACTICE_TRIALS; i++) {
    act(() => {
      vi.advanceTimersByTime(1000) // ready -> green
    })
    now = 500 // 保证 practice 响应非过早（rt >= 150）
    fireEvent.click(screen.getByLabelText(`practice trial ${i}`))
    await act(async () => {})
    fireEvent.click(screen.getByText(i === PRACTICE_TRIALS - 1 ? '开始正式测评' : '下一个'))
    await act(async () => {})
  }
  return onTrialComplete
}

describe('deterministicForeperiod (§29 seeded foreperiod)', () => {
  it('is deterministic per (seed, trialIndex) and within range', () => {
    const a = deterministicForeperiod('seed-123', 0, 700, 1500)
    const b = deterministicForeperiod('seed-123', 0, 700, 1500)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(700)
    expect(a).toBeLessThanOrEqual(1500)
  })

  it('varies across trialIndex', () => {
    const vals = new Set(Array.from({ length: 10 }, (_, i) => deterministicForeperiod('seed-123', i, 700, 1500)))
    expect(vals.size).toBeGreaterThan(1)
  })
})

describe('ReactionTask — instruction & practice', () => {
  it('shows instruction first; practice does NOT persist (no onTrialComplete)', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    render(<ReactionTask taskContext={makeContext()} trialIndex={0} onTrialComplete={onTrialComplete} />)
    expect(screen.getByText('反应速度')).toBeTruthy()
    fireEvent.click(screen.getByText('开始练习'))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    now = 500
    fireEvent.click(screen.getByLabelText('practice trial 0'))
    await act(async () => {})
    expect(onTrialComplete).not.toHaveBeenCalled()
  })

  it('enters formal after 3 practice trials', async () => {
    await enterFormal()
    expect(screen.getByText(/试次 1 \/ 20/)).toBeTruthy()
  })
})

describe('ReactionTask — formal trial', () => {
  it('submits raw payload: seeded foreperiod in range, performance.now RT, pointer', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)

    act(() => {
      vi.advanceTimersByTime(1000) // ready -> green
    })
    now += 320
    fireEvent.click(screen.getByLabelText('trial 0'))
    await act(async () => {})

    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    const payload = onTrialComplete.mock.calls[0][0] as Record<string, unknown>
    expect(payload.foreperiodMs).toBeGreaterThanOrEqual(700)
    expect(payload.foreperiodMs).toBeLessThanOrEqual(1500)
    expect(payload.foreperiodMs).toBe(deterministicForeperiod('seed-123', 0, 700, 1500))
    expect(payload.rtMs).toBe(320)
    expect(payload.prematureCount).toBe(0)
    expect(payload.interrupted).toBe(false)
    expect(payload.inputMode).toBe('pointer')
    // 只提交 raw facts（§32：不提交 valid/score/hash）
    expect(Object.keys(payload).sort()).toEqual(['foreperiodMs', 'inputMode', 'interrupted', 'prematureCount', 'rtMs'])
  })

  it('premature response: does not advance trialIndex, re-enters ready, restarts ready timer (§31)', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)

    act(() => {
      vi.advanceTimersByTime(600) // 仍在 ready
    })
    fireEvent.click(screen.getByLabelText('trial 0')) // 过早响应
    expect(onTrialComplete).not.toHaveBeenCalled()

    // t=1100：若未重启 timer，此刻早该 green；重启后仍在准备
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByText('准备…')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(600) // 重启后的 timer 触发 → green
    })
    expect(screen.getByText('点击！')).toBeTruthy()

    now += 250
    fireEvent.click(screen.getByLabelText('trial 0'))
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0].prematureCount).toBe(1)
  })

  it('timeout → rtMs null (miss)', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)

    act(() => {
      vi.advanceTimersByTime(1000) // green
    })
    act(() => {
      vi.advanceTimersByTime(2000) // timeout
    })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0].rtMs).toBeNull()
  })

  it('double response during pending submit is ignored', async () => {
    let release!: () => void
    const onTrialComplete = vi.fn(
      () =>
        new Promise<void>((r) => {
          release = r
        })
    )
    await enterFormal(onTrialComplete)

    act(() => {
      vi.advanceTimersByTime(1000) // green
    })
    now += 200
    fireEvent.click(screen.getByLabelText('trial 0'))
    fireEvent.click(screen.getByLabelText('trial 0')) // 提交未完成时第二次点击
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    release()
    await act(async () => {})
  })

  it('visibility interruption → interrupted=true (§22)', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)

    act(() => {
      vi.advanceTimersByTime(1000) // green
    })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    fireEvent(document, new Event('visibilitychange'))
    now += 200
    fireEvent.click(screen.getByLabelText('trial 0'))
    await act(async () => {})
    expect(onTrialComplete.mock.calls[0][0].interrupted).toBe(true)
  })

  it('keyboard response → inputMode keyboard', async () => {
    const onTrialComplete = vi.fn().mockResolvedValue(undefined)
    await enterFormal(onTrialComplete)

    act(() => {
      vi.advanceTimersByTime(1000) // green
    })
    now += 200
    fireEvent.keyDown(window, { key: ' ' })
    await act(async () => {})
    expect(onTrialComplete).toHaveBeenCalledTimes(1)
    expect(onTrialComplete.mock.calls[0][0].inputMode).toBe('keyboard')
  })
})
