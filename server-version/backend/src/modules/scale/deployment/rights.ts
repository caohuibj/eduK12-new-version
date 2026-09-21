import {
  assertLocaleTerritoryMatch,
  evaluateAuthorizationOverlayStatus,
  resolveEffectiveAuthorization,
  type InstrumentAuthorizationRecordV1,
} from '../../assessment-authorization'

const ELIGIBLE = new Set(['APPROVED', 'EVIDENCE_PENDING'])

/** Generic durable-rights diagnostic for catalog/admin surfaces. Runtime starts use evaluateScaleDeployment. */
export const evaluateDurableInstrumentRights = (input: {
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
}): { ok: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = []
  const warnings: string[] = []
  const nowIso = input.nowIso ?? new Date().toISOString()
  const effective = resolveEffectiveAuthorization({
    authorizations: input.authorizations,
    instrumentKey: input.instrumentKey,
    instrumentVersion: input.instrumentVersion,
    nowIso,
  })
  if (!effective || !ELIGIBLE.has(effective.status)) {
    return { ok: false, errors: [`${input.instrumentKey}@${input.instrumentVersion} requires APPROVED|EVIDENCE_PENDING authorization`], warnings }
  }
  const overlay = evaluateAuthorizationOverlayStatus(effective, nowIso)
  if (overlay === 'EXPIRED' || overlay === 'REVOKED' || overlay === 'DRAFT') errors.push(`${input.instrumentKey}@${input.instrumentVersion} authorization ${overlay}`)
  if (Date.parse(nowIso) < Date.parse(effective.validFrom) || Date.parse(nowIso) > Date.parse(effective.validTo)) errors.push(`${input.instrumentKey}@${input.instrumentVersion} outside validFrom/validTo`)
  const scope = assertLocaleTerritoryMatch({ record: effective, locale: input.locale, territory: input.territory })
  if (!scope.ok) errors.push(scope.message ?? 'SCOPE_MISMATCH')
  if (input.requireElectronicAdministration !== false && !effective.scope.electronicAdministration) errors.push(`${input.instrumentKey}: electronicAdministration required`)
  if (input.requireScoring !== false && !effective.scope.scoring) errors.push(`${input.instrumentKey}: scoring required`)
  if (input.requireTranslation === true && !effective.scope.translation) errors.push(`${input.instrumentKey}: translation required`)
  if (input.requireDisplay !== false && !effective.scope.display) errors.push(`${input.instrumentKey}: display required`)
  if (effective.status === 'EVIDENCE_PENDING') warnings.push(`${input.instrumentKey}: EVIDENCE_PENDING — warn only`)
  return { ok: errors.length === 0, errors, warnings }
}
