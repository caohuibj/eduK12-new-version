import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'visualwm',
    configVersion: '1.0.0',
    name: 'Change Detection v1.0.0 (16 trials, set size 3-6)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 16, studyMs: 500, retentionMs: 900, validRtFloorMs: 200, report: SIMULATED_REPORT_V1 },
  },
]
