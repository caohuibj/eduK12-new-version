/**
 * integrated-evidence-v1 — complementary cross-method evidence only.
 * Go/No-Go (cognitive) + ADEXI Chinese self-report (scale) for adults 18+.
 *
 * Hard rules:
 * - Evidence.role stays PRIMARY|SUPPORTING|CONTEXT|SAFETY — NEVER CONVERGENT/DIVERGENT.
 * - Without reference norms: do NOT claim convergence, divergence, abnormality, or diagnosis.
 * - Subject age < 18 → UNAVAILABLE (age reject).
 */
import type {
  BundleAnalysisEngineV1,
  BundleEngineInputV1,
  BundleEngineResultV1,
} from '../registry'
import {
  assertUniqueCognitiveSources,
  assertUniqueScaleSources,
  assertUniqueValueSelectors,
  type BundleFrozenCognitiveSourceV1,
  type BundleFrozenScaleSourceV1,
} from '../sources'
import type {
  EvidenceItemV1,
  EvidenceQualityStateV1,
  EvidenceRoleV1,
  FactPresenceV1,
} from '../types'

export const INTEGRATED_EVIDENCE_ENGINE_KEY = 'integrated-evidence-v1' as const
export const INTEGRATED_EVIDENCE_ENGINE_VERSION = '1.0.0' as const
export const INTEGRATED_EVIDENCE_PAYLOAD_SCHEMA = 'integrated-evidence-payload-v1' as const

export const INTEGRATED_ADULT_MIN_AGE_YEARS = 18

const FORBIDDEN_EVIDENCE_ROLES = new Set(['CONVERGENT', 'DIVERGENT', 'convergent', 'divergent'])

export type IntegratedEvidenceStatusV1 =
  | 'age_rejected'
  | 'missing_sources'
  | 'insufficient_quality'
  | 'complementary_descriptive'

export interface IntegratedMethodObservationV1 {
  method: 'cognitive_gonogo' | 'scale_adexi'
  slotKey: string
  instrumentKey: string
  selectorKey: string
  value: number | string | boolean | null
  quality: EvidenceQualityStateV1
  role: EvidenceRoleV1
}

export interface IntegratedEvidencePayloadV1 {
  schema: typeof INTEGRATED_EVIDENCE_PAYLOAD_SCHEMA
  status: IntegratedEvidenceStatusV1
  subjectAgeYears: number | null
  /** Explicit: this engine never asserts agreement/disagreement between methods. */
  claimsConvergence: false
  claimsDivergence: false
  claimsAbnormality: false
  claimsDiagnosis: false
  methods: IntegratedMethodObservationV1[]
  complementaryNotes: string[]
  limitations: string[]
}

const readSubjectAgeYears = (input: BundleEngineInputV1): number | null => {
  const facts = input.contextFacts?.facts ?? []
  for (const fact of facts) {
    if (fact.contextKey !== 'subject_age_years') continue
    if (fact.value.state !== 'present') return null
    const raw = fact.value.value
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) {
      return Number(raw)
    }
    return null
  }
  return null
}

export const assertIntegratedAdultAge = (ageYears: number | null): {
  ok: boolean
  reason: string | null
} => {
  if (ageYears === null || !Number.isFinite(ageYears)) {
    return { ok: false, reason: 'subject_age_years missing — adult integrated bundle requires age ≥ 18' }
  }
  if (ageYears < INTEGRATED_ADULT_MIN_AGE_YEARS) {
    return {
      ok: false,
      reason: `subject age ${ageYears} < ${INTEGRATED_ADULT_MIN_AGE_YEARS} — rejected for integrated_gonogo_adexi_adult`,
    }
  }
  return { ok: true, reason: null }
}

/** Guard used by tests and callers — never allow CONVERGENT/DIVERGENT on Evidence.role. */
export const assertEvidenceRolesSafeForIntegrated = (items: EvidenceItemV1[]): void => {
  for (const item of items) {
    if (FORBIDDEN_EVIDENCE_ROLES.has(item.role)) {
      throw new Error(`integrated-evidence-v1 forbids Evidence.role=${item.role}`)
    }
    if (item.role !== 'PRIMARY' && item.role !== 'SUPPORTING' && item.role !== 'CONTEXT' && item.role !== 'SAFETY') {
      throw new Error(`integrated-evidence-v1 unknown Evidence.role=${item.role}`)
    }
  }
}

const findCognitive = (
  sources: BundleFrozenCognitiveSourceV1[] | undefined,
  slotKey: string,
): BundleFrozenCognitiveSourceV1 | undefined => (
  (sources ?? []).find((row) => row.slotKey === slotKey)
)

