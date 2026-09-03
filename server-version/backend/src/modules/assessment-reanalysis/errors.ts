export type ReanalysisErrorCode =
  | 'REANALYSIS_INPUT'
  | 'REANALYSIS_TARGET'
  | 'REANALYSIS_CONTEXT'
  | 'REANALYSIS_SOURCE'
  | 'REANALYSIS_FORBIDDEN'

export class ReanalysisContractError extends Error {
  readonly code: ReanalysisErrorCode
  constructor(code: ReanalysisErrorCode, message: string) {
    super(message)
    this.name = 'ReanalysisContractError'
    this.code = code
  }
}

export const reanalysisFail = (code: ReanalysisErrorCode, message: string): never => {
  throw new ReanalysisContractError(code, message)
}
