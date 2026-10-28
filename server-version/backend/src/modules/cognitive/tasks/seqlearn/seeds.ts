import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'seqlearn',
    configVersion: '1.0.0',
    name: 'Serial Reaction Time v1.0.0 (60 trials, block 10, random block 4)',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 60, trialsPerBlock: 10, patternSequence: [3, 1, 4, 2, 1, 3, 2, 4, 1, 2], randomBlockIndices: [4], fixationMs: 300, stimulusMs: 1200, timeoutMs: 1500, validRtFloorMs: 150, report: SIMULATED_REPORT_V1 },
  },
]
