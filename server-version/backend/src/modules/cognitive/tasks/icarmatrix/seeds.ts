import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'icarmatrix',
    configVersion: '1.0.0',
    name: 'ICAR-style Matrix Reasoning v1.0.0 (8 bank + 8 generated)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 16, stimulusSetVersion: 'icarmatrix-gen-v1.0.0', fixationMs: 400, timeoutMs: 30000, validRtFloorMs: 500, report: SIMULATED_REPORT_V1 },
  },
]
