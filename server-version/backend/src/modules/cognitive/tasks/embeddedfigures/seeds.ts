import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'embeddedfigures',
    configVersion: '1.0.0',
    name: 'Embedded Figures v1.0.0 (4 bank + 6 generated)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 10, stimulusSetVersion: 'embeddedfigures-zh-v1.0.0', showTargetMs: 3000, timeoutMs: 15000, validRtFloorMs: 400, report: SIMULATED_REPORT_V1 },
  },
]
