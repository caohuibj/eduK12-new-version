import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'ufov',
    configVersion: '1.0.1',
    name: 'Useful Field of View v1.0.1 (16 trials, 400ms stimulus)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 16, stimulusMs: 400, fixationMs: 500, validRtFloorMs: 200, report: NO_REFERENCE_REPORT },
  },
]
