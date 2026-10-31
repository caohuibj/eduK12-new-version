import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'semanticfluency',
    configVersion: '1.0.0',
    name: 'Category Fluency v1.0.0 (animals + fruits, 45s each)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 4, durationMs: 45000, stimulusSetVersion: 'semanticfluency-zh-v1.0.0', report: SIMULATED_REPORT_V1 },
  },
]
