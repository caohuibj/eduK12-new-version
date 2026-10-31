import { z } from 'zod'
import { validateRelationalCohortPolicy, type RelationalCohortAnalysisPolicyV1 } from '../assessment-relational/analysis'
import type { RelationalProductEntryV1 } from '../assessment-relational/product-registry'
import { canonicalHash } from '../assessment-runtime/canonical'
import type { CanonicalUnitResultCoreV1 } from '../assessment-runtime/unit-result'
import type { ReportingLeafSourceV2 } from '../reporting/types'
import { validateResultDisclosureContract, type ResultDisclosureContractV1 } from './result-disclosure'

export const SELF_GROUP_POLICY_KEY = 'EDUCATION_SELF_GROUP_V2'
export const SELF_GROUP_POLICY_VERSION = '2.0.0'
export const selfGroupAggregateAudiences = ['PROFESSIONAL', 'TEACHER', 'ORGANIZATION'] as const
export type SelfGroupAggregateAudience = typeof selfGroupAggregateAudiences[number]
type SelfGroupEntry = Pick<RelationalProductEntryV1, 'applicability' | 'resultDisclosure' | 'cohortAnalysisPolicy'>

/** Structure only. The caller must resolve and verify the exact released entry,
 * its frozen hash and current source authority before using this contract. */
export function isSelfGroupV2Entry(entry: SelfGroupEntry): boolean {
  const { applicability: a, resultDisclosure: d, cohortAnalysisPolicy: c } = entry
  return a.analysisMode === 'COHORT_AGGREGATE'
    && a.relationshipKinds.length === 1 && a.relationshipKinds[0] === 'SELF'
    && a.perspectives.length === 1 && a.perspectives[0] === 'SELF_REPORT'
    && a.subjectRoles.length === 1 && a.respondentRoles.length === 1
    && a.subjectRoles[0] === a.respondentRoles[0]
    && d?.policyKey === SELF_GROUP_POLICY_KEY && c?.policyKey === SELF_GROUP_POLICY_KEY
    && c.policyVersion === SELF_GROUP_POLICY_VERSION
    && c.minimumRespondents === a.minimumRespondents && d.minimumRespondents === a.minimumRespondents
}

/** No audience fallback: a NONE rule for a professional remains NONE even
 * when the organization has an explicitly approved aggregate rule. */
export function selfGroupAggregateCeiling(input: {
  contract: ResultDisclosureContractV1; audience: SelfGroupAggregateAudience
}) {
  const contract = validateResultDisclosureContract(input.contract)
  if (contract.policyKey !== SELF_GROUP_POLICY_KEY) throw new Error('SELF_GROUP_V2_CONTRACT_REQUIRED')
  const rule = contract.audiences[input.audience]
  return rule.mode.includes('AGGREGATE') ? {
    ...rule, metricKeys: [...rule.metricKeys], longitudinalMetricKeys: [...rule.longitudinalMetricKeys],
    minimumRespondents: contract.minimumRespondents!,
  } : null
}

/** Publisher check against the already approved own-result contract. The
 * original feedback timing is frozen separately and must also be retained. */
export function assertSelfGroupOwnSummaryCeiling(input: {
  approved: ResultDisclosureContractV1; proposed: ResultDisclosureContractV1
}): void {
  const approved = validateResultDisclosureContract(input.approved)
  const proposed = validateResultDisclosureContract(input.proposed)
  if (proposed.policyKey !== SELF_GROUP_POLICY_KEY) throw new Error('SELF_GROUP_V2_CONTRACT_REQUIRED')
  for (const [audience, rule] of Object.entries(proposed.audiences)) {
    if (rule.mode !== 'INDIVIDUAL_SUMMARY') continue
    if (audience !== 'RESPONDENT' && audience !== 'SUBJECT') throw new Error('SELF_GROUP_OWN_SUMMARY_ONLY')
    const ceiling = approved.audiences[audience]
    if (ceiling.mode !== 'INDIVIDUAL_SUMMARY'
      || rule.metricKeys.some(key => !ceiling.metricKeys.includes(key))
      || rule.longitudinalMetricKeys.some(key => !ceiling.longitudinalMetricKeys.includes(key))) {
      throw new Error('SELF_GROUP_OWN_SUMMARY_WIDENED')
    }
  }
}

/** Reuses the existing cohort schema; the contract explicitly declares every
 * audience, while this policy lists the union of their aggregate metrics. */
