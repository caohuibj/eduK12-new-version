import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'seqlearn',
    configVersion: '1.0.1',
    name: 'Serial Reaction Time v1.0.1 (60 trials, block 10, random block 4)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 60, trialsPerBlock: 10, patternSequence: [3, 1, 4, 2, 1, 3, 2, 4, 1, 2], randomBlockIndices: [4], fixationMs: 300, stimulusMs: 1200, timeoutMs: 1500, validRtFloorMs: 150, report: NO_REFERENCE_REPORT },
  },
]
