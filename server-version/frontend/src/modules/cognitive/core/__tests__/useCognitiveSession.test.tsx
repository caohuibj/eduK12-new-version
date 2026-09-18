import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CognitiveSession } from '../../types'
import { createFinalDraftMeta, finalDraftStore } from '../../../../services/persistence/finalDraftStore'

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

  it('does not abort FINAL when provenance metadata storage fails', async () => {
    const finalSession: CognitiveSession = {
      ...session,
      sessionId: 'cognitive-session-final-provenance',
      deliveryMode: 'FINAL_ONLY',
      definitionHash: 'definition-1',
      contextSnapshotHash: null,
      attemptEpoch: 1,
    }
    const finalApi = {
      ...api,
      getSession: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: finalSession }),
      submitFinal: vi.fn().mockResolvedValue({
        code: 0,
        message: 'ok',
        data: {
          result: {
            metrics: {},
            quality: { state: 'interpretable', flags: {}, reasons: [] },
            qualityFlags: {},
            report: {},
            assessmentContext: null,
          },
        },
      }),
    }
    const metadataSpy = vi.spyOn(finalDraftStore, 'setInstrumentMetadata')
      .mockRejectedValue(new Error('IndexedDB quota exceeded'))

    try {
      const { result } = renderHook(() => useCognitiveSession(finalSession.sessionId, finalApi))

      await waitFor(() => expect(result.current.state.status).toBe('READY'))
      await act(async () => {
        result.current.start()
        await result.current.appendTrial({ correct: true, rtMs: 420 })
        await result.current.complete({
          schemaVersion: 1,
          deviceClass: 'PHONE',
          administrationMode: 'TOUCH',
        })
      })

      await waitFor(() => expect(result.current.state.status).toBe('COMPLETED'))
      expect(finalApi.submitFinal).toHaveBeenCalledWith(
        finalSession.sessionId,
        expect.objectContaining({
          administrationProvenance: {
            schemaVersion: 1,
            deviceClass: 'PHONE',
            administrationMode: 'TOUCH',
          },
        }),
      )
    } finally {
      metadataSpy.mockRestore()
    }
  })

  it('accepts a relational aggregate-only FINAL terminal ACK without exposing an individual result', async () => {
    const finalSession: CognitiveSession = {
      ...session,
      sessionId: 'cognitive-session-relational-aggregate',
      deliveryMode: 'FINAL_ONLY',
      definitionHash: 'definition-relational',
      contextSnapshotHash: null,
      attemptEpoch: 1,
    }
    const finalApi = {
      ...api,
      getSession: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: finalSession }),
      submitFinal: vi.fn().mockResolvedValue({
        code: 0,
        message: 'ok',
        data: {
          submissionId: 'relational-submit-1',
          payloadHash: 'relational-payload-1',
          replayed: false,
          completed: true,
        },
      }),
    }

    const { result } = renderHook(() => useCognitiveSession(
      finalSession.sessionId,
      finalApi,
      { aggregateOnly: true },
    ))

    await waitFor(() => expect(result.current.state.status).toBe('READY'))
    await act(async () => {
      result.current.start()
      await result.current.appendTrial({ correct: true, rtMs: 420 })
      await result.current.complete()
    })

    await waitFor(() => expect(result.current.state.status).toBe('COMPLETED'))
    expect(result.current.state.result).toBeNull()
    expect(finalApi.submitFinal).toHaveBeenCalledTimes(1)
  })

  it('replays an existing sealed FINAL after refresh and never remounts the task', async () => {
    const finalSession: CognitiveSession = {
      ...session,
      sessionId: 'cognitive-session-sealed-recovery',
      deliveryMode: 'FINAL_ONLY',
      definitionHash: 'definition-1',
      contextSnapshotHash: null,
      attemptEpoch: 1,
    }
    const completedSession: CognitiveSession = {
      ...finalSession,
      status: 'COMPLETED',
      result: {
        metrics: {},
        qualityFlags: {},
        report: {},
        assessmentContext: null,
      },
    }
    const draftKey = `cognitive:${finalSession.sessionId}`
    await finalDraftStore.ensure(createFinalDraftMeta({
      draftKey,
      instrument: 'cognitive',
      attemptId: finalSession.sessionId,
      attemptEpoch: 1,
      definitionHash: 'definition-1',
      contextSnapshotHash: null,
      deliveryMode: 'final_only',
      submissionId: 'sealed-submission-id',
    }))
    await finalDraftStore.putTrial({
      draftKey,
      trialIndex: 0,
      payload: { correct: true, rtMs: 420 },
      createdAt: Date.now(),
    })
    const sealed = await finalDraftStore.sealForSubmission(draftKey, (snapshot) => ({
      submissionId: snapshot.meta.submissionId,
      attemptEpoch: snapshot.meta.attemptEpoch,
      definitionHash: snapshot.meta.definitionHash,
      contextSnapshotHash: snapshot.meta.contextSnapshotHash,
      trials: snapshot.trials.map((trial) => trial.payload),
    }))
    const finalApi = {
      ...api,
      getSession: vi.fn()
        .mockResolvedValueOnce({ code: 0, message: 'ok', data: finalSession })
        .mockResolvedValueOnce({ code: 0, message: 'ok', data: completedSession }),
      submitFinal: vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: { accepted: true } }),
    }

    const { result } = renderHook(() => useCognitiveSession(finalSession.sessionId, finalApi))

    await waitFor(() => expect(result.current.state.status).toBe('COMPLETED'))
    expect(finalApi.submitFinal).toHaveBeenCalledTimes(1)
    expect(finalApi.submitFinal).toHaveBeenCalledWith(finalSession.sessionId, sealed?.payload)
    expect(finalApi.getSession).toHaveBeenCalledTimes(2)
    expect(mockScheduler.register).not.toHaveBeenCalled()
    expect(await finalDraftStore.get(draftKey)).toBeNull()
  })
})
