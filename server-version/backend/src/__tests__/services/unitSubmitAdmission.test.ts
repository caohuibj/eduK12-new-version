import { afterEach, describe, expect, it } from 'vitest'
import { BoundedAdmissionGate } from '../../services/boundedAdmissionGate'
import {
  isUnitSubmitAdmissionBusyError,
  unitSubmitAdmission,
  withUnitSubmitAdmission,
  UnitSubmitAdmissionBusyError,
} from '../../services/unitSubmitAdmission'

describe('unit submit admission', () => {
  afterEach(() => {
    expect(unitSubmitAdmission.getStats().active).toBe(0)
    expect(unitSubmitAdmission.getStats().queued).toBe(0)
  })

  it('keeps ASSESSMENT_SUBMIT_BUSY distinct from COMPLETION_BUSY', async () => {
    expect(unitSubmitAdmission.getStats().options.busyCode).toBe('ASSESSMENT_SUBMIT_BUSY')
    expect(unitSubmitAdmission.getStats().options.name).toBe('unit_submit')
    await expect(withUnitSubmitAdmission(async () => 'ok')).resolves.toBe('ok')
  })

  it('maps gate busy errors to UnitSubmitAdmissionBusyError', async () => {
    const gate = new BoundedAdmissionGate({
      name: 'unit_submit_test',
      maxConcurrent: 1,
      maxQueue: 0,
      maxWaitMs: 50,
      retryAfterSeconds: 2,
      busyCode: 'ASSESSMENT_SUBMIT_BUSY',
      busyMessage: '测评提交繁忙，请稍后重试',
    })
    let release!: () => void
    const hold = gate.run(() => new Promise<void>((resolve) => { release = resolve }))
    const rejected = await gate.run(async () => 'nope').catch((error) => error)
    expect(isUnitSubmitAdmissionBusyError(rejected)).toBe(true)
    expect(rejected).toMatchObject({ code: 'ASSESSMENT_SUBMIT_BUSY', reason: 'queue_full', retryAfterSeconds: 2 })
    expect(rejected.code).not.toBe('COMPLETION_BUSY')
    expect(new UnitSubmitAdmissionBusyError('timeout', 1).code).toBe('ASSESSMENT_SUBMIT_BUSY')
    release()
    await hold
  })
})
