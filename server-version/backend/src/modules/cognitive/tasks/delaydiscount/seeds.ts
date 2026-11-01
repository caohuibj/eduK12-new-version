import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'delaydiscount',
    configVersion: '1.0.1',
    name: 'Delay Discounting Adjusting-Amount v1.0.1 (100 points, 7/30/90 days)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { delayBands: [7, 30, 90], delayedAmount: 100, bisectionSteps: 5, fixationMs: 500, timeoutMs: 15000, validRtFloorMs: 300, report: NO_REFERENCE_REPORT },
  },
]
