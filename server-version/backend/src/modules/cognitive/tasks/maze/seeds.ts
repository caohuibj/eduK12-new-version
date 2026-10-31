import type { CognitiveSeed } from '../../task-seed.types'

const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'maze',
    configVersion: '1.0.0',
    name: 'Maze Navigation v1.0.0 (4 mazes, 7×7, 120s limit)',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { totalTrials: 4, mazeCols: 7, mazeRows: 7, timeLimitMs: 120000, report: SIMULATED_REPORT_V1 },
  },
]
