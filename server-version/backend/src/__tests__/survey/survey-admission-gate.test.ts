import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  surveyAdmissionGate,
  resetSurveyAdmissionGateForTests,
  ResearchIdentityError,
} from '../../modules/survey/identity.service'
import {
  isTransientSurveyDatabaseError,
  publicSurveyRouter,
} from '../../modules/survey/public.routes'
import {
  BoundedAdmissionBusyError,
  BoundedAdmissionGate,
} from '../../services/boundedAdmissionGate'
import { AssessmentStartBusyError } from '../../modules/composite/start-transient'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

describe('surveyAdmissionGate and transient error resilience (X-14)', () => {
  beforeEach(() => {
    resetSurveyAdmissionGateForTests()
    delete process.env.SURVEY_ADMISSION_MAX_CONCURRENT
    delete process.env.SURVEY_ADMISSION_MAX_QUEUE
    delete process.env.SURVEY_ADMISSION_MAX_WAIT_MS
    delete process.env.TRAINING_START_MAX_CONCURRENT
    delete process.env.TRAINING_START_MAX_QUEUE
    delete process.env.TRAINING_START_MAX_WAIT_MS
  })

  afterEach(() => {
    resetSurveyAdmissionGateForTests()
  })

  describe('surveyAdmissionGate configuration and bounds', () => {
    it('initializes with default options and inherits TRAINING_START bounds when SURVEY_ADMISSION not set', () => {
      process.env.TRAINING_START_MAX_CONCURRENT = '24'
      process.env.TRAINING_START_MAX_QUEUE = '300'
      process.env.TRAINING_START_MAX_WAIT_MS = '15000'

      const gate = surveyAdmissionGate()
      const stats = gate.getStats()

      expect(stats.options.name).toBe('survey_admission')
      expect(stats.options.busyCode).toBe('SURVEY_ADMISSION_BUSY')
      expect(stats.options.retryAfterSeconds).toBe(1)
      expect(stats.options.maxConcurrent).toBe(24)
      expect(stats.options.maxQueue).toBe(300)
      expect(stats.options.maxWaitMs).toBe(15000)
    })

    it('SURVEY_ADMISSION explicit environment variables override TRAINING_START', () => {
      process.env.TRAINING_START_MAX_CONCURRENT = '24'
      process.env.SURVEY_ADMISSION_MAX_CONCURRENT = '18'
      process.env.SURVEY_ADMISSION_MAX_QUEUE = '120'
      process.env.SURVEY_ADMISSION_MAX_WAIT_MS = '7500'

      const gate = surveyAdmissionGate()
      const stats = gate.getStats()

      expect(stats.options.maxConcurrent).toBe(18)
      expect(stats.options.maxQueue).toBe(120)
      expect(stats.options.maxWaitMs).toBe(7500)
    })

    it('supports explicit maxQueue=0 without falling back to default', () => {
      process.env.SURVEY_ADMISSION_MAX_QUEUE = '0'
      const gate = surveyAdmissionGate()
      const stats = gate.getStats()
      expect(stats.options.maxQueue).toBe(0)
    })

    it('rejects invalid float for maxConcurrent with clear error', () => {
      process.env.SURVEY_ADMISSION_MAX_CONCURRENT = '0.5'
      expect(() => surveyAdmissionGate()).toThrow(/must be a positive integer/)
    })

    it('returns the same singleton instance until reset', () => {
      const gate1 = surveyAdmissionGate()
      const gate2 = surveyAdmissionGate()
      expect(gate1).toBe(gate2)

      resetSurveyAdmissionGateForTests()
      const gate3 = surveyAdmissionGate()
      expect(gate3).not.toBe(gate1)
    })
  })

  describe('BoundedAdmissionGate queue and wait limits', () => {
    it('rejects with SURVEY_ADMISSION_BUSY when queue is full', async () => {
      const testGate = new BoundedAdmissionGate({
        name: 'survey_admission_test_full',
        maxConcurrent: 1,
        maxQueue: 0,
        maxWaitMs: 50,
        retryAfterSeconds: 1,
        busyCode: 'SURVEY_ADMISSION_BUSY',
        busyMessage: '研究参与请求繁忙，请稍后重试',
      })

      let releaseBlocker!: () => void
      const blocker = testGate.run(() => new Promise<void>((resolve) => { releaseBlocker = resolve }))

      let caught: unknown = null
      try {
        await testGate.run(async () => 'overflow')
      } catch (err) {
        caught = err
      }

      releaseBlocker()
      await blocker

      expect(caught).toBeInstanceOf(BoundedAdmissionBusyError)
      const busy = caught as BoundedAdmissionBusyError
      expect(busy.code).toBe('SURVEY_ADMISSION_BUSY')
      expect(busy.retryAfterSeconds).toBe(1)
      expect(busy.reason).toBe('queue_full')
    })

    it('rejects with SURVEY_ADMISSION_BUSY when wait times out', async () => {
      const testGate = new BoundedAdmissionGate({
        name: 'survey_admission_test_timeout',
        maxConcurrent: 1,
        maxQueue: 2,
        maxWaitMs: 15,
        retryAfterSeconds: 1,
        busyCode: 'SURVEY_ADMISSION_BUSY',
        busyMessage: '研究参与请求繁忙，请稍后重试',
      })

      let releaseBlocker!: () => void
      const blocker = testGate.run(() => new Promise<void>((resolve) => { releaseBlocker = resolve }))

      let caught: unknown = null
      try {
        await testGate.run(async () => 'timeout')
      } catch (err) {
        caught = err
      }

      releaseBlocker()
      await blocker

      expect(caught).toBeInstanceOf(BoundedAdmissionBusyError)
      const busy = caught as BoundedAdmissionBusyError
      expect(busy.code).toBe('SURVEY_ADMISSION_BUSY')
      expect(busy.retryAfterSeconds).toBe(1)
      expect(busy.reason).toBe('timeout')
    })
  })

  describe('isTransientSurveyDatabaseError classification', () => {
    it('identifies Prisma P2024 pool timeout as transient', () => {
      expect(isTransientSurveyDatabaseError({ code: 'P2024', message: 'Timed out fetching a new connection from the connection pool' })).toBe(true)
    })

    it('identifies Prisma P2034 transaction conflict as transient', () => {
      expect(isTransientSurveyDatabaseError({ code: 'P2034', message: 'Transaction failed due to a write conflict or a deadlock' })).toBe(true)
    })

    it('identifies Prisma P2028 with rolled back or expired transaction as transient', () => {
      expect(isTransientSurveyDatabaseError({
        code: 'P2028',
        message: 'Transaction API error: Unable to start a transaction in the given time',
      })).toBe(true)

      expect(isTransientSurveyDatabaseError({
        code: 'P2028',
        message: 'Transaction already closed: expired transaction',
      })).toBe(true)
    })

    it('rejects Prisma P2028 with unrelated message', () => {
      expect(isTransientSurveyDatabaseError({
        code: 'P2028',
        message: 'Transaction not found',
      })).toBe(false)
    })

    it('identifies PostgreSQL serialization_failure (40001), deadlock_detected (40P01), lock_not_available (55P03) as transient', () => {
      expect(isTransientSurveyDatabaseError({ code: '40001' })).toBe(true)
      expect(isTransientSurveyDatabaseError({ code: '40P01' })).toBe(true)
      expect(isTransientSurveyDatabaseError({ code: '55P03' })).toBe(true)
      expect(isTransientSurveyDatabaseError({ meta: { code: '40001' } })).toBe(true)
      expect(isTransientSurveyDatabaseError({ meta: { code: '40P01' } })).toBe(true)
      expect(isTransientSurveyDatabaseError({ meta: { code: '55P03' } })).toBe(true)
    })

    it('rejects non-transient errors', () => {
      expect(isTransientSurveyDatabaseError(null)).toBe(false)
      expect(isTransientSurveyDatabaseError(undefined)).toBe(false)
      expect(isTransientSurveyDatabaseError('some error')).toBe(false)
      expect(isTransientSurveyDatabaseError({ code: 'P2002', message: 'Unique constraint failed' })).toBe(false)
      expect(isTransientSurveyDatabaseError({ code: 'P2025', message: 'Record not found' })).toBe(false)
      expect(isTransientSurveyDatabaseError({ code: '42P01', message: 'Undefined table' })).toBe(false)
    })
  })
})
