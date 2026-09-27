import { describe, expect, it } from 'vitest'
import { reportingAnalysisCost } from '../../modules/reporting/runtimeLimit'

describe('reporting runtime cost budget', () => {
  it('weights group/protected requests as one unit', () => {
    expect(reportingAnalysisCost({ runId: 'r', trackId: 't' })).toBe(1)
    expect(reportingAnalysisCost({ analysisKind: 'PROTECTED_FEEDBACK', runId: 'r' })).toBe(1)
  })

  it('weights automatic and individual longitudinal work by selected source count', () => {
    expect(reportingAnalysisCost({ analysisKind: 'MATCHED_LONGITUDINAL', sources: [{}, {}] })).toBe(2)
    expect(reportingAnalysisCost({ analysisKind: 'INDIVIDUAL_LONGITUDINAL', sources: Array.from({ length: 50 }, () => ({})) })).toBe(50)
  })

  it('weights manual longitudinal work by selected Wave count and clamps malformed overlarge input', () => {
    expect(reportingAnalysisCost({ analysisKind: 'REPEATED_COHORT', waveKeys: Array.from({ length: 10 }, (_, i) => `T${i}`) })).toBe(10)
    expect(reportingAnalysisCost({ waveKeys: Array.from({ length: 500 }, () => 'x') })).toBe(50)
    expect(reportingAnalysisCost(null)).toBe(1)
  })
})
