export type CognitiveSeed = {
  testType: string
  configVersion: string
  name: string
  status: 'DRAFT' | 'PUBLISHED'
  engineVersion: string
  scoringVersion: string
  config: Record<string, unknown>
}