export function buildSelfGroupCohortAnalysisPolicy(input: ResultDisclosureContractV1): RelationalCohortAnalysisPolicyV1 {
  const contract = validateResultDisclosureContract(input)
  const metricKeys = [...new Set(selfGroupAggregateAudiences.flatMap(audience =>
    selfGroupAggregateCeiling({ contract, audience })?.metricKeys ?? []))].sort()
  return validateRelationalCohortPolicy({ schemaVersion: 1, policyKey: SELF_GROUP_POLICY_KEY,
    policyVersion: SELF_GROUP_POLICY_VERSION, minimumRespondents: contract.minimumRespondents!, metricKeys })
}

export function assertSelfGroupV2Entry(entry: SelfGroupEntry): void {
  if (!isSelfGroupV2Entry(entry)) throw new Error('SELF_GROUP_V2_ENTRY_REQUIRED')
  const contract = validateResultDisclosureContract(entry.resultDisclosure)
  for (const [audience, rule] of Object.entries(contract.audiences)) {
    if (rule.mode === 'INDIVIDUAL_SUMMARY' && audience !== 'RESPONDENT' && audience !== 'SUBJECT') {
      throw new Error('SELF_GROUP_OWN_SUMMARY_ONLY')
    }
    if (rule.mode.includes('AGGREGATE') && !(selfGroupAggregateAudiences as readonly string[]).includes(audience)) {
      throw new Error('SELF_GROUP_EXPLICIT_AGGREGATE_AUDIENCE_REQUIRED')
    }
    if (rule.mode === 'RESEARCH_PROJECTION') throw new Error('SELF_GROUP_RESEARCH_PROJECTION_UNSUPPORTED')
  }
  const expected = buildSelfGroupCohortAnalysisPolicy(contract)
  if (canonicalHash(expected) !== canonicalHash(validateRelationalCohortPolicy(entry.cohortAnalysisPolicy!))) {
    throw new Error('SELF_GROUP_COHORT_POLICY_MISMATCH')
  }
}

export const selfGroupParentIdentitySchema = z.object({
  resourceKind: z.enum(['SCALE', 'COGNITIVE', 'SITUATIONAL', 'BUNDLE', 'FORM']),
  resourceKey: z.string().min(1), resourceVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  entryHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type SelfGroupParentIdentity = z.infer<typeof selfGroupParentIdentitySchema>
export interface SelfGroupLeafIdentity {
  parent: SelfGroupParentIdentity
  leaf: ReportingLeafSourceV2
  /** Container-independent source identity, not a longitudinal comparability decision. */
  disclosureIdentityHash: string
}

/** After the caller verifies parent publication and the frozen parent→slot
 * mapping, bind that slot to its actual canonical leaf before selecting scores.
 * Never resolve a leaf by flattening all metric keys from a whole Bundle. */
export function resolveSelfGroupLeafIdentity(input: {
  parent: SelfGroupParentIdentity; leaf: ReportingLeafSourceV2; core: CanonicalUnitResultCoreV1
}): SelfGroupLeafIdentity {
  const parent = selfGroupParentIdentitySchema.parse(input.parent)
  const { leaf, core } = input
  if (!leaf.slotKey || leaf.unitType !== core.unitType || leaf.instrumentKey !== core.instrumentKey
    || leaf.instrumentVersion !== core.instrumentVersion || leaf.compiledRuntimeHash !== core.compiledRuntimeHash) {
    throw new Error('SELF_GROUP_LEAF_IDENTITY_MISMATCH')
  }
  return { parent, leaf: { ...leaf }, disclosureIdentityHash: canonicalHash({
    schema: 'EducationSelfGroupLeafDisclosureV2', unitType: core.unitType,
    instrumentKey: core.instrumentKey, instrumentVersion: core.instrumentVersion,
    sourceDefinitionHash: core.sourceDefinitionHash, scorerKey: core.scorerKey, scorerVersion: core.scorerVersion,
    protocolSignature: core.scientificProvenance.protocolSignature ?? null,
    profileKey: core.scientificProvenance.profileKey ?? null,
    resolvedConfigHash: core.scientificProvenance.resolvedConfigHash ?? null,
    metricUnits: core.metrics.map(metric => ({ key: metric.key, unit: metric.unit ?? null })).sort((a, b) => a.key.localeCompare(b.key)),
  }) }
}
