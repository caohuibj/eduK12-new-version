/** Task-owned shapes until the integration owner adds the public type exports. */
export interface ReadingcompConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: { reportVersion: string; referenceMode: 'none' | 'simulated' | 'literature'; referenceVersion?: string; referenceBand?: string }
}
export type ReadingcompTrialPayload = { itemId: string; responseIndex: number | null; rtMs: number | null; interrupted: boolean }
