import { resolveEducationScaleReportPersistedBinding, type EducationScaleReportPersistedFacts } from './education-scale-report.binding'
import { parseVersionedFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { DISCLOSURE_PRESETS } from '../scale/policy/disclosure'
import type { EffectiveScaleDisclosureSnapshot } from '../scale/projection/types'
import { canonicalHash } from '../assessment-runtime/canonical'
import { validateResultDisclosureContract, type ResultAudience } from '../assessment-policy/result-disclosure'
import type { ScaleProjectionContext } from '../scale/projection/types'
import { projectScaleUnitReport, type ScaleUnitReport } from './scale-unit-report'

/** A publication/attempt adapter must supply these from immutable records, never
 * from request parameters or the current/latest Scale definition. */
export interface EducationScaleReportBinding {
  scaleId: string
  definitionHash: string
  instrumentVersion: string
  reportVersion: string
  runtimePolicyHash: string
  resultDisclosureHash: string
  snapshotHash: string
  sourceDefinitionHash: string
}

export interface EducationScaleReportProjectionInput {
  report: ScaleUnitReport
  /** Legacy pure callers with genuinely independent runtime hashes. */
  binding?: EducationScaleReportBinding
  /** Actual Composite persistence uses independent admission/slot/FINAL anchors. */
  persistedFacts?: EducationScaleReportPersistedFacts
  resultDisclosure: unknown
  resultAudience: ResultAudience
  /** Server-loaded attempt snapshot, bound to independently persisted hashes. */
  frozenSnapshot: unknown
  context: ScaleProjectionContext
}

const withheld = () => ({ state: 'WITHHELD' as const })

/** Compatibility content ceiling only, not reader authority or a managed V2
 * runtime policy. The verified frozen library contract further narrows metrics. */
export const educationLibraryV1ProjectionPolicy = (): EffectiveScaleDisclosureSnapshot => ({
  disposition: 'LEGACY_PROFILE',
  disclosure: { schemaVersion: 1, policyVersion: 'education-library-v1-respondent-summary-v1',
    audiences: { respondent: DISCLOSURE_PRESETS.FULL_REPORT() }, unknownAudience: 'DENY' },
})

/** Pure narrowing only; NOT an authorization resolver. The caller still owns
 * current row ownership, membership, relationship, age/applicability, release,
 * emergency-stop and privacy checks, including rechecks after awaited reads.
 *
 * Do not map Teacher self-report to teacher authority: the shared serializer
 * retains its historical default unless given frozen content audience explicitly.
 * Teacher self-report keeps respondent authority, not teacher viewing powers.
 * The server reader supplies immutable library identity separately for V1. */
export function projectEducationScaleIndividualReport(input: EducationScaleReportProjectionInput) {
  const { report, context } = input
  if (Boolean(input.binding) === Boolean(input.persistedFacts)) return withheld()
  let binding: Omit<EducationScaleReportBinding, 'snapshotHash' | 'runtimePolicyHash'> & { snapshotHash?: string; runtimePolicyHash?: string }
  try {
    if (input.persistedFacts) {
      const persisted = resolveEducationScaleReportPersistedBinding(input.persistedFacts, input.frozenSnapshot)
      if (input.persistedFacts.actorUserId !== context.principalId || report.assessmentId !== persisted.assessmentId) return withheld()
      binding = persisted
    } else binding = input.binding!
  } catch { return withheld() }
  const result = report.result
  if (!context.principalId || !context.accessDecision.allowed
    || context.relationalDisposition === 'COHORT_ONLY'
    || context.purpose !== 'report' || report.decryptError || !result
    || result.quality.status === 'invalid') return withheld()

  let snapshot
  try {
    snapshot = parseVersionedFrozenScaleRuntimeSnapshot(input.frozenSnapshot)
    if ((binding.snapshotHash !== undefined && snapshot.snapshotHash !== binding.snapshotHash)
      || snapshot.sourceDefinitionHash !== binding.sourceDefinitionHash
      || snapshot.legacyDefinitionHash !== binding.definitionHash
      || snapshot.instrumentVersion !== binding.instrumentVersion
      || snapshot.instrumentKey !== result.instrument.code
      ) return withheld()
    if (snapshot.schemaVersion === 2) {
      if (context.frozenPolicy.disposition !== 'FROZEN_V2'
        || snapshot.runtimePolicyHash !== binding.runtimePolicyHash
        || canonicalHash(snapshot.compiledPolicy.disclosure) !== canonicalHash(context.frozenPolicy.disclosure)) return withheld()
    } else if (!(input.persistedFacts?.approvedLibrarySource || input.persistedFacts?.privateVersionSource)
      || input.resultAudience !== 'RESPONDENT' || binding.runtimePolicyHash !== undefined
      || canonicalHash(context.frozenPolicy) !== canonicalHash(educationLibraryV1ProjectionPolicy())) return withheld()
  } catch { return withheld() }
  const contentAudience = snapshot.definition.report.audienceContract?.audience
  const scaleAudience = input.resultAudience === 'RESPONDENT' ? 'respondent'
    : input.resultAudience === 'SUBJECT' ? 'subject' : null
  if (!scaleAudience || context.audience !== scaleAudience
    || !(contentAudience === 'student' || (contentAudience === 'teacher' && input.resultAudience === 'RESPONDENT'))
    || result.method.reportAudience !== contentAudience
    || result.method.reportVersion !== snapshot.definition.report.reportVersion) return withheld()

  if (Object.values(binding).some(value => typeof value !== 'string' || !value.trim())
    || report.scaleId !== binding.scaleId
    || result.instrument.scaleId !== binding.scaleId
    || result.method.scaleId !== binding.scaleId
    || result.instrument.instrumentVersion !== binding.instrumentVersion
    || result.method.instrumentVersion !== binding.instrumentVersion
    || result.method.definitionHash !== binding.definitionHash
    || result.method.reportVersion !== binding.reportVersion
    || context.frozenPolicy.runtimePolicyHash !== binding.runtimePolicyHash) return withheld()

  let contract
  try {
    contract = validateResultDisclosureContract(input.resultDisclosure)
    if (canonicalHash(contract) !== binding.resultDisclosureHash) return withheld()
  } catch { return withheld() }
  const rule = contract.audiences[input.resultAudience]
  if (rule.mode !== 'INDIVIDUAL_SUMMARY') return withheld()
  const knownKeys = new Set(result.scores.map(score => score.key))
  if (rule.metricKeys.some(key => !knownKeys.has(key))) return withheld()
  const keys = new Set(rule.metricKeys)
  const includes = (entry: { scoreKey: string }) => keys.has(entry.scoreKey)
  // Rebuild every metric-bearing array from the same authoritative result. Do
  // not trust duplicated convenience arrays on an internal report object.
  const narrowed: ScaleUnitReport = {
    ...report,
    scores: result.scores.filter(score => keys.has(score.key)),
    references: result.references.filter(includes),
    interpretations: result.interpretations.filter(includes),
    rawScoreFeedback: result.rawScoreFeedback?.filter(includes),
    method: result.method,
    caveats: [],
  }
  const restrictedContext: ScaleProjectionContext = {
    ...context,
    currentRestrictions: {
      ...context.currentRestrictions,
      rawAnswers: false,
      itemScores: false,
      // Global method/quality/educational text cannot be scoped by metricKeys.
      methods: false,
      resultQualityDetails: false,
      educationalContent: false,
    },
  }
  return {
    state: 'PROJECTED' as const,
    unitReports: [projectScaleUnitReport(narrowed, restrictedContext, { contentAudience })],
  }
}
