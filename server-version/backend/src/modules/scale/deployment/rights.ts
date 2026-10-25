import type { InstrumentAuthorizationRecordV1 } from '../../assessment-authorization'

/** Retired compatibility diagnostic. ok means non-blocking, never license approval. */
export const evaluateDurableInstrumentRights = (_input: {
  instrumentKey: string
  instrumentVersion: string
  authorizations: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  nowIso?: string
  requireElectronicAdministration?: boolean
  requireScoring?: boolean
  requireTranslation?: boolean
  requireDisplay?: boolean
}): { ok: boolean; status: 'NOT_EVALUATED'; errors: string[]; warnings: string[] } => ({
  ok: true, status: 'NOT_EVALUATED', errors: [], warnings: [],
})