const findScale = (
  sources: BundleFrozenScaleSourceV1[] | undefined,
  slotKey: string,
): BundleFrozenScaleSourceV1 | undefined => (
  (sources ?? []).find((row) => row.slotKey === slotKey)
)

const buildPayload = (input: BundleEngineInputV1): IntegratedEvidencePayloadV1 => {
  const age = readSubjectAgeYears(input)
  const ageGate = assertIntegratedAdultAge(age)
  const limitations: string[] = [
    'Complementary cross-method evidence only.',
    'Without reference norms do not claim convergence, divergence, abnormality, or diagnosis.',
    'Evidence.role never uses CONVERGENT/DIVERGENT.',
  ]
  const complementaryNotes: string[] = []
  const methods: IntegratedMethodObservationV1[] = []

  if (!ageGate.ok) {
    return {
      schema: INTEGRATED_EVIDENCE_PAYLOAD_SCHEMA,
      status: 'age_rejected',
      subjectAgeYears: age,
      claimsConvergence: false,
      claimsDivergence: false,
      claimsAbnormality: false,
      claimsDiagnosis: false,
      methods: [],
      complementaryNotes: [],
      limitations: [...limitations, ageGate.reason ?? 'age rejected'],
    }
  }

  assertUniqueCognitiveSources(input.cognitiveSources ?? [])
  assertUniqueScaleSources(input.scaleSources ?? [])

  const gonogoSlot = input.snapshot.slotBindings.find((slot) => slot.slotKey === 'gonogo' || slot.instrumentKey === 'gonogo')
  const adexiSlot = input.snapshot.slotBindings.find((slot) => slot.slotKey === 'adexi' || slot.instrumentKey === 'adexi' || slot.instrumentKey === 'adexi_v1')

  const boundSlots = [gonogoSlot, adexiSlot].filter(Boolean) as NonNullable<typeof gonogoSlot>[]
  if (boundSlots.length > 0) assertUniqueValueSelectors(boundSlots)

  const gonogo = gonogoSlot ? findCognitive(input.cognitiveSources, gonogoSlot.slotKey) : undefined
  const adexi = adexiSlot ? findScale(input.scaleSources, adexiSlot.slotKey) : undefined

  if (!gonogo || !adexi) {
    return {
      schema: INTEGRATED_EVIDENCE_PAYLOAD_SCHEMA,
      status: 'missing_sources',
      subjectAgeYears: age,
      claimsConvergence: false,
      claimsDivergence: false,
      claimsAbnormality: false,
      claimsDiagnosis: false,
      methods: [],
      complementaryNotes: [],
      limitations: [
        ...limitations,
        !gonogo ? 'Go/No-Go cognitive source missing' : '',
        !adexi ? 'ADEXI scale source missing' : '',
      ].filter(Boolean),
    }
  }

  const gonogoSelectors = gonogoSlot?.valueSelectors?.length
    ? gonogoSlot.valueSelectors
    : ['commissionRate']
  let missingRequiredSelector = false
  for (const metricKey of gonogoSelectors) {
    const hasKey = Object.prototype.hasOwnProperty.call(gonogo.metrics, metricKey)
    const raw = gonogo.metrics[metricKey]
    const value = (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean')
      ? raw
      : null
    if (!hasKey || value === null) missingRequiredSelector = true
    methods.push({
      method: 'cognitive_gonogo',
      slotKey: gonogo.slotKey,
      instrumentKey: gonogo.instrumentKey,
      selectorKey: metricKey,
      value,
      // Required selector missing → unavailable, never interpretable-with-null.
      quality: (!hasKey || value === null)
        ? 'unavailable'
        : gonogo.qualityState,
      role: 'PRIMARY',
    })
  }

  const adexiSelectors = adexiSlot?.valueSelectors?.length
    ? adexiSlot.valueSelectors
    : adexi.scores.map((score) => score.scoreKey)
  for (const scoreKey of adexiSelectors) {
    const score = adexi.scores.find((row) => row.scoreKey === scoreKey)
    if (!score || score.value === null || score.value === undefined) missingRequiredSelector = true
    methods.push({
      method: 'scale_adexi',
      slotKey: adexi.slotKey,
      instrumentKey: adexi.instrumentKey,
      selectorKey: scoreKey,
      value: score?.value ?? null,
      quality: (!score || score.value === null || score.value === undefined)
        ? 'unavailable'
        : adexi.qualityState,
      role: 'SUPPORTING',
    })
  }
  if (missingRequiredSelector) {
    limitations.push('Required valueSelector missing from frozen source — insufficient / UNAVAILABLE')
  }

  complementaryNotes.push(
    'Go/No-Go performance metrics and ADEXI self-report scores are presented side-by-side as complementary methods; agreement is not inferred.',
  )

  const anyInvalid = methods.some((row) => row.quality === 'invalid')
  const anyUnavailable = methods.some((row) => row.quality === 'unavailable')
  const anyInterpretable = methods.some((row) => row.quality === 'interpretable')
  const hasNorms = Boolean(gonogo.hasReferenceNorms)
  if (!hasNorms) {
    limitations.push('No reference norms on cognitive source — descriptive complementary reporting only.')
  }

  const status: IntegratedEvidenceStatusV1 = (
    missingRequiredSelector || anyInvalid || anyUnavailable || !anyInterpretable
      ? 'insufficient_quality'
      : 'complementary_descriptive'
  )

  return {
    schema: INTEGRATED_EVIDENCE_PAYLOAD_SCHEMA,
    status,
    subjectAgeYears: age,
    claimsConvergence: false,
    claimsDivergence: false,
    claimsAbnormality: false,
    claimsDiagnosis: false,
    methods,
    complementaryNotes,
    limitations,
  }
}

const toLowerConstructSegment = (value: string): string => (
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .toLowerCase()
    .replace(/^[^a-z]+/, 'm_')
)

/**
 * Project integrated methods into EvidenceItemV1 with safe roles only.
 * Prefer passing frozen source hashes — missing hash fails closed (no zero-hash fallback).
 */
export const projectIntegratedEvidenceItems = (
  payload: IntegratedEvidencePayloadV1,
  hashes: { gonogo?: string; adexi?: string },
): EvidenceItemV1[] => {
  const items: EvidenceItemV1[] = []
  for (const row of payload.methods) {
    const hash = row.method === 'cognitive_gonogo' ? hashes.gonogo : hashes.adexi
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
      throw new Error(
        `integrated-evidence-v1 refuse zero-hash fallback: missing frozen sourceResultHash for ${row.method}/${row.slotKey}`,
      )
    }
    const value: FactPresenceV1 = row.value === null
      ? { state: 'missing' }
      : { state: 'present', value: row.value }
    const selectorSeg = toLowerConstructSegment(row.selectorKey)
    const instrumentSeg = toLowerConstructSegment(row.instrumentKey)
    const slotSeg = toLowerConstructSegment(row.slotKey)
    const source = row.method === 'cognitive_gonogo'
      ? {
          kind: 'COGNITIVE_METRIC' as const,
          slotKey: row.slotKey,
          metricKey: row.selectorKey,
          sourceResultHash: hash,
        }
      : {
          kind: 'SCALE_SCORE' as const,
          slotKey: row.slotKey,
          scoreKey: row.selectorKey,
          sourceResultHash: hash,
        }
    items.push({
      evidenceKey: `${slotSeg}.${instrumentSeg}.${selectorSeg}.${row.role.toLowerCase()}`,
      constructKey: `${instrumentSeg}.${selectorSeg}`,
      source,
      value,
      quality: row.quality,
      criterionBandKey: null,
      role: row.role,
    })
  }
  assertEvidenceRolesSafeForIntegrated(items)
  return items
}

