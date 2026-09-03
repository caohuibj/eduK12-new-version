export class BundleContractError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BundleContractError'
    this.code = code
  }
}

export const bundleContractFail = (code: string, message: string): never => {
  throw new BundleContractError(code, message)
}
