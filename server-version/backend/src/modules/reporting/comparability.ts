import {
  reportingFail,
  type ReportingComparabilityDecisionV1,
  type ReportingComparabilityLevel,
  type ReportingComparabilityOperation,
  type ReportingComparabilityRuleV1,
  type ReportingResourceFamily,
} from './types'

const HASH = /^[0-9a-f]{64}$/
const positiveLevels = new Set<ReportingComparabilityRuleV1['level']>(['EXACT', 'COMPATIBLE', 'LINKED', 'LIMITED'])

const operationsFor = (level: ReportingComparabilityLevel): ReportingComparabilityOperation[] => {
  if (level === 'EXACT' || level === 'COMPATIBLE' || level === 'LINKED') {
    return ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND', 'NUMERIC_DELTA']
  }
  if (level === 'LIMITED') return ['SIDE_BY_SIDE', 'DESCRIPTIVE_TREND']
  return ['SIDE_BY_SIDE']
}

export const validateComparabilityRule = (rule: ReportingComparabilityRuleV1 | unknown): ReportingComparabilityRuleV1 => {
  const value = rule as ReportingComparabilityRuleV1
  if (!value || value.schemaVersion !== 1 || !positiveLevels.has(value.level)) {
    reportingFail('REPORT_COMPARABILITY_RULE_INVALID', 'comparability rule is invalid', 400)
  }
  for (const field of ['metricId', 'resourceKey', 'fromVersion', 'toVersion', 'evidenceRef'] as const) {
    if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
      reportingFail('REPORT_COMPARABILITY_RULE_INVALID', `${field} is required`, 400)
    }
  }
  if (!['BUNDLE', 'SCALE', 'COGNITIVE', 'SITUATIONAL'].includes(value.resourceFamily)) {
    reportingFail('REPORT_COMPARABILITY_RULE_INVALID', 'resourceFamily is invalid', 400)
  }
  if (!HASH.test(value.evidenceHash)) {
    reportingFail('REPORT_COMPARABILITY_RULE_INVALID', 'evidenceHash must be a sha256 hex digest', 400)
  }
  return {
    ...value,
    metricId: value.metricId.trim(),
    resourceKey: value.resourceKey.trim(),
    fromVersion: value.fromVersion.trim(),
    toVersion: value.toVersion.trim(),
    evidenceRef: value.evidenceRef.trim(),
  }
}

export const resolveReportingComparability = (input: {
  metricId: string
  left: { family: ReportingResourceFamily; key: string; version: string }
  right: { family: ReportingResourceFamily; key: string; version: string }
  rule?: ReportingComparabilityRuleV1 | null
}): ReportingComparabilityDecisionV1 => {
  const metricId = input.metricId.trim()
  if (!metricId) reportingFail('REPORT_COMPARABILITY_INPUT_INVALID', 'metricId is required', 400)
  const noComparison = (limitation: string): ReportingComparabilityDecisionV1 => ({
    schemaVersion: 1,
    metricId,
    level: 'NOT_COMPARABLE',
    allowedOperations: operationsFor('NOT_COMPARABLE'),
    evidenceRef: null,
    evidenceHash: null,
    limitations: [limitation],
  })
  if (input.left.family !== input.right.family || input.left.key !== input.right.key) {
    return noComparison('RESOURCE_IDENTITY_MISMATCH')
  }
  if (!input.rule) return noComparison('COMPARABILITY_EVIDENCE_REQUIRED')
  const rule = validateComparabilityRule(input.rule)
  if (
    rule.metricId !== metricId
    || rule.resourceFamily !== input.left.family
    || rule.resourceKey !== input.left.key
    || rule.fromVersion !== input.left.version
    || rule.toVersion !== input.right.version
  ) return noComparison('COMPARABILITY_RULE_SCOPE_MISMATCH')

  const limitations: string[] = []
  if (rule.level === 'LIMITED') limitations.push('LIMITED_COMPARABILITY')
  if (rule.level === 'LINKED') limitations.push('LINKING_EVIDENCE_REQUIRED_FOR_INTERPRETATION')
  return {
    schemaVersion: 1,
    metricId,
    level: rule.level,
    allowedOperations: operationsFor(rule.level),
    evidenceRef: rule.evidenceRef,
    evidenceHash: rule.evidenceHash,
    limitations,
  }
}

export const assertNumericDeltaAllowed = (decision: ReportingComparabilityDecisionV1): void => {
  if (!decision.allowedOperations.includes('NUMERIC_DELTA')) {
    reportingFail('REPORT_COMPARABILITY_DELTA_NOT_ALLOWED', 'numeric delta is not allowed for this metric comparison', 409)
  }
}
