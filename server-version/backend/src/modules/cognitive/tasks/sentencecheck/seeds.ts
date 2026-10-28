import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'sentencecheck',
    configVersion: '1.0.0',
    name: 'Sentence-Picture Verification v1.0.0 (30 trials, 50% negated)',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 30, trueRatio: 0.5, negationRatio: 0.5, fixationMs: 500, timeoutMs: 8000, validRtFloorMs: 300, report: SIMULATED_REPORT_V1 },
  },
]