export const runIntegratedEvidenceV1: BundleAnalysisEngineV1 = (
  input: BundleEngineInputV1,
): BundleEngineResultV1 => {
  const ref = input.snapshot.engine
  if (ref.key !== INTEGRATED_EVIDENCE_ENGINE_KEY || ref.version !== INTEGRATED_EVIDENCE_ENGINE_VERSION) {
    return {
      kind: 'UNAVAILABLE',
      reason: `engine ref mismatch: expected ${INTEGRATED_EVIDENCE_ENGINE_KEY}@${INTEGRATED_EVIDENCE_ENGINE_VERSION}`,
    }
  }

  const payload = buildPayload(input)
  if (payload.status === 'age_rejected') {
    return {
      kind: 'UNAVAILABLE',
      reason: payload.limitations.find((row) => /age/i.test(row)) ?? 'age rejected',
    }
  }
  if (payload.status === 'missing_sources') {
    return {
      kind: 'UNAVAILABLE',
      reason: payload.limitations.find((row) => /missing/i.test(row)) ?? 'missing sources',
    }
  }
  if (
    payload.status === 'insufficient_quality'
    && payload.limitations.some((row) => /Required valueSelector missing/i.test(row))
  ) {
    return {
      kind: 'UNAVAILABLE',
      reason: 'required valueSelector missing from frozen source',
    }
  }

  return {
    kind: 'COMPUTED',
    payload,
  }
}
