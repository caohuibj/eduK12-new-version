import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.1.0',
  referenceMode: 'none' as const,
}

export const seedsV11: CognitiveSeed[] = [
  {
    testType: 'visualwm',
    configVersion: '1.1.0',
    name: 'Change Detection v1.1.0 (independent two-item practice; formal set size 3-6)',
    status: 'DRAFT',
    engineVersion: '1.1.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 16, studyMs: 500, retentionMs: 900, validRtFloorMs: 200, report: NO_REFERENCE_REPORT },
  },
]
