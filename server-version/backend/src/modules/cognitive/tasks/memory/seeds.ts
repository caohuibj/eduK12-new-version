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
    testType: 'memory',
    configVersion: '1.0.1',
    name: 'Working Memory Span v1.0.1 [INTERNAL PILOT]',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { startLength: 2, maxLength: 11, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 1000, inactivityGuardMs: 30000, report: SIMULATED_REPORT_V1 },
  },
{
    testType: 'memory',
    configVersion: '1.1.0',
    name: 'Working Memory Span v1.1.0',
    status: 'PUBLISHED',
    engineVersion: '1.0.0',
    scoringVersion: '1.1.0',
    config: { startLength: 3, maxLength: 9, trialsPerLevel: 2, digitDisplayMs: 800, digitIntervalMs: 200, readyDurationMs: 1000, inactivityGuardMs: 30000, report: SIMULATED_REPORT_V2 },
  }
]
