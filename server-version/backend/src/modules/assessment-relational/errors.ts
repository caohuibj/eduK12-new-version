export class RelationalAssessmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RelationalAssessmentError'
  }
}

export const relationalFail = (code: string, message: string): never => {
  throw new RelationalAssessmentError(code, message)
}
