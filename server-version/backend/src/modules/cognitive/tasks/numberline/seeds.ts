import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'numberline',
    configVersion: '1.0.1',
    name: 'Number Line Estimation 0-100 v1.0.1',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 20, lineMax: 100, maxResponseMs: 10000, validRtFloorMs: 300, report: NO_REFERENCE_REPORT },
  },
]
