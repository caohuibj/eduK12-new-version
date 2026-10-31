import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'sizecongruity',
    configVersion: '1.0.1',
    name: 'Numerical Size Congruity v1.0.1 (digits 1-9)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 40, congruentRatio: 0.5, minDigit: 1, maxDigit: 9, minGap: 2, fontLargeRem: 2.8, fontSmallRem: 1.3, fixationMs: 500, timeoutMs: 3000, validRtFloorMs: 200, report: NO_REFERENCE_REPORT },
  },
]
