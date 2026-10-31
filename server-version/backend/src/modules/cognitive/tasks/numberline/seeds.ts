import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'numberline',
    configVersion: '1.0.0',
    name: 'Number Line Estimation 0-100 v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 20, lineMax: 100, maxResponseMs: 10000, validRtFloorMs: 300, report: SIMULATED_REPORT_V1 },
  },
]
