import type { CognitiveSeed } from '../../task-seed.types'
const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}
const SIMULATED_REPORT_V2 = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}
const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.0',
  referenceMode: 'none' as const,
}
export const seeds: CognitiveSeed[] = [
{
    testType: 'nback',
    configVersion: '1.0.0',
    name: 'N-Back v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { nLevels: [1, 2], trialCountByN: [40, 60], blockCountByN: [1, 1], targetRatio: 0.3, stimulusMs: 500, isiMs: 2000, validRtFloorMs: 150, report: NO_REFERENCE_REPORT },
  }
]
