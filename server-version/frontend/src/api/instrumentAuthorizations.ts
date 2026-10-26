const retired = (): Promise<never> => Promise.reject(new Error('AUTHORIZATION_RECORDS_RETIRED'))

export type InstrumentAuthorizationRow = {
  authorizationId: string
  version: number
  instrumentKey: string
  instrumentVersion: string
  status: string
  selfApprovalDeclaration: string | null
  scope: {
    commercialNature: string
    territories: string[]
    locales: string[]
  }
}

/** Compatibility surface only. Never issue a ledger request. */
export const instrumentAuthorizationApi = {
  list: retired,
  create: (_body: Record<string, unknown>) => retired(),
  approve: (_authorizationId: string, _selfApprovalDeclaration: string) => retired(),
  publishPreviewScale: (_body: Record<string, unknown>) => retired(),
}
