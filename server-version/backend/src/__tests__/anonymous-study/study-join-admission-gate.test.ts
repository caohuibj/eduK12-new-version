import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  studyJoinAdmissionGate,
  resetStudyJoinAdmissionGateForTests,
} from '../../modules/anonymous-study/study-join-admission-gate'
import { isTransientStudyDatabaseError } from '../../modules/anonymous-study/routes'
import { BoundedAdmissionBusyError } from '../../services/boundedAdmissionGate'

describe('studyJoinAdmissionGate and transient error resilience (PR1)', () => {
  beforeEach(() => {
    delete process.env.STUDY_JOIN_ADMISSION_MAX_CONCURRENT
    delete process.env.STUDY_JOIN_ADMISSION_MAX_QUEUE
    delete process.env.STUDY_JOIN_ADMISSION_MAX_WAIT_MS
    delete process.env.TRAINING_START_MAX_CONCURRENT
    delete process.env.TRAINING_START_MAX_QUEUE
    delete process.env.TRAINING_START_MAX_WAIT_MS
    resetStudyJoinAdmissionGateForTests()
  })

  describe('configuration and bounds', () => {
    it('uses explicit STUDY_JOIN_ADMISSION_* values when present', () => {
      process.env.STUDY_JOIN_ADMISSION_MAX_CONCURRENT = '12'
      process.env.STUDY_JOIN_ADMISSION_MAX_QUEUE = '40'
      process.env.STUDY_JOIN_ADMISSION_MAX_WAIT_MS = '3000'

      const gate = studyJoinAdmissionGate()
      const stats = gate.getStats()
      expect(stats.options.name).toBe('study_join_admission')
      expect(stats.options.busyCode).toBe('STUDY_JOIN_BUSY')
      expect(stats.options.retryAfterSeconds).toBe(1)
      expect(stats.options.maxConcurrent).toBe(12)
      expect(stats.options.maxQueue).toBe(40)
      expect(stats.options.maxWaitMs).toBe(3000)
    })

    it('falls back to TRAINING_START_* when explicit values are absent', () => {
      process.env.TRAINING_START_MAX_CONCURRENT = '18'
      process.env.TRAINING_START_MAX_QUEUE = '60'
      process.env.TRAINING_START_MAX_WAIT_MS = '4000'

      const gate = studyJoinAdmissionGate()
      const stats = gate.getStats()
      expect(stats.options.name).toBe('study_join_admission')
      expect(stats.options.busyCode).toBe('STUDY_JOIN_BUSY')
      expect(stats.options.retryAfterSeconds).toBe(1)
      expect(stats.options.maxConcurrent).toBe(18)
      expect(stats.options.maxQueue).toBe(60)
      expect(stats.options.maxWaitMs).toBe(4000)
    })
  })

  describe('isTransientStudyDatabaseError', () => {
    it('detects P2024 pool timeout', () => {
      expect(isTransientStudyDatabaseError({ code: 'P2024' })).toBe(true)
    })

    it('detects P2034 write conflict', () => {
      expect(isTransientStudyDatabaseError({ code: 'P2034' })).toBe(true)
    })

    it('detects P2028 rolled back interactive transaction', () => {
      expect(
        isTransientStudyDatabaseError({
          code: 'P2028',
          message: 'Unable to start a transaction in the given time',
        }),
      ).toBe(true)
    })

    it('detects retryable SQL states (40001, 40P01, 55P03)', () => {
      expect(isTransientStudyDatabaseError({ code: '40001' })).toBe(true)
      expect(isTransientStudyDatabaseError({ code: '40P01' })).toBe(true)
      expect(isTransientStudyDatabaseError({ code: '55P03' })).toBe(true)
      expect(isTransientStudyDatabaseError({ meta: { code: '40001' } })).toBe(true)
    })

    it('returns false for permanent or unrelated errors', () => {
      expect(isTransientStudyDatabaseError(null)).toBe(false)
      expect(isTransientStudyDatabaseError(undefined)).toBe(false)
      expect(isTransientStudyDatabaseError({ code: 'P2002' })).toBe(false)
      expect(isTransientStudyDatabaseError({ code: 'P2025' })).toBe(false)
    })
  })

  describe('admission rejection mapping', () => {
    it('throws BoundedAdmissionBusyError with STUDY_JOIN_BUSY code on queue overflow', async () => {
      process.env.STUDY_JOIN_ADMISSION_MAX_CONCURRENT = '1'
      process.env.STUDY_JOIN_ADMISSION_MAX_QUEUE = '0'
      resetStudyJoinAdmissionGateForTests()

      const gate = studyJoinAdmissionGate()

      let releaseFirst: (() => void) | undefined
      const firstBlocked = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })

      const task1 = gate.run(() => firstBlocked)

      await expect(gate.run(async () => 'overflow')).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof BoundedAdmissionBusyError &&
          err.code === 'STUDY_JOIN_BUSY' &&
          err.retryAfterSeconds === 1
        )
      })

      releaseFirst?.()
      await task1
    })
  })
})
