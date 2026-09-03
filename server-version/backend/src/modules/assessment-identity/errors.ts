export class AssessmentIdentityError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AssessmentIdentityError'
    this.code = code
  }
}

export const identityFail = (code: string, message: string): never => {
  throw new AssessmentIdentityError(code, message)
}
