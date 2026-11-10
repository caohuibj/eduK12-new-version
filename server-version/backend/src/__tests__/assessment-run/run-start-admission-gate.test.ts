import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  runStartGate,
  resetRunStartGateForTests,
} from '../../modules/assessment-run/startExecution'
import {
  AssessmentStartBusyError,
  isAssessmentStartBusyError,
  rethrowGateBusyAsStartBusy,
} from '../../modules/composite/start-transient'
import { BoundedAdmissionBusyError, BoundedAdmissionGate } from '../../services/boundedAdmissionGate'

describe('runStartGate admission and busy mapping', () => {
  beforeEach(() => {
    resetRunStartGateForTests()
    delete process.env.RUN_START_MAX_CONCURRENT
    delete process.env.RUN_START_MAX_QUEUE
    delete process.env.RUN_START_MAX_WAIT_MS
    delete process.env.TRAINING_START_MAX_CONCURRENT
    delete process.env.TRAINING_START_MAX_QUEUE
    delete process.env.TRAINING_START_MAX_WAIT_MS
  })

  afterEach(() => {
    resetRunStartGateForTests()
  })

  it('initializes with default options and inherits TRAINING_START bounds when RUN_START not set', () => {
    process.env.TRAINING_START_MAX_CONCURRENT = '24'
    process.env.TRAINING_START_MAX_QUEUE = '300'
    process.env.TRAINING_START_MAX_WAIT_MS = '15000'

    const gate = runStartGate()
    const stats = gate.getStats()

    expect(stats.options.name).toBe('run_start_admission')
    expect(stats.options.busyCode).toBe('ASSESSMENT_START_BUSY')
    expect(stats.options.retryAfterSeconds).toBe(1)
    expect(stats.options.maxConcurrent).toBe(24)
    expect(stats.options.maxQueue).toBe(300)
    expect(stats.options.maxWaitMs).toBe(15000)
  })

  it('RUN_START explicit environment variables take precedence over TRAINING_START', () => {
    process.env.TRAINING_START_MAX_CONCURRENT = '24'
    process.env.RUN_START_MAX_CONCURRENT = '16'
    process.env.RUN_START_MAX_QUEUE = '150'
    process.env.RUN_START_MAX_WAIT_MS = '8000'

    const gate = runStartGate()
    const stats = gate.getStats()

    expect(stats.options.maxConcurrent).toBe(16)
    expect(stats.options.maxQueue).toBe(150)
    expect(stats.options.maxWaitMs).toBe(8000)
  })

  it('maps queue overflow rejection to AssessmentStartBusyError with queue_full diagnostic', async () => {
    const testGate = new BoundedAdmissionGate({
      name: 'test_gate_overflow',
      maxConcurrent: 1,
      maxQueue: 0,
      maxWaitMs: 50,
      retryAfterSeconds: 1,
      busyCode: 'ASSESSMENT_START_BUSY',
      busyMessage: '测评开始请求繁忙，请稍后重试',
    })

    let releaseBlocker!: () => void
    const blocker = testGate.run(() => new Promise<void>((resolve) => { releaseBlocker = resolve }))

    let caught: unknown = null
    try {
      await testGate.run(async () => 'overflow').catch((err) => {
        throw rethrowGateBusyAsStartBusy(err)
      })
    } catch (err) {
      caught = err
    }

    releaseBlocker()
    await blocker

    expect(isAssessmentStartBusyError(caught)).toBe(true)
    const busy = caught as AssessmentStartBusyError
    expect(busy.statusCode).toBe(503)
    expect(busy.code).toBe('ASSESSMENT_START_BUSY')
    expect(busy.retryAfterSeconds).toBe(1)
    expect(busy.diagnosticClass).toBe('queue_full')
  })

  it('maps wait timeout rejection to AssessmentStartBusyError with queue_timeout diagnostic', async () => {
    const testGate = new BoundedAdmissionGate({
      name: 'test_gate_timeout',
      maxConcurrent: 1,
      maxQueue: 2,
      maxWaitMs: 10,
      retryAfterSeconds: 1,
      busyCode: 'ASSESSMENT_START_BUSY',
      busyMessage: '测评开始请求繁忙，请稍后重试',
    })

    let releaseBlocker!: () => void
    const blocker = testGate.run(() => new Promise<void>((resolve) => { releaseBlocker = resolve }))

    let caught: unknown = null
    try {
      await testGate.run(async () => 'timeout').catch((err) => {
        throw rethrowGateBusyAsStartBusy(err)
      })
    } catch (err) {
      caught = err
    }

    releaseBlocker()
    await blocker

    expect(isAssessmentStartBusyError(caught)).toBe(true)
    const busy = caught as AssessmentStartBusyError
    expect(busy.statusCode).toBe(503)
    expect(busy.code).toBe('ASSESSMENT_START_BUSY')
    expect(busy.retryAfterSeconds).toBe(1)
    expect(busy.diagnosticClass).toBe('queue_timeout')
  })
})
