import type { CognitiveSeed } from '../../task-seed.types'
const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}
const SIMULATED_REPORT_V2 = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}
const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.0',
  referenceMode: 'none' as const,
}
export const seeds: CognitiveSeed[] = [
{
    testType: 'corsi',
    configVersion: '1.0.0',
    name: 'Corsi Block-Tapping v1.0.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startSpan: 3, maxSpan: 8, trialsPerLevel: 2, boardSize: 9, highlightMs: 500, intervalMs: 250, readyDurationMs: 800, inactivityGuardMs: 30000, report: NO_REFERENCE_REPORT },
  }
]
