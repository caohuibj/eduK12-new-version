export interface CognitiveTaskSeedDeclarationV1 {
  testType: string
  configVersion: string
  name: string
  status: 'DRAFT' | 'PUBLISHED'
  engineVersion: string
  scoringVersion: string
  config: Record<string, unknown>
}

export const SIMULATED_REPORT_V1 = {
  reportVersion: '1.0.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'sim-k12-v0.1',
  referenceBand: 'K7-9',
}
export const SIMULATED_REPORT_V2 = {
  reportVersion: '1.1.0',
  referenceMode: 'simulated' as const,
  referenceVersion: 'lit-sim-k12-v0.2',
  referenceBand: 'K7-9',
}
export const NO_REFERENCE_REPORT = {
  reportVersion: '1.0.0',
  referenceMode: 'none' as const,
}
