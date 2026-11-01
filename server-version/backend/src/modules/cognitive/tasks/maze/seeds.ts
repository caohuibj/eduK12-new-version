import type { CognitiveSeed } from '../../task-seed.types'

const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.1',
  referenceMode: 'none' as const,
}

export const seeds: CognitiveSeed[] = [
  {
    testType: 'maze',
    configVersion: '1.0.1',
    name: 'Maze Navigation v1.0.1 (4 mazes, 7×7, 120s limit)',
    status: 'DRAFT',
    engineVersion: '1.0.1',
    scoringVersion: '1.0.1',
    config: { totalTrials: 4, mazeCols: 7, mazeRows: 7, timeLimitMs: 120000, report: NO_REFERENCE_REPORT },
  },
]
