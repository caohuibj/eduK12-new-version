import { describe, expect, it } from 'vitest'
import { buildResearchTrialDataset } from '../../modules/cognitive/research-trial-dataset'
import { buildMatrixResponseInterchange } from '../../modules/cognitive/banks/research-matrix-interchange'
import {
  ICARMATRIX_V2_BANK, generateIcarmatrixV2Plan, icarmatrixV2OptionOrder,
} from '../../modules/cognitive/tasks/icarmatrix/generator-v2'

const datasetFor = (id: string, userId: string) => {
  const seed = 'pilot-seed-' + id
  const plan = generateIcarmatrixV2Plan(seed, 2, '3x3')
  const trials = plan.map((idx, trialIndex) => {
    const item = ICARMATRIX_V2_BANK[idx]
    return {
      trialIndex,
      payload: {
        trialIndex, bankItemId: item.itemId,
        responseIndex: icarmatrixV2OptionOrder(seed, trialIndex, item.responses.length).indexOf(0),
        rtMs: 1800, interrupted: false,
      },
    }
  })
  return {
    id, userId, anonymousCode: null, attemptNo: 1, testType: 'icarmatrix',
    engineVersion: '2.0.0', scoringVersion: '1.0.0',
    configVersion: '1.0.0-adolescent', stimulusSetVersion: 'matgen-bank-v1.0.0',
    matrixType: '3x3' as const, plannedTotalTrials: 2, randomSeed: seed, validRtFloorMs: 500, trials,
  }
}

const options = { configVersion: '1.0.0-adolescent', matrixType: '3x3' as const, sampleDescription: 'pilot school sample' }

describe('icarmatrix real-trial to IRT response-matrix interchange', () => {
  it('reconstructs items, preserving unadministered bank items as missing', () => {
    const source = buildResearchTrialDataset([datasetFor('s1', 'student-1')])
    const result = buildMatrixResponseInterchange(source, options)
    expect(result.dataOrigin).toBe('real')
    expect(result.personIds).toHaveLength(1)
    expect(result.itemIds).toHaveLength(10)
    expect(result.responses[0].filter((v) => v === 1)).toHaveLength(2)
    expect(result.responses[0].filter((v) => v === null)).toHaveLength(8)
  })

  it('rejects mismatched bank, stale stimulus, repeated participants and simulated data', () => {
    const source = buildResearchTrialDataset([datasetFor('s1', 'student-1')])
    expect(() => buildMatrixResponseInterchange({ ...source, dataOrigin: 'simulation' as 'real' }, options)).toThrow(/real-origin/)
    expect(() => buildMatrixResponseInterchange({ ...source, rows: source.rows.map((r) => ({ ...r, stimulusSetVersion: 'wrong' })) }, options)).toThrow(/frozen bank/)
    expect(() => buildMatrixResponseInterchange({ ...source, rows: source.rows.map((r) => ({ ...r, payload: { ...r.payload, bankItemId: 'tampered' } })) }, options)).toThrow(/seed\/item/)
    const repeated = buildResearchTrialDataset([datasetFor('s1', 'student-1'), datasetFor('s2', 'student-1')])
    expect(() => buildMatrixResponseInterchange(repeated, options)).toThrow(/Repeated participant/)
  })

  it('rejects a completed session whose frozen planned trial count exceeds stored rows', () => {
    const source = buildResearchTrialDataset([datasetFor('s1', 'student-1')])
    const truncated = {
      ...source, rows: source.rows.map((row) => ({ ...row, plannedTotalTrials: 3 })),
    }
    expect(() => buildMatrixResponseInterchange(truncated, options)).toThrow(/Incomplete frozen trial count/)
    expect(() => buildMatrixResponseInterchange({
      ...source, rows: source.rows.map((row) => ({ ...row, plannedTotalTrials: null })),
    }, options)).toThrow(/Incomplete frozen trial count/)
  })

  it('keeps exclusion policy explicit and never treats a rapid guess as correct', () => {
    const source = buildResearchTrialDataset([datasetFor('s1', 'student-1')])
    const changed = {
      ...source, rows: source.rows.map((r, index) =>
        index === 0 ? { ...r, trialQuality: 'rapid_guess' as const } : r),
    }
    const result = buildMatrixResponseInterchange(changed, options)
    expect(result.exclusions.rapid_guess).toBe(1)
    expect(result.responses[0].filter((v) => v === 1)).toHaveLength(1)
  })
})
