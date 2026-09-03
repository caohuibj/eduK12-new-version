import { describe, expect, it } from 'vitest'
import {
  aggregateFinalizationAdmission,
  withAggregateFinalizationAdmission,
} from '../../services/aggregateFinalizationAdmission'
import { isQuestionnaireCompletionAdmissionBusyError } from '../../services/questionnaireCompletionAdmission'
import { BoundedAdmissionGate } from '../../services/boundedAdmissionGate'

describe('aggregateFinalizationAdmission', () => {
  it('uses stricter Gate-D candidate defaults and COMPLETION_BUSY', () => {
    const stats = aggregateFinalizationAdmission.getStats()
    expect(stats.options.name).toBe('aggregate_finalization')
    expect(stats.options.busyCode).toBe('COMPLETION_BUSY')
    expect(stats.options.maxConcurrent).toBe(3)
    expect(stats.options.maxQueue).toBe(4)
    expect(stats.options.maxWaitMs).toBe(250)
  })

  it('maps overflow to COMPLETION_BUSY for client retry', async () => {
    const gate = new BoundedAdmissionGate({
      name: 'aggregate_test',
      maxConcurrent: 1,
      maxQueue: 0,
      maxWaitMs: 50,
      retryAfterSeconds: 1,
      busyCode: 'COMPLETION_BUSY',
      busyMessage: 'busy',
    })
    let release!: () => void
    const hold = gate.run(() => new Promise<void>((resolve) => { release = resolve }))
    const rejected = await gate.run(async () => 'nope').catch((error) => error)
    expect(isQuestionnaireCompletionAdmissionBusyError(rejected)).toBe(true)
    release()
    await hold
    await expect(withAggregateFinalizationAdmission(async () => 'ok')).resolves.toBe('ok')
  })
})
