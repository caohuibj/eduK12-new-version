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
  if (Date.parse(nowIso) < Date.parse(record.validFrom)) return 'DRAFT'
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

const ELIGIBLE_RIGHTS_STATUSES = new Set(['APPROVED', 'EVIDENCE_PENDING'])

/**
 * Resolve the effective authorization for one instrumentKey@version lineage.
 * Newer DRAFT must not kill an active APPROVED/EVIDENCE_PENDING version.
 * Do not fold some(EXPIRED) over all history — only the effective row matters.
 */
export const resolveEffectiveAuthorization = (input: {
  authorizations: InstrumentAuthorizationRecordV1[]
  instrumentKey: string
  instrumentVersion: string
  nowIso: string
}): InstrumentAuthorizationRecordV1 | null => {
  const lineage = input.authorizations
    .filter((row) => (
      row.instrumentKey === input.instrumentKey
      && row.instrumentVersion === input.instrumentVersion
    ))
    .sort((a, b) => b.version - a.version)

  if (lineage.length === 0) return null

  // Prefer the newest eligible (APPROVED | EVIDENCE_PENDING) that is in validity window
  // and not overlay-EXPIRED/REVOKED.
  for (const row of lineage) {
    const overlay = evaluateAuthorizationOverlayStatus(row, input.nowIso)
    if (!ELIGIBLE_RIGHTS_STATUSES.has(row.status)) continue
    if (overlay === 'EXPIRED' || overlay === 'REVOKED') continue
    if (overlay === 'DRAFT') continue
    if (Date.parse(input.nowIso) < Date.parse(row.validFrom)) continue
    if (Date.parse(input.nowIso) > Date.parse(row.validTo)) continue
    return row
  }

  // Fall back to newest row for diagnostics (caller may treat as ineligible).
  return lineage[0] ?? null
}

export type PublicationProofsV1 = {
  scientificOk?: boolean
  languageOk?: boolean
  reportOk?: boolean
  safetyOk?: boolean
  goldenOk?: boolean
}

const evaluateRequiredBooleanGate = (input: {
  gate: PublicationGateResultV1['gate']
  required: boolean
  proof: boolean | undefined
  pendingLabel: string
  failLabel: string
  okLabel: string
}): PublicationGateResultV1 => {
  if (!input.required) {
    return {
      gate: input.gate,
      ok: true,
      severity: 'warning',
      message: `${input.gate} not required`,
      evaluation: 'not_required',
    }
  }
  if (input.proof === undefined) {
    return {
      gate: input.gate,
      ok: false,
      severity: 'error',
      message: input.pendingLabel,
      evaluation: 'pending',
    }
  }
  if (input.proof !== true) {
    return {
      gate: input.gate,
      ok: false,
      severity: 'error',
      message: input.failLabel,
      evaluation: 'failed',
    }
  }
  return {
    gate: input.gate,
    ok: true,
    severity: 'error',
    message: input.okLabel,
    evaluation: 'passed',
  }
}

