import { describe, expect, it } from 'vitest'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { evaluateScaleSourceScientificQualification, scaleScientificReviewScopeHash } from '../../modules/scale/library/scientific-qualification'
import { previewScaleInstrument } from '../../modules/scale/onboarding/preview'
import { compileScalePolicy } from '../../modules/scale/policy/compile'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { scoreScale } from '../../modules/scale/scale-scoring'

const fixture = () => {
  const source = structuredClone(getScaleInstrumentSource('who5', '1.0.0')!)
  source.catalog.intendedUse.intendedUses = [{ use: 'RESEARCH', evidenceStatus: 'SUPPORTED' }]
  const base = source.catalog.evidence[0]
  source.catalog.evidence = ['STRUCTURAL_VALIDITY', 'INTERNAL_CONSISTENCY'].map((type, i) => ({ ...base, evidenceId: `review-${i}`, evidenceType: type as 'STRUCTURAL_VALIDITY' | 'INTERNAL_CONSISTENCY', rating: 'SUFFICIENT' }))
  source.scientificReview = { schemaVersion: 1, reviewer: 'reviewer@example.test', reviewedAt: '2026-09-22T00:00:00Z', approvedMaturity: 'RESEARCH_GRADE', territory: 'CN', intendedUses: ['RESEARCH'], evidenceIds: source.catalog.evidence.map(row => row.evidenceId), scopeHash: '0'.repeat(64) }
  source.scientificReview.scopeHash = scaleScientificReviewScopeHash(source)
  return source
}

describe('single scoped scientific qualification authority', () => {
  it('promotes with reviewed evidence without changing runtime, definition or scoring', () => {
    const source = fixture()
    const runtime = compileScalePolicy(source).runtimePolicyHash
    const definition = hashScaleDefinition(source.executable!.definition)
    const golden = scoreScale(source.executable!.definition, source.executable!.goldenCases[0].answers)
    expect(evaluateScaleSourceScientificQualification(source).maxEligibleMaturity).toBe('RESEARCH_GRADE')
    source.catalog.scientificMaturity = 'RESEARCH_GRADE'
    expect(compileScalePolicy(source).runtimePolicyHash).toBe(runtime)
    expect(hashScaleDefinition(source.executable!.definition)).toBe(definition)
    expect(scoreScale(source.executable!.definition, source.executable!.goldenCases[0].answers)).toEqual(golden)
    source.scientificReview!.approvedMaturity = 'RESEARCH_READY'
    expect(evaluateScaleSourceScientificQualification(source).maxEligibleMaturity).toBe('RESEARCH_READY')
    delete source.scientificReview
    expect(evaluateScaleSourceScientificQualification(source).maxEligibleMaturity).toBe('PILOT')
  })
  it('rejects stale reviews, missing evidence, wrong locale and unreviewed supported uses', () => {
    for (const change of [
      (s: ReturnType<typeof fixture>) => { s.catalog.population.minAge = 5 },
      (s: ReturnType<typeof fixture>) => { s.catalog.evidence[0].citation += ' revised' },
      (s: ReturnType<typeof fixture>) => { s.executable!.definition.items[0].text += ' changed' },
    ]) {
      const source = fixture(); change(source)
      expect(evaluateScaleSourceScientificQualification(source).researchReady.blockers).toContain('SCIENTIFIC_REVIEW_STALE')
    }
    const missing = fixture(); missing.scientificReview!.evidenceIds.push('missing'); missing.scientificReview!.scopeHash = scaleScientificReviewScopeHash(missing)
    expect(evaluateScaleSourceScientificQualification(missing).researchReady.eligible).toBe(false)
    const wrong = fixture(); wrong.catalog.evidence[0].locale = 'en'; wrong.scientificReview!.scopeHash = scaleScientificReviewScopeHash(wrong)
    expect(evaluateScaleSourceScientificQualification(wrong).researchReady.eligible).toBe(false)
    const uses = fixture(); uses.catalog.intendedUse.intendedUses.push({ use: 'SCREENING', evidenceStatus: 'SUPPORTED' })
    expect(evaluateScaleSourceScientificQualification(uses).researchReady.eligible).toBe(false)
  })
  it('does not apply a reviewed research claim to a different deployment territory', () => {
    const source = fixture(); source.catalog.scientificMaturity = 'RESEARCH_GRADE'
    const preview = previewScaleInstrument({ source, authorizations: [], locale: 'zh-CN', territory: 'US', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'] })
    expect(preview.blockers).toContain('SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH')
  })
  it('cannot earn grade through titles or reference pointers without use-specific sufficient evidence', () => {
    const source = fixture(); source.catalog.evidence[0].rating = 'INSUFFICIENT'
    source.scientificReview!.scopeHash = scaleScientificReviewScopeHash(source)
    const decision = evaluateScaleSourceScientificQualification(source)
    expect(decision.researchReady.eligible).toBe(true)
    expect(decision.researchGrade.eligible).toBe(false)
    expect(decision.researchGrade.blockers.join(' ')).toContain('STRUCTURAL_VALIDITY')
  })
})
