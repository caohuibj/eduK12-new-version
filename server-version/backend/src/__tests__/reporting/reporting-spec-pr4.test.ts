import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { reportingSpecHash, validateReportingSpecDefinition } from '../../modules/reporting/spec'
import type {
  ReportingGroupSpecV1,
  ReportingLongitudinalMetricRuleV1,
  ReportingMatchedLongitudinalSpecV1,
  ReportingProtectedFeedbackSpecV1,
  ReportingRepeatedCohortSpecV1,
} from '../../modules/reporting/types'

const groupMetric = {
  metricId: 'score',
  sourceMetricKey: 'score',
  acceptedResultQuality: ['interpretable'] as const,
  acceptedMetricQuality: 'IGNORE_METRIC_QUALITY' as const,
  aggregations: ['MEAN'] as const,
  missingnessRule: 'EXCLUDE' as const,
  minimumMetricN: 3,
  observationUnit: 'SUBJECT' as const,
  selectionPolicy: 'UNIQUE_OR_REJECT' as const,
}

const group: ReportingGroupSpecV1 = {
  schemaVersion: 1,
  analysisKind: 'GROUP',
  engineKey: 'ORG_GROUP_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumCohortN: 3,
  minimumContributorN: 3,
  reportEvidenceCeiling: 'RESEARCH_READY',
  metricRules: [{ ...groupMetric, acceptedResultQuality: [...groupMetric.acceptedResultQuality], aggregations: [...groupMetric.aggregations] }],
}

const longitudinalMetric: ReportingLongitudinalMetricRuleV1 = {
  ...group.metricRules[0],
  sourceFamily: 'SCALE',
  sourceResourceKey: 'wellbeing',
  valueType: 'NUMBER',
  longitudinalMetricKey: 'wellbeing.score',
}

const comparability = {
  schemaVersion: 1 as const,
  metricId: 'score',
  resourceFamily: 'SCALE' as const,
  resourceKey: 'wellbeing',
  fromVersion: '1.0.0',
  toVersion: '1.1.0',
  level: 'LINKED' as const,
  evidenceRef: 'linking-study:wellbeing-v1-v1.1',
  evidenceHash: 'a'.repeat(64),
}

const repeated: ReportingRepeatedCohortSpecV1 = {
  schemaVersion: 1,
  analysisKind: 'REPEATED_COHORT',
  engineKey: 'ORG_REPEATED_COHORT_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumCohortN: 3,
  minimumContributorN: 3,
  reportEvidenceCeiling: 'RESEARCH_READY',
  metricRules: [longitudinalMetric],
  comparabilityRules: [comparability],
}

const matched: ReportingMatchedLongitudinalSpecV1 = {
  ...repeated,
  analysisKind: 'MATCHED_LONGITUDINAL',
  engineKey: 'ORG_MATCHED_LONGITUDINAL_V1',
}

const protectedFeedback: ReportingProtectedFeedbackSpecV1 = {
  schemaVersion: 1,
  analysisKind: 'PROTECTED_FEEDBACK',
  engineKey: 'ORG_PROTECTED_FEEDBACK_V1',
  engineVersion: '1.0.0',
  privacyUnit: 'RESPONDENT',
  selectionPolicy: 'UNIQUE_OR_REJECT',
  minimumRespondentN: 5,
  minimumContributorN: 5,
  reportEvidenceCeiling: 'PILOT',
  metricRules: [{
    ...longitudinalMetric,
    observationUnit: 'RESPONDENT',
    minimumMetricN: 5,
  }],
}

describe('PR4 governed reporting specs', () => {
  it('keeps the legacy GROUP hash envelope unchanged', () => {
    expect(validateReportingSpecDefinition(group)).toEqual(group)
    expect(reportingSpecHash(group)).toBe(canonicalHash({ schema: 'ReportingAnalysisSpecDefinitionV1', definition: group }))
  })

  it('accepts governed repeated and matched longitudinal contracts with evidence-bound comparability', () => {
    expect(validateReportingSpecDefinition(repeated).analysisKind).toBe('REPEATED_COHORT')
    expect(validateReportingSpecDefinition(matched).analysisKind).toBe('MATCHED_LONGITUDINAL')
  })

  it('requires RESPONDENT observation semantics for protected feedback', () => {
    expect(validateReportingSpecDefinition(protectedFeedback).analysisKind).toBe('PROTECTED_FEEDBACK')
    expect(() => validateReportingSpecDefinition({
      ...protectedFeedback,
      metricRules: [{ ...protectedFeedback.metricRules[0], observationUnit: 'SUBJECT' }],
    })).toThrowError(expect.objectContaining({ code: 'REPORT_SPEC_INVALID' }))
  })

  it('rejects mismatched engines and comparability evidence outside the frozen metric resource identity', () => {
    expect(() => validateReportingSpecDefinition({ ...matched, engineKey: 'ORG_GROUP_V1' }))
      .toThrowError(expect.objectContaining({ code: 'REPORT_SPEC_INVALID' }))
    expect(() => validateReportingSpecDefinition({
      ...matched,
      comparabilityRules: [{ ...comparability, resourceKey: 'different-resource' }],
    })).toThrowError(expect.objectContaining({ code: 'REPORT_SPEC_INVALID' }))
    expect(() => validateReportingSpecDefinition({
      ...matched,
      comparabilityRules: [{ ...comparability, evidenceHash: 'not-a-hash' }],
    })).toThrowError(expect.objectContaining({ code: 'REPORT_SPEC_INVALID' }))
  })

  it('rejects duplicate longitudinal metric identities so one scientific metric cannot be ambiguously selected', () => {
    expect(() => validateReportingSpecDefinition({
      ...matched,
      metricRules: [longitudinalMetric, { ...longitudinalMetric, metricId: 'score-2', sourceMetricKey: 'score-2' }],
    })).toThrowError(expect.objectContaining({ code: 'REPORT_SPEC_INVALID' }))
  })
})
