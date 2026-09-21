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
    testType: 'wordlist',
    configVersion: '1.0.0',
    name: 'Chinese Wordlist Free Recall Pilot v1.0.0',
    status: 'DRAFT',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    config: { listLength: 12, learningRounds: 3, delayedEnabled: false, delayedDelayMs: 60000, studyMsPerWord: 800, recallTimeoutMs: 60000, inactivityGuardMs: 120000, inputMode: 'typed-free-recall', normalizationVersion: 'wordlist-normalization-v1.0.0', stimulusSetVersion: 'chinese-wordlist-v1.0.0', report: NO_REFERENCE_REPORT },
  }
]
