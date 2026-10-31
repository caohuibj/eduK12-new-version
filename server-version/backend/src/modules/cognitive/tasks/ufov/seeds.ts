import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'ufov',
    configVersion: '1.0.0',
    name: 'Useful Field of View v1.0.0 (16 trials, 400ms stimulus)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 16, stimulusMs: 400, fixationMs: 500, validRtFloorMs: 200, report: SIMULATED_REPORT_V1 },
  },
]
