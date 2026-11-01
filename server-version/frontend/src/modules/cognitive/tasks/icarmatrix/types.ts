export interface IcarmatrixConfig {
  totalTrials: number
  stimulusSetVersion: string
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

export type IcarmatrixTrialPayload = {
  itemIndex: number
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

export interface IcarmatrixV2Config {
  totalTrials: number
  matrixType: '2x2' | '3x3'
  stimulusSetVersion: 'matgen-bank-v1.0.0'
  fixationMs: number
  timeoutMs: number
  validRtFloorMs: number
  report: {
    reportVersion: string
    referenceMode: 'none' | 'simulated' | 'literature'
    referenceVersion?: string
    referenceBand?: string
  }
}

export type IcarmatrixV2TrialPayload = {
  trialIndex: number
  bankItemId: string
  responseIndex: number | null
  rtMs: number | null
  interrupted: boolean
}

export interface IcarmatrixV21Config extends Omit<IcarmatrixV2Config, 'stimulusSetVersion' | 'matrixType'> {
  matrixType: '3x3'
  stimulusSetVersion: 'matgen-reviewed-v1.0.0'
}
