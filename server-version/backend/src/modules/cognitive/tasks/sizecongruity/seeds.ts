import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'sizecongruity',
    configVersion: '1.0.0',
    name: 'Numerical Size Congruity v1.0.0 (digits 1-9)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 40, congruentRatio: 0.5, minDigit: 1, maxDigit: 9, minGap: 2, fontLargeRem: 2.8, fontSmallRem: 1.3, fixationMs: 500, timeoutMs: 3000, validRtFloorMs: 200, report: SIMULATED_REPORT_V1 },
  },
]
