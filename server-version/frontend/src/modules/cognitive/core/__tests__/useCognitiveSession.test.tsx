import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CognitiveSession } from '../../types'
import { createFinalDraftMeta, finalDraftStore, trainingCognitiveDraftKey } from '../../../../services/persistence/finalDraftStore'

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

  it.each([false, true])('accepts a FINAL terminal ACK without exposing an individual result (deferred=%s)', async deferred => {
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
          ...(deferred ? { feedbackDeferred: true } : {}),
        },
      }),
    }

    const { result } = renderHook(() => useCognitiveSession(
      finalSession.sessionId,
      finalApi,
      { aggregateOnly: !deferred },
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
  it.each([true, false])('handles local trial storage failure with scoped fail-closed=%s', async failClosed => {
    const finalSession: CognitiveSession = {...session,sessionId:'storage-failure-'+failClosed,
      deliveryMode:'FINAL_ONLY',definitionHash:'definition-storage',contextSnapshotHash:null,attemptEpoch:1}
    const finalApi={...api,getSession:vi.fn().mockResolvedValue({code:0,message:'ok',data:finalSession}),submitFinal:vi.fn()}
    const {result,unmount}=renderHook(()=>useCognitiveSession(finalSession.sessionId,finalApi,{failClosedOnTrialPersistence:failClosed}))
    await waitFor(()=>expect(result.current.state.status).toBe('READY'))
    const spy=vi.spyOn(finalDraftStore,'putTrial').mockRejectedValueOnce(new Error('IndexedDB quota exceeded'))
    try{
      act(()=>result.current.start())
      await act(async()=>{expect(await result.current.appendTrial({correct:true,rtMs:420})).toBe(false)})
      expect(result.current.state.status).toBe(failClosed?'RECOVERY_REQUIRED':'RUNNING')
      if(failClosed)expect(result.current.state.error?.code).toBe('LOCAL_TRIAL_PERSISTENCE_FAILED')
      expect(result.current.state.trialIndex).toBe(0);expect(finalApi.submitFinal).not.toHaveBeenCalled()
    }finally{spy.mockRestore();unmount();await finalDraftStore.delete('cognitive:'+finalSession.sessionId)}
  })

})


describe('Training retention lease before recovery', () => {
  it('does not ensure or load trials until lease acquisition and holds until unmount', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks')
    let enter: (() => void) | undefined
    let held = false
    const request = vi.fn(async (_name: string, options: LockOptions, callback: (lock: unknown) => Promise<void>) => {
      if (options.mode === 'exclusive') return callback(null)
      await new Promise<void>(resolve => { enter = resolve })
      held = true
      try { await callback({}) } finally { held = false }
    })
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const trainingSession: CognitiveSession = { ...session, sessionId: 'training-lease-session',
      deliveryMode: 'FINAL_ONLY', definitionHash: 'training-definition', attemptEpoch: 1, sessionEpoch: 1,
      trainingPersistence: { snapshotHash: 'policy-hash', attemptId: 'parent-attempt', attemptEpoch: 3,
        courseId: 'course', checkpoint: null,
        localCognitive: { enabled: true, ttlHours: 1 } } }
    const finalApi = { ...api, getSession: vi.fn().mockResolvedValue({ code: 0, data: trainingSession }), submitFinal: vi.fn() }
    const ensure = vi.spyOn(finalDraftStore, 'ensure')
    const key = trainingCognitiveDraftKey({ attemptId: 'parent-attempt', attemptEpoch: 3, sessionId: trainingSession.sessionId, sessionEpoch: 1 })
    try {
      const { result, unmount } = renderHook(() => useCognitiveSession(trainingSession.sessionId, finalApi))
      await waitFor(() => expect(enter).toBeDefined())
      expect(ensure).not.toHaveBeenCalled()
      await act(async () => { enter!() })
      await waitFor(() => expect(result.current.state.status).toBe('READY'))
      expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ draftKey: key, trainingRetention: expect.objectContaining({ attemptEpoch: 3, sessionEpoch: 1 }) }))
      expect(held).toBe(true)
      unmount()
      await waitFor(() => expect(held).toBe(false))
    } finally {
      ensure.mockRestore(); await finalDraftStore.delete(key)
      if (original) Object.defineProperty(navigator, 'locks', original); else Reflect.deleteProperty(navigator, 'locks')
    }
  })
})

describe('Training inactive-age entry', () => {
  it('expires an inactive overdue draft before recovery and never recreates its payload', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks')
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: (lock: unknown) => Promise<void>) => callback({}))
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
    const now = Date.now()
    const trainingSession: CognitiveSession = { ...session, sessionId: 'training-inactive-expired',
      deliveryMode: 'FINAL_ONLY', definitionHash: 'definition', attemptEpoch: 1, sessionEpoch: 1,
      trainingPersistence: { snapshotHash: 'policy', attemptId: 'inactive-parent', attemptEpoch: 1,
        courseId: 'course', checkpoint: null, localCognitive: { enabled: true, ttlHours: 1 } } }
    const retention = { schemaVersion: 1 as const, snapshotHash: 'policy', attemptId: 'inactive-parent', attemptEpoch: 1,
      sessionId: trainingSession.sessionId, sessionEpoch: 1, ttlHours: 1, lastWriteAt: now }
    const key = trainingCognitiveDraftKey(retention)
    await finalDraftStore.ensure(createFinalDraftMeta({ draftKey: key, instrument: 'cognitive', attemptId: trainingSession.sessionId,
      attemptEpoch: 1, definitionHash: 'definition', contextSnapshotHash: null, deliveryMode: 'final_only', submissionId: 'old', trainingRetention: retention }))
    await finalDraftStore.putTrial({ draftKey: key, trialIndex: 0, payload: 'old-response', createdAt: now })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 3600001)
    try {
      const finalApi = { ...api, getSession: vi.fn().mockResolvedValue({ code: 0, data: trainingSession }), submitFinal: vi.fn() }
      const { result, unmount } = renderHook(() => useCognitiveSession(trainingSession.sessionId, finalApi))
      await waitFor(() => expect(result.current.state.status).toBe('ERROR'))
      expect((await finalDraftStore.get(key))?.trainingRetention?.expiredAt).toBe(now + 3600001)
      expect(await finalDraftStore.listTrials(key)).toEqual([])
      expect(finalApi.submitFinal).not.toHaveBeenCalled()
      expect(request.mock.calls[0][1]).toMatchObject({ mode: 'exclusive', ifAvailable: true })
      unmount()
    } finally {
      clock.mockRestore()
      if (original) Object.defineProperty(navigator, 'locks', original); else Reflect.deleteProperty(navigator, 'locks')
    }
  })
})