/**
 * Unified Publish validation: science/rights/language/report/safety/golden.
 * EVIDENCE_PENDING warns but does not block already-approved publish.
 * WHO-5 is publishable only when commercialNature is NON_COMMERCIAL.
 * Required gates fail-closed: undefined proof ≠ pass; preview shows pending.
 * Code-definition DRAFT cannot become environment PUBLISHED via overlay.
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
  /** When true, rights also require electronicAdministration/scoring/translation/display as needed. */
  requireElectronicAdministration?: boolean
  requireScoring?: boolean
  requireTranslation?: boolean
  requireDisplay?: boolean
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

  const req = input.definition.publicationRequirements

  push(evaluateRequiredBooleanGate({
    gate: 'scientific',
    required: req.scientificGate,
    proof: input.scientificOk,
    pendingLabel: 'scientific gate pending/not evaluated',
    failLabel: 'scientific gate failed',
    okLabel: 'scientific gate ok',
  }))
  push(evaluateRequiredBooleanGate({
    gate: 'language',
    required: req.languageGate,
    proof: input.languageOk,
    pendingLabel: 'language gate pending/not evaluated',
    failLabel: 'language gate failed',
    okLabel: 'language gate ok',
  }))
  push(evaluateRequiredBooleanGate({
    gate: 'report',
    required: req.reportGate,
    proof: input.reportOk,
    pendingLabel: 'report gate pending/not evaluated',
    failLabel: 'report gate failed',
    okLabel: 'report gate ok',
  }))
  push(evaluateRequiredBooleanGate({
    gate: 'golden',
    required: true,
    proof: input.goldenOk,
    pendingLabel: 'golden/negative gate pending/not evaluated',
    failLabel: 'golden/negative gate failed',
    okLabel: 'golden gate ok',
  }))

  const safetyRequired = req.safetyGate || input.definition.safetyCapability.productionTriggerEnabled
  push(evaluateRequiredBooleanGate({
    gate: 'safety',
    required: safetyRequired,
    proof: input.safetyOk,
    pendingLabel: 'safety gate pending/not evaluated',
    failLabel: 'safety gate failed',
    okLabel: 'safety gate ok',
  }))

  let rightsOk = true
  const requireElectronic = input.requireElectronicAdministration !== false
  const requireScoring = input.requireScoring !== false
  const requireTranslation = input.requireTranslation === true
  const requireDisplay = input.requireDisplay !== false

  if (input.definition.rightsRequirements.required || req.rightsGate) {
    const instrumentKeys = (
      input.definition.rightsRequirements.instrumentKeys.length > 0
        ? input.definition.rightsRequirements.instrumentKeys
        : input.definition.slots.map((slot) => slot.instrumentKey)
    )
    // Exact instrument versions from slots when present.
    const versionByKey = new Map<string, string>()
    for (const slot of input.definition.slots) {
      versionByKey.set(slot.instrumentKey, slot.instrumentVersion)
    }

    for (const instrumentKey of instrumentKeys) {
      const instrumentVersion = versionByKey.get(instrumentKey)
        ?? input.authorizations.find((row) => row.instrumentKey === instrumentKey)?.instrumentVersion
      if (!instrumentVersion) {
        rightsOk = false
        errors.push(`missing authorization for ${instrumentKey}`)
        continue
      }

      const effective = resolveEffectiveAuthorization({
        authorizations: input.authorizations,
        instrumentKey,
        instrumentVersion,
        nowIso,
      })
      if (!effective) {
        rightsOk = false
        errors.push(`missing authorization for ${instrumentKey}@${instrumentVersion}`)
        continue
      }

      const overlay = evaluateAuthorizationOverlayStatus(effective, nowIso)
      if (!ELIGIBLE_RIGHTS_STATUSES.has(effective.status) || overlay === 'EXPIRED' || overlay === 'REVOKED' || overlay === 'DRAFT') {
        rightsOk = false
        errors.push(`${instrumentKey}@${instrumentVersion} authorization ${overlay}`)
        continue
      }
      if (Date.parse(nowIso) < Date.parse(effective.validFrom) || Date.parse(nowIso) > Date.parse(effective.validTo)) {
        rightsOk = false
        errors.push(`${instrumentKey}@${instrumentVersion} outside validFrom/validTo`)
        continue
      }

      const scope = assertLocaleTerritoryMatch({
        record: effective,
        locale: input.locale,
        territory: input.territory,
      })
      if (!scope.ok) {
        rightsOk = false
        errors.push(scope.message ?? 'SCOPE_MISMATCH')
        continue
      }

      if (requireElectronic && !effective.scope.electronicAdministration) {
        rightsOk = false
        errors.push(`${instrumentKey}: electronicAdministration required`)
        continue
      }
      if (requireScoring && !effective.scope.scoring) {
        rightsOk = false
        errors.push(`${instrumentKey}: scoring required`)
        continue
      }
      if (requireTranslation && !effective.scope.translation) {
        rightsOk = false
        errors.push(`${instrumentKey}: translation required`)
        continue
      }
      if (requireDisplay && !effective.scope.display) {
        rightsOk = false
        errors.push(`${instrumentKey}: display required`)
        continue
      }

      if (overlay === 'EVIDENCE_PENDING' || effective.status === 'EVIDENCE_PENDING') {
        warnings.push(`${instrumentKey}: EVIDENCE_PENDING — warn only, does not block approved publish`)
      }
      if (isWho5Instrument(instrumentKey) || isWho5Instrument(input.definition.bundleKey)) {
        if (
          effective.scope.commercialNature !== 'NON_COMMERCIAL'
          || input.deploymentCommercialNature !== 'NON_COMMERCIAL'
          || !req.nonCommercialOnly
        ) {
          rightsOk = false
          errors.push('WHO-5 仅 NON_COMMERCIAL 可发布')
          continue
        }
      } else if (
        effective.scope.commercialNature === 'NON_COMMERCIAL'
        && input.deploymentCommercialNature === 'COMMERCIAL'
      ) {
        rightsOk = false
        errors.push(`${instrumentKey}: commercialNature mismatch with deployment`)
        continue
      }
    }
  }
  push({
    gate: 'rights',
    ok: rightsOk,
    severity: 'error',
    message: rightsOk ? 'rights gate ok' : 'rights gate failed',
    evaluation: rightsOk ? 'passed' : 'failed',
  })

  // Blocking only from effective eligible rows that are EXPIRED/REVOKED/SCOPE_MISMATCH —
  // never some(EXPIRED) over entire history including superseded versions.
  let blocking = false
  if (input.definition.rightsRequirements.required || req.rightsGate) {
    const instrumentKeys = (
      input.definition.rightsRequirements.instrumentKeys.length > 0
        ? input.definition.rightsRequirements.instrumentKeys
        : input.definition.slots.map((slot) => slot.instrumentKey)
    )
    const versionByKey = new Map<string, string>()
    for (const slot of input.definition.slots) {
      versionByKey.set(slot.instrumentKey, slot.instrumentVersion)
    }
    for (const instrumentKey of instrumentKeys) {
      const instrumentVersion = versionByKey.get(instrumentKey)
      if (!instrumentVersion) {
        blocking = true
        continue
      }
      const effective = resolveEffectiveAuthorization({
        authorizations: input.authorizations,
        instrumentKey,
        instrumentVersion,
        nowIso,
      })
      if (!effective || !ELIGIBLE_RIGHTS_STATUSES.has(effective.status)) {
        blocking = true
        continue
      }
      const status = evaluateAuthorizationOverlayStatus(effective, nowIso)
      if (status === 'EXPIRED' || status === 'REVOKED') {
        blocking = true
        continue
      }
      const scope = assertLocaleTerritoryMatch({
        record: effective,
        locale: input.locale,
        territory: input.territory,
      })
      if (!scope.ok) blocking = true
    }
  }

  // Code-definition DRAFT cannot become environment PUBLISHED via overlay alone.
  if (input.definition.status !== 'PUBLISHED') {
    errors.push(`code definition status is ${input.definition.status}; overlay cannot publish DRAFT/HOLD/RETIRED`)
  }

  const publishable = errors.length === 0 && !blocking && input.definition.status === 'PUBLISHED'
  const catalogStatus: PublicationDecisionV1['catalogStatus'] = publishable
    ? 'PUBLISHED'
    : (blocking
      ? 'HOLD'
      : (input.definition.status === 'DRAFT' ? 'DRAFT' : 'HOLD'))

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
