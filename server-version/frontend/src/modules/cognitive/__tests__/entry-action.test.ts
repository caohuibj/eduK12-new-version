import { describe, expect, it } from 'vitest'
import { resolveCognitiveEntryAction } from '../entry-action'

describe('resolveCognitiveEntryAction', () => {
  it('opens the exact completed session result when the ledger proves completion', () => {
    expect(resolveCognitiveEntryAction('session-1', 'COMPLETED')).toEqual({ kind: 'result', label: '查看结果' })
  })

  it('continues the exact known in-progress session', () => {
    expect(resolveCognitiveEntryAction('session-2', 'IN_PROGRESS')).toEqual({ kind: 'continue', label: '继续测评' })
  })

  it('uses reconcile wording when local state is absent or ambiguous', () => {
    expect(resolveCognitiveEntryAction(null, null)).toEqual({ kind: 'reconcile', label: '开始/继续测评' })
    expect(resolveCognitiveEntryAction('session-stale', 'INVALID')).toEqual({ kind: 'reconcile', label: '开始/继续测评' })
  })
})
