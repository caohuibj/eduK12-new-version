import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'runningspan',
    configVersion: '1.0.0',
    name: 'Running Span v1.0.0 (lists 7-11, recall 3)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 12, listLengthMin: 7, listLengthMax: 11, recallLength: 3, stimulusMs: 500, isiMs: 250, report: SIMULATED_REPORT_V1 },
  },
]
