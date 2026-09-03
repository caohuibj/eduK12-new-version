export type SafetyErrorCode =
  | 'SAFETY_POLICY'
  | 'SAFETY_STATE'
  | 'SAFETY_UNAUTHORIZED'
  | 'SAFETY_TRIGGER'
  | 'SAFETY_IDEMPOTENT'
  | 'SAFETY_DATETIME'
  | 'SAFETY_INPUT'

export class SafetyContractError extends Error {
  readonly code: SafetyErrorCode
  constructor(code: SafetyErrorCode, message: string) {
    super(message)
    this.name = 'SafetyContractError'
    this.code = code
  }
}

export const safetyFail = (code: SafetyErrorCode, message: string): never => {
  throw new SafetyContractError(code, message)
}
