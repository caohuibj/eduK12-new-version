import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'wordmeaning',
    configVersion: '1.0.0',
    name: 'Word Meaning (Chinese) v1.0.0 (30 of 36 items)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 30, stimulusSetVersion: 'wordmeaning-zh-v1.0.0', fixationMs: 400, timeoutMs: 15000, validRtFloorMs: 300, report: SIMULATED_REPORT_V1 },
  },
]
