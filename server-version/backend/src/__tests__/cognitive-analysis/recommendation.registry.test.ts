import { describe, expect, it } from 'vitest'
import {
  buildRecommendations,
  COGNITIVE_RECOMMENDATION_RULE_VERSION,
  LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION,
  listRecommendationRuleDefinitions,
} from '../../modules/cognitive-analysis'
import type {
  CognitiveDomainResult,
  RecommendationRuleContext,
} from '../../modules/cognitive-analysis'

const domain = (
  status: CognitiveDomainResult['status'],
  consistency: CognitiveDomainResult['consistency'],
  watchItems: string[] = [],
  evidenceIds: string[] = ['evidence-1'],
): CognitiveDomainResult => ({
  domain: 'response_inhibition',
  label: '抑制控制',
  status,
  evidence: evidenceIds.map((id) => ({
    id,
    sourceType: 'cognitive_metric',
    sourceResultId: `source-${id}`,
    construct: 'response_inhibition',
    facet: 'action_withholding',
    metricKey: 'commissionRate',
    value: 0,
    unit: 'ratio',
    role: 'primary',
    interpretation: 'criterion',
    directionClass: watchItems.length > 0 ? 'more_difficulty' : 'unknown',
    interpretable: status === 'interpretable',
    qualityFlags: [],
    provenance: {},
  })),
  consistency,
  summary: '描述性结果',
  strengths: [],
  watchItems,
  caveats: [],
})

const context = (
  cognitiveDomains: CognitiveDomainResult[],
  crossSourceFindings: RecommendationRuleContext['crossSourceFindings'] = [],
): RecommendationRuleContext => ({
  packageKey: 'inhibitory_control_multisource_v1',
  packageVersion: '1.0.0',
  cognitiveDomains,
  crossSourceFindings,
  evidence: cognitiveDomains.flatMap((item) => item.evidence),
})

describe('PR11 versioned recommendation registry', () => {
  it('exposes typed 1.1.0 rules and keeps returned definitions isolated', () => {
    expect(COGNITIVE_RECOMMENDATION_RULE_VERSION).toBe('1.1.0')
    expect(LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION).toBe('1.0.0')
    const rules = listRecommendationRuleDefinitions()
    expect(rules.length).toBeGreaterThanOrEqual(5)
    expect(rules.every((rule) => rule.version === '1.1.0')).toBe(true)
    rules[0].audiences.pop()
    expect(listRecommendationRuleDefinitions()[0].audiences.length).toBeGreaterThan(0)
  })

  it('creates low-priority quality follow-up, directional watch and source-gap suggestions', () => {
    const result = buildRecommendations(context([
      domain('insufficient_quality', 'not_applicable', [], ['quality-evidence']),
      domain('interpretable', 'consistent', ['抑制'], ['difficulty-evidence']),
    ], [{
      construct: 'response_inhibition',
      type: 'single_source',
      evidenceRefs: ['source-evidence'],
      summary: '单来源',
      confidence: 'descriptive',
    }]))

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'insufficient_quality_follow_up', priority: 'follow_up', audience: 'participant' }),
      expect.objectContaining({ ruleId: 'clear_difficulty_watch', priority: 'watch', audience: 'teacher' }),
      expect.objectContaining({ ruleId: 'cross_source_source_gap', priority: 'follow_up', audience: 'researcher', evidenceRefs: ['source-evidence'] }),
    ]))
    expect(result.every((item) => item.ruleVersion === '1.1.0')).toBe(true)
  })

  it('limits mixed/divergent context to teacher and researcher', () => {
    const result = buildRecommendations(context([
      domain('interpretable', 'mixed', [], ['mixed-evidence']),
    ]))
    expect(result.map((item) => item.audience)).toEqual(['teacher', 'researcher'])
    expect(result.every((item) => item.text.includes('情境差异'))).toBe(true)
    expect(result.every((item) => !item.text.includes('任一来源错误') || item.audience !== 'participant')).toBe(true)

    const divergent = buildRecommendations(context([
      domain('interpretable', 'consistent', [], ['divergent-evidence']),
    ], [{
      construct: 'response_inhibition',
      type: 'divergence',
      evidenceRefs: ['divergent-evidence'],
      summary: '来源差异',
      confidence: 'descriptive',
    }]))
    expect(divergent.map((item) => item.audience)).toEqual(['teacher', 'researcher'])
    expect(divergent.every((item) => item.text.includes('情境差异'))).toBe(true)
  })

  it('does not add strong direction suggestions for descriptive, unmeasured or paired descriptions', () => {
    const result = buildRecommendations(context([
      domain('descriptive_only', 'not_applicable'),
      domain('not_measured', 'not_applicable'),
    ], [{
      construct: 'response_inhibition',
      type: 'paired_description',
      evidenceRefs: ['paired-evidence'],
      summary: '并列描述',
      confidence: 'descriptive',
    }]))
    expect(result).toHaveLength(3)
    expect(result.every((item) => item.ruleId === 'paired_source_description_info' && item.priority === 'info')).toBe(true)

    const pairedWithDifficulty = buildRecommendations(context([
      domain('interpretable', 'consistent', ['困难']),
    ], [{
      construct: 'response_inhibition',
      type: 'paired_description',
      evidenceRefs: ['paired-evidence'],
      summary: '并列描述',
      confidence: 'descriptive',
    }]))
    expect(pairedWithDifficulty).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'paired_source_description_info', priority: 'info' }),
      expect.objectContaining({ ruleId: 'clear_difficulty_watch', audience: 'participant', construct: 'domain' }),
      expect.objectContaining({ ruleId: 'clear_difficulty_watch', audience: 'teacher', construct: 'domain' }),
      expect.objectContaining({ ruleId: 'clear_difficulty_watch', audience: 'researcher', construct: 'domain' }),
    ]))

    const pairedWithoutDirection = buildRecommendations(context([
      domain('interpretable', 'consistent'),
    ], [{
      construct: 'response_inhibition',
      type: 'paired_description',
      evidenceRefs: ['paired-evidence'],
      summary: '并列描述',
      confidence: 'descriptive',
    }]))
    expect(pairedWithoutDirection.map((item) => item.ruleId)).toEqual([
      'paired_source_description_info',
      'paired_source_description_info',
      'paired_source_description_info',
    ])

    expect(buildRecommendations(context([domain('interpretable', 'consistent', ['困难'])]), LEGACY_COGNITIVE_RECOMMENDATION_RULE_VERSION)).toEqual([])
  })
})
