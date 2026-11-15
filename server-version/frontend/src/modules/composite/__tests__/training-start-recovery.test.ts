import { describe, expect, it, vi } from 'vitest'
import { startTrainingWithRecovery } from '../training-start-recovery'
import { TrainingRetryCancelledError, TrainingRetryTimeoutError } from '../../../services/trainingBusyRetry'

const networkFailure = () => Object.assign(new Error('network failed'), { name: 'AxiosError', retryable: true })
const response = (id: string, freshlyCreated = true) => ({
  code: 0,
  message: 'ok',
  data: { attempt: { id, status: 'IN_PROGRESS' }, recoveryToken: null, freshlyCreated },
})
const available = (attempt: unknown, canStartNewAttempt = false) => ({
  code: 0,
  message: 'ok',
  data: {
    list: [{
      id: 'questionnaire',
      attempt,
      canStartNewAttempt,
      canContinue: Boolean(attempt && typeof attempt === 'object' && 'status' in attempt && attempt.status === 'IN_PROGRESS'),
    }],
  },
})
const options = { random: () => 0, sleep: async () => {} }

describe('authenticated training START recovery', () => {
  it('honors explicit busy responses without looking up or duplicating an attempt', async () => {
    const start = vi.fn().mockRejectedValueOnce({ status: 503, code: 'INSTRUMENT_NOT_AVAILABLE', retryAfterMs: 10_000 }).mockResolvedValue(response('a1'))
    const listAvailable = vi.fn()
    const sleep = vi.fn(async () => {})
    const result = await startTrainingWithRecovery({ assessmentId: 'questionnaire', start, listAvailable, getAttempt: vi.fn() } as any, { random: () => 0.5, sleep })
    expect(result.source).toBe('start-response')
    expect(result.response.data.attempt.id).toBe('a1')
    expect(start).toHaveBeenCalledTimes(2)
    expect(listAvailable).not.toHaveBeenCalled()
    expect(sleep).toHaveBeenCalledWith(12_000, undefined)
  })

  it('recovers an in-progress attempt after a lost response without another START and tags recovered source', async () => {
    const start = vi.fn().mockRejectedValue(networkFailure())
    const listAvailable = vi.fn().mockResolvedValue(available({ id: 'a1', status: 'IN_PROGRESS' }))
    const getAttempt = vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: { id: 'a1', status: 'IN_PROGRESS' } })
    const result = await startTrainingWithRecovery({ assessmentId: 'questionnaire', start, listAvailable, getAttempt } as any, options)
    expect(result.source).toBe('recovered-existing')
    expect(result.response.data.freshlyCreated).toBe(false)
    expect(result.response.data.attempt.id).toBe('a1')
    expect(start).toHaveBeenCalledOnce()
    expect(getAttempt).toHaveBeenCalledWith('a1', expect.any(AbortSignal))
  })

  it('recovers an in-progress attempt after START request timeout without issuing another START', async () => {
    const start = vi.fn().mockRejectedValue(new TrainingRetryTimeoutError())
    const listAvailable = vi.fn().mockResolvedValue(available({ id: 'a-timeout', status: 'IN_PROGRESS' }))
    const getAttempt = vi.fn().mockResolvedValue({ code: 0, message: 'ok', data: { id: 'a-timeout', status: 'IN_PROGRESS' } })
    const result = await startTrainingWithRecovery({ assessmentId: 'questionnaire', start, listAvailable, getAttempt } as any, options)
    expect(result.source).toBe('recovered-existing')
    expect(result.response.data.freshlyCreated).toBe(false)
    expect(result.response.data.attempt.id).toBe('a-timeout')
    expect(start).toHaveBeenCalledOnce()
    expect(listAvailable).toHaveBeenCalledWith(expect.any(AbortSignal))
    expect(getAttempt).toHaveBeenCalledWith('a-timeout', expect.any(AbortSignal))
  })

  it('retries a lost response only after a successful read establishes that a new start is allowed', async () => {
    const start = vi.fn().mockRejectedValueOnce(networkFailure()).mockResolvedValue(response('a2', true))
    const listAvailable = vi.fn().mockResolvedValue(available(null, true))
    const result = await startTrainingWithRecovery({ assessmentId: 'questionnaire', start, listAvailable, getAttempt: vi.fn() } as any, options)
    expect(result.source).toBe('start-response')
    expect(result.response.data.freshlyCreated).toBe(true)
    expect(result.response.data.attempt.id).toBe('a2')
    expect(start).toHaveBeenCalledTimes(2)
    expect(listAvailable).toHaveBeenCalledOnce()
  })

  it.each([
    ['read failure', () => Promise.reject(new Error('unavailable'))],
    ['missing questionnaire', () => Promise.resolve({ code: 0, message: 'ok', data: { list: [] } })],
    ['completed attempt', () => Promise.resolve(available({ id: 'old', status: 'COMPLETED' }))],
    ['paused attempt', () => Promise.resolve({ code: 0, message: 'ok', data: { list: [{ id: 'questionnaire', attempt: { id: 'paused', status: 'IN_PROGRESS' }, canContinue: false }] } })],
    ['unknown attempt state', () => Promise.resolve({ code: 0, message: 'ok', data: { list: [{ id: 'questionnaire' }] } })],
  ])('does not replay START after %s', async (_label, read) => {
    const error = networkFailure()
    const start = vi.fn().mockRejectedValue(error)
    await expect(startTrainingWithRecovery({ assessmentId: 'questionnaire', start, listAvailable: read, getAttempt: vi.fn() } as any, options)).rejects.toBe(error)
    expect(start).toHaveBeenCalledOnce()
  })

  it('does not retry unknown 503 or a rate-limit response', async () => {
    for (const error of [{ status: 503, code: -1 }, { status: 429, code: 'ASSESSMENT_START_BUSY' }]) {
      const start = vi.fn().mockRejectedValue(error)
      const listAvailable = vi.fn()
      await expect(startTrainingWithRecovery({ assessmentId: 'questionnaire', start, listAvailable, getAttempt: vi.fn() } as any, options)).rejects.toBe(error)
      expect(start).toHaveBeenCalledOnce()
      expect(listAvailable).not.toHaveBeenCalled()
    }
  })

  it('stops recovery immediately when aborted by the caller signal', async () => {
    const controller = new AbortController()
    const start = vi.fn(() => {
      controller.abort()
      return Promise.reject(networkFailure())
    })
    const listAvailable = vi.fn()
    await expect(
      startTrainingWithRecovery({ assessmentId: 'questionnaire', start, listAvailable, getAttempt: vi.fn() } as any, { ...options, signal: controller.signal }),
    ).rejects.toBeInstanceOf(TrainingRetryCancelledError)
    expect(start).toHaveBeenCalledOnce()
    expect(listAvailable).not.toHaveBeenCalled()
  })
})
