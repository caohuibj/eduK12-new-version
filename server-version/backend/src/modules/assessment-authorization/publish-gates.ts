import type { AssessmentBundleDefinitionV1 } from '../assessment-bundle/types'
import {
  COGNITIVE_INTEGRATED_DEFAULT_MAX_MS,
  SCALE_OBSERVER_DEFAULT_MAX_MS,
  type AttemptDeadlinePolicyV1,
  type InstrumentAuthorizationRecordV1,
  type PublicationDecisionV1,
  type PublicationGateResultV1,
} from './types'

const who5Keys = new Set([
  'who5',
  'wellbeing_who5_youth_self_zh_cn_v1',
])

export const isWho5Instrument = (instrumentKey: string): boolean => (
  who5Keys.has(instrumentKey) || instrumentKey.includes('who5')
)

export const evaluateAuthorizationOverlayStatus = (
  record: InstrumentAuthorizationRecordV1,
  nowIso: string = new Date().toISOString(),
): InstrumentAuthorizationRecordV1['status'] => {
  if (record.status === 'REVOKED') return 'REVOKED'
  if (record.status === 'DRAFT') return 'DRAFT'
  if (Date.parse(nowIso) > Date.parse(record.validTo)) return 'EXPIRED'
  return record.status
}

export const assertLocaleTerritoryMatch = (input: {
  record: InstrumentAuthorizationRecordV1
  locale: string
  territory: string
}): { ok: boolean; status: InstrumentAuthorizationRecordV1['status']; message?: string } => {
  const localeOk = input.record.scope.locales.includes(input.locale)
  const territoryOk = input.record.scope.territories.includes(input.territory)
  if (localeOk && territoryOk) return { ok: true, status: input.record.status }
  return {
    ok: false,
    status: 'SCOPE_MISMATCH',
    message: `locale/territory mismatch: ${input.locale}/${input.territory}`,
  }
}

/**
 * Unified Publish validation: science/rights/language/report/safety/golden.
 * EVIDENCE_PENDING warns but does not block already-approved publish.
 * WHO-5 is publishable only when commercialNature is NON_COMMERCIAL.
 */
