export class AuthorizationContractError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'AuthorizationContractError'
    this.code = code
  }
}

export const authorizationFail = (code: string, message: string): never => {
  throw new AuthorizationContractError(code, message)
}
