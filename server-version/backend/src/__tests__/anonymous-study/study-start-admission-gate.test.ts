import { describe, it, expect, beforeEach } from 'vitest'
import {
  anonymousStartAdmissionGate,
  resetAnonymousStartAdmissionGateForTests,
} from '../../modules/anonymous-study/study-start-admission-gate'
import {
  AssessmentStartBusyError,
  rethrowGateBusyAsStartBusy,
} from '../../modules/composite/start-transient'
import { BoundedAdmissionBusyError } from '../../services/boundedAdmissionGate'

describe('anonymousStartAdmissionGate (anonymous START admission)', () => {
  beforeEach(() => {
    delete process.env.ANONYMOUS_START_MAX_CONCURRENT
    delete process.env.ANONYMOUS_START_MAX_QUEUE
    delete process.env.ANONYMOUS_START_MAX_WAIT_MS
    delete process.env.TRAINING_START_MAX_CONCURRENT
    delete process.env.TRAINING_START_MAX_QUEUE
    delete process.env.TRAINING_START_MAX_WAIT_MS
    resetAnonymousStartAdmissionGateForTests()
  })

  describe('configuration and bounds', () => {
    it('uses explicit ANONYMOUS_START_* values when present', () => {
      process.env.ANONYMOUS_START_MAX_CONCURRENT = '12'
      process.env.ANONYMOUS_START_MAX_QUEUE = '40'
      process.env.ANONYMOUS_START_MAX_WAIT_MS = '3000'

      const gate = anonymousStartAdmissionGate()
      const stats = gate.getStats()
      expect(stats.options.name).toBe('anonymous_start_admission')
      expect(stats.options.busyCode).toBe('ASSESSMENT_START_BUSY')
      expect(stats.options.retryAfterSeconds).toBe(1)
      expect(stats.options.maxConcurrent).toBe(12)
      expect(stats.options.maxQueue).toBe(40)
      expect(stats.options.maxWaitMs).toBe(3000)
    })

    it('falls back to TRAINING_START_* with no cap (same transaction cost as Training START)', () => {
      process.env.TRAINING_START_MAX_CONCURRENT = '18'
      process.env.TRAINING_START_MAX_QUEUE = '60'
      process.env.TRAINING_START_MAX_WAIT_MS = '4000'

      const gate = anonymousStartAdmissionGate()
      const stats = gate.getStats()
      expect(stats.options.name).toBe('anonymous_start_admission')
      expect(stats.options.busyCode).toBe('ASSESSMENT_START_BUSY')
      expect(stats.options.retryAfterSeconds).toBe(1)
      expect(stats.options.maxConcurrent).toBe(18)
      expect(stats.options.maxQueue).toBe(60)
      expect(stats.options.maxWaitMs).toBe(4000)
    })

    it('supports explicit maxQueue=0 without falling back to default', () => {
      process.env.ANONYMOUS_START_MAX_QUEUE = '0'
      const gate = anonymousStartAdmissionGate()
      expect(gate.getStats().options.maxQueue).toBe(0)
    })
  })

  describe('admission rejection mapping', () => {
    it('throws BoundedAdmissionBusyError with ASSESSMENT_START_BUSY code on queue overflow', async () => {
      process.env.ANONYMOUS_START_MAX_CONCURRENT = '1'
      process.env.ANONYMOUS_START_MAX_QUEUE = '0'
      resetAnonymousStartAdmissionGateForTests()

      const gate = anonymousStartAdmissionGate()

      let releaseFirst: (() => void) | undefined
      const firstBlocked = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })

      const task1 = gate.run(() => firstBlocked)

      await expect(gate.run(async () => 'overflow')).rejects.toSatisfy((err: unknown) => {
        return (
          err instanceof BoundedAdmissionBusyError &&
          err.code === 'ASSESSMENT_START_BUSY' &&
          err.retryAfterSeconds === 1
        )
      })

      releaseFirst?.()
      await task1
    })

    it('maps a gate-busy rejection onto the shared START 503 contract', () => {
      const busyError = new BoundedAdmissionBusyError({
        gate: 'anonymous_start_admission',
        reason: 'queue_full',
        retryAfterSeconds: 1,
        code: 'ASSESSMENT_START_BUSY',
      })
      let converted: unknown
      try {
        rethrowGateBusyAsStartBusy(busyError)
      } catch (e) {
        converted = e
      }
      expect(converted).toBeInstanceOf(AssessmentStartBusyError)
      const busy = converted as AssessmentStartBusyError
      expect(busy.code).toBe('ASSESSMENT_START_BUSY')
      expect(busy.statusCode).toBe(503)
      expect(busy.reason).toBe('ADMISSION_QUEUE_FULL')
      expect(busy.retryAfterSeconds).toBe(1)
    })
  })
})