export const evaluateBundlePublication = (input: {
  definition: AssessmentBundleDefinitionV1
  authorizations: InstrumentAuthorizationRecordV1[]
  locale: string
  territory: string
  deploymentCommercialNature: 'NON_COMMERCIAL' | 'COMMERCIAL' | 'UNSPECIFIED'
  nowIso?: string
  scientificOk?: boolean
  languageOk?: boolean
  reportOk?: boolean
  safetyOk?: boolean
  goldenOk?: boolean
}): PublicationDecisionV1 => {
  const nowIso = input.nowIso ?? new Date().toISOString()
  const gates: PublicationGateResultV1[] = []
  const warnings: string[] = []
  const errors: string[] = []

  const push = (gate: PublicationGateResultV1) => {
    gates.push(gate)
    if (!gate.ok && gate.severity === 'error') errors.push(gate.message)
    if (!gate.ok && gate.severity === 'warning') warnings.push(gate.message)
  }

  push({
    gate: 'scientific',
    ok: input.scientificOk !== false,
    severity: 'error',
    message: input.scientificOk === false ? 'scientific gate failed' : 'scientific gate ok',
  })
  push({
    gate: 'language',
    ok: input.languageOk !== false,
    severity: 'error',
    message: input.languageOk === false ? 'language gate failed' : 'language gate ok',
  })
  push({
    gate: 'report',
    ok: input.reportOk !== false,
    severity: 'error',
    message: input.reportOk === false ? 'report gate failed' : 'report gate ok',
  })
  push({
    gate: 'safety',
    ok: input.definition.safetyCapability.productionTriggerEnabled
      ? input.safetyOk === true
      : input.safetyOk !== false,
    severity: 'error',
    message: 'safety gate evaluated',
  })
  push({
    gate: 'golden',
    ok: input.goldenOk !== false,
    severity: 'error',
    message: input.goldenOk === false ? 'golden/negative gate failed' : 'golden gate ok',
  })

  let rightsOk = true
  if (input.definition.rightsRequirements.required || input.definition.publicationRequirements.rightsGate) {
    for (const instrumentKey of (
      input.definition.rightsRequirements.instrumentKeys.length > 0
        ? input.definition.rightsRequirements.instrumentKeys
        : input.definition.slots.map((slot) => slot.instrumentKey)
    )) {
      const matches = input.authorizations.filter((row) => row.instrumentKey === instrumentKey)
      if (matches.length === 0) {
        rightsOk = false
        errors.push(`missing authorization for ${instrumentKey}`)
        continue
      }
      const latest = matches.sort((a, b) => b.version - a.version)[0]
      const overlay = evaluateAuthorizationOverlayStatus(latest, nowIso)
      if (overlay === 'EXPIRED' || overlay === 'REVOKED') {
        rightsOk = false
        errors.push(`${instrumentKey} authorization ${overlay}`)
        continue
      }
      const scope = assertLocaleTerritoryMatch({
        record: latest,
        locale: input.locale,
        territory: input.territory,
      })
      if (!scope.ok) {
        rightsOk = false
        errors.push(scope.message ?? 'SCOPE_MISMATCH')
        continue
      }
      if (overlay === 'EVIDENCE_PENDING') {
        warnings.push(`${instrumentKey}: EVIDENCE_PENDING — warn only, does not block approved publish`)
      }
      if (isWho5Instrument(instrumentKey) || isWho5Instrument(input.definition.bundleKey)) {
        if (
          latest.scope.commercialNature !== 'NON_COMMERCIAL'
          || input.deploymentCommercialNature !== 'NON_COMMERCIAL'
          || !input.definition.publicationRequirements.nonCommercialOnly
        ) {
          rightsOk = false
          errors.push('WHO-5 仅 NON_COMMERCIAL 可发布')
        }
      }
    }
  }
  push({
    gate: 'rights',
    ok: rightsOk,
    severity: 'error',
    message: rightsOk ? 'rights gate ok' : 'rights gate failed',
  })

  // Blocking overlay statuses stop new starts and force catalog HOLD.
  const blocking = input.authorizations.some((row) => {
    const status = evaluateAuthorizationOverlayStatus(row, nowIso)
    if (status === 'EXPIRED' || status === 'REVOKED') return true
    const scope = assertLocaleTerritoryMatch({
      record: row,
      locale: input.locale,
      territory: input.territory,
    })
    return !scope.ok
  })

  const publishable = errors.length === 0 && !blocking
  const catalogStatus = publishable
    ? 'PUBLISHED'
    : (blocking ? 'HOLD' : (input.definition.status === 'DRAFT' ? 'DRAFT' : 'HOLD'))
  return {
    publishable,
    catalogStatus,
    allowNewStarts: publishable,
    warnings,
    errors,
    gates,
  }
}

export const resolveAttemptDeadline = (input: {
  unitFamily: AttemptDeadlinePolicyV1['unitFamily']
  startedAt: string
  campaignDeadlineAt?: string | null
}): AttemptDeadlinePolicyV1 => {
  const defaultMaxMs = (
    input.unitFamily === 'COGNITIVE' || input.unitFamily === 'INTEGRATED'
      ? COGNITIVE_INTEGRATED_DEFAULT_MAX_MS
      : SCALE_OBSERVER_DEFAULT_MAX_MS
  )
  const frozenDeadlineAt = new Date(Date.parse(input.startedAt) + defaultMaxMs).toISOString()
  const campaignDeadlineAt = input.campaignDeadlineAt ?? null
  const effectiveDeadlineAt = campaignDeadlineAt
    && Date.parse(campaignDeadlineAt) < Date.parse(frozenDeadlineAt)
    ? campaignDeadlineAt
    : frozenDeadlineAt
  return {
    unitFamily: input.unitFamily,
    defaultMaxMs,
    frozenDeadlineAt,
    campaignDeadlineAt,
    effectiveDeadlineAt,
  }
}

/**
 * EXPIRED/REVOKED/SCOPE_MISMATCH stop new starts; in-flight attempts may finish
 * only until the original frozen deadline (no extension).
 */
export const canStartNewAttempt = (input: {
  decision: PublicationDecisionV1
}): boolean => input.decision.allowNewStarts && input.decision.publishable

export const canFinishInFlightAttempt = (input: {
  frozenDeadlineAt: string
  nowIso?: string
}): boolean => {
  const nowIso = input.nowIso ?? new Date().toISOString()
  return Date.parse(nowIso) <= Date.parse(input.frozenDeadlineAt)
}
