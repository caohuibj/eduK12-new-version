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
    testType: 'trailmaking',
    configVersion: '1.0.0',
    name: 'Trail Making Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { form: 'AB', partAItemCount: 12, partBItemCount: 12, stepTimeoutMs: 15000, stimulusSetVersion: 'trailmaking-generated-v1.0.0', report: NO_REFERENCE_REPORT },
  }
]
