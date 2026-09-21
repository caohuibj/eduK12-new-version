import { describe, expect, it } from 'vitest'
import { DISCLOSURE_PRESETS } from '../../modules/scale/policy/disclosure'
import type { AudienceDisclosurePolicyV1, DisclosureCapabilitiesV1 } from '../../modules/scale/policy/types'
import type { ScaleResultV2 } from '../../modules/scale/scale-result'
import { projectScaleResult } from '../../modules/scale/projection/scale-result.projector'
import type { ScaleProjectionContext } from '../../modules/scale/projection/types'

const fullCaps = DISCLOSURE_PRESETS.FULL_REPORT()
const educationalCaps = DISCLOSURE_PRESETS.EDUCATIONAL_ONLY()

const policy = (caps: DisclosureCapabilitiesV1): AudienceDisclosurePolicyV1 => ({
  schemaVersion: 1,
  policyVersion: 'projection-test-v1',
  audiences: { respondent: caps },
  unknownAudience: 'DENY',
})

const context = (caps: DisclosureCapabilitiesV1, access = fullCaps): ScaleProjectionContext => ({
  principalId: 'student-1',
  audience: 'respondent',
  purpose: 'result',
  accessDecision: { source: 'RESOURCE_AUTHORIZATION', allowed: true, capabilities: access },
  frozenPolicy: {
    disposition: 'FROZEN_V2',
    disclosure: policy(caps),
    educationalFeedback: {
      schemaVersion: 1,
      contentVersion: 'feedback-v1',
      blocks: [{ id: 'about', body: '固定教育反馈' }],
      choices: [{ id: 'sleep', label: '睡眠', body: '记录一周睡眠习惯。' }],
      disclaimer: '仅供教育用途。',
    },
  },
  currentRestrictions: fullCaps,
  relationalDisposition: 'NON_RELATIONAL',
})

const result = (value: number): ScaleResultV2 => ({
  schemaVersion: 2,
  instrument: { scaleId: 'scale-1', code: 'synthetic', name: 'Synthetic', instrumentVersion: '1.0.0' },
  method: {
    scaleId: 'scale-1',
    instrumentVersion: '1.0.0',
    scoringVersion: '1.0.0',
    reportVersion: '1.0.0',
    definitionHash: 'definition-hash',
    referenceVersions: [],
    assessmentContext: null,
  },
  quality: { status: 'interpretable', flags: [] },
  itemScores: [{ itemCode: 'i1', responseValue: value, baseScore: value, score: value }],
  scores: [{
    key: 'total',
    type: 'total',
    label: '总分',
    direction: 'higher_is_more',
    canonical: true,
    displayPrecision: 0,
    value,
    range: { min: 0, max: 100 },
    expectedItems: ['i1'],
    answeredItems: ['i1'],
    status: 'calculated',
    prorated: false,
  }],
  references: [],
  interpretations: [{
    scoreKey: 'total',
    headline: value > 50 ? '较高' : '较低',
    label: value > 50 ? 'HIGH' : 'LOW',
    interpretation: value > 50 ? '高分解释' : '低分解释',
    guidance: [{ category: 'reflection', text: value > 50 ? '高分建议' : '低分建议' }],
    limitations: [],
    referenceVersion: null,
  }],
  caveats: value > 50 ? ['高分 caveat'] : ['低分 caveat'],
  disclaimer: '量表结果仅反映本次作答。',
})

const instrument = { scaleId: 'scale-1', code: 'synthetic', name: 'Synthetic', instrumentVersion: '1.0.0' }

const project = (score: number, projectionContext: ScaleProjectionContext) => projectScaleResult({
  result: result(score),
  instrument,
  completedAt: '2026-09-21T00:00:00.000Z',
  totalTime: 1000,
  context: projectionContext,
})

describe('Scale result audience projection', () => {
  it('keeps EDUCATIONAL_ONLY independent from hidden score values', () => {
    const low = project(10, context(educationalCaps))
    const high = project(90, context(educationalCaps))
    expect(low).toEqual(high)
    expect(low.kind).toBe('educational')
    expect(low).not.toHaveProperty('scores')
    expect(low).not.toHaveProperty('itemScores')
    expect(low).not.toHaveProperty('references')
    expect(low).not.toHaveProperty('interpretations')
    expect(low).not.toHaveProperty('quality')
    expect(low).not.toHaveProperty('method')
    expect(JSON.stringify(low)).not.toMatch(/HIGH|LOW|高分|低分/)
  })

  it('intersects resource access with the instrument ceiling', () => {
    const output = project(90, context(fullCaps, DISCLOSURE_PRESETS.SCORES()))
    expect(output.kind).toBe('scores')
    expect(output).toHaveProperty('scores')
    expect(output).not.toHaveProperty('itemScores')
    expect(output).not.toHaveProperty('references')
    expect(output).not.toHaveProperty('interpretations')
  })

  it('keeps interpretation text while replacing score-derived labels with static renderer-safe values', () => {
    const noLabels = { ...fullCaps, scoreDerivedLabels: false }
    const output = project(90, context(noLabels))
    expect(output.kind).toBe('full')
    if (output.kind !== 'full') throw new Error('expected full report')
    expect(output.interpretations?.[0]).toMatchObject({
      headline: '结果说明',
      label: null,
      interpretation: '高分解释',
    })
    expect(JSON.stringify(output)).not.toContain('HIGH')
    expect(JSON.stringify(output)).not.toContain('较高')
  })

  it('does not let COHORT_ONLY return an individual report', () => {
    const projectionContext = context(fullCaps)
    projectionContext.relationalDisposition = 'COHORT_ONLY'
    expect(project(90, projectionContext)).toMatchObject({ kind: 'completion' })
  })

  it('fails closed for an unknown frozen policy', () => {
    const projectionContext = context(fullCaps)
    projectionContext.frozenPolicy = {
      disposition: 'UNKNOWN',
      disclosure: { schemaVersion: 1, policyVersion: 'unknown', audiences: {}, unknownAudience: 'DENY' },
    }
    expect(project(90, projectionContext)).toMatchObject({ kind: 'unavailable', reason: 'POLICY_UNAVAILABLE' })
  })

  it('never emits raw answers through FULL_REPORT even when item scores are allowed', () => {
    const output = project(90, context(fullCaps))
    expect(output.kind).toBe('full')
    if (output.kind !== 'full') throw new Error('expected full report')
    expect(JSON.stringify(output)).not.toContain('answers')
    expect(output).toHaveProperty('itemScores')
    expect(output.itemScores?.[0]).toEqual({ itemCode: 'i1', baseScore: 90, score: 90 })
    expect(output.itemScores?.[0]).not.toHaveProperty('responseValue')
  })
})
