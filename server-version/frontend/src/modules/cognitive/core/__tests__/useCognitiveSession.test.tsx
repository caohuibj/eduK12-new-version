import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CognitiveSession } from '../../types'

const { mockScheduler } = vi.hoisted(() => ({
  mockScheduler: {
    register: vi.fn(),
    enqueue: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    pending: vi.fn().mockResolvedValue([]),
    purgeExpired: vi.fn().mockResolvedValue(undefined),
    block: vi.fn(),
  },
}))

vi.mock('../../../../services/persistence/checkpointScheduler', () => ({
  checkpointScheduler: mockScheduler,
  CheckpointTransportError: class CheckpointTransportError extends Error {
    status?: number
    statusCode?: number
    code?: number | string
  },
  checkpointErrorStatus: (error: unknown) => {
    const value = error as { status?: number; statusCode?: number; code?: number }
    return value?.status ?? value?.statusCode ?? (value?.code && value.code >= 400 ? value.code : undefined)
  },
}))

vi.mock('../../../../services/persistence/flushLifecycle', () => ({
  useCheckpointLifecycle: vi.fn(),
}))

import { useCognitiveSession } from '../useCognitiveSession'

const session: CognitiveSession = {
  sessionId: 'cognitive-session-review',
  assignmentId: 'assignment-1',
  testType: 'fake',
  attemptNo: 1,
  status: 'IN_PROGRESS',
  configVersion: '1.0.0',
  engineVersion: '1.0.0',
  scoringVersion: '1.0.0',
  config: { trialCount: 2, trialDurationMs: 1000, allowPractice: false, maxRtMs: 60000 },
  randomSeed: 'seed',
  nextTrialIndex: 0,
}

const api = {
  getSession: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: session }),
  appendTrial: vi.fn(),
  appendTrials: vi.fn(),
  completeSession: vi.fn(),
}

describe('useCognitiveSession checkpoint conflict propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockScheduler.enqueue.mockResolvedValue(undefined)
    mockScheduler.flush.mockResolvedValue(undefined)
    mockScheduler.pending.mockResolvedValue([])
    mockScheduler.purgeExpired.mockResolvedValue(undefined)
    api.getSession.mockResolvedValue({ code: 0, message: 'ok', data: session })
  })

  it('enters recovery and blocks the scope when a background batch reports HTTP 409', async () => {
    const { result } = renderHook(() => useCognitiveSession(session.sessionId, api))

    await waitFor(() => expect(result.current.state.status).toBe('READY'))
    await act(async () => {
      result.current.start()
      await result.current.appendTrial({ correct: true, rtMs: 420 })
    })
    expect(result.current.state.status).toBe('RUNNING')

    const calls = mockScheduler.register.mock.calls
    const registration = calls[calls.length - 1]
    expect(registration).toBeDefined()
    const onError = registration?.[3]?.onError as (error: unknown) => void
    act(() => onError({ status: 409, message: 'trial conflict' }))

    await waitFor(() => expect(result.current.state.status).toBe('RECOVERY_REQUIRED'))
    expect(mockScheduler.block).toHaveBeenCalledWith(
      'cognitive',
      session.sessionId,
      expect.objectContaining({ status: 409 }),
    )
  })
})
