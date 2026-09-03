export class AssessmentObserverError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AssessmentObserverError'
    this.code = code
  }
}

export const observerFail = (code: string, message: string): never => {
  throw new AssessmentObserverError(code, message)
}
