import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'runningspan',
    configVersion: '1.0.1',
    name: 'Running Span v1.0.1 (lists 7-11, recall 3)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.0',
    config: { totalTrials: 12, listLengthMin: 7, listLengthMax: 11, recallLength: 3, stimulusMs: 500, isiMs: 250, report: NO_REFERENCE_REPORT },
  },
]
