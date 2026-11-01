import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'sentencecheck',
    configVersion: '1.0.1',
    name: 'Sentence-Picture Verification v1.0.1 (30 trials, 50% negated)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 30, trueRatio: 0.5, negationRatio: 0.5, fixationMs: 500, timeoutMs: 8000, validRtFloorMs: 300, report: NO_REFERENCE_REPORT },
  },
  {
    testType: 'sentencecheck',
    configVersion: '1.1.0',
    name: 'Sentence-Picture Verification v1.1.0 (30 trials, crossed truth and polarity)',
    status: 'DRAFT',
    engineVersion: '1.1.0',
    scoringVersion: '1.1.0',
    config: { totalTrials: 30, trueRatio: 0.5, negationRatio: 0.5, fixationMs: 500, timeoutMs: 8000, validRtFloorMs: 300, report: { reportVersion: '1.1.0', referenceMode: 'none' } },
  },
]
