import { describe, expect, it } from 'vitest'
import { evaluateResearchGradeReadiness } from '../../modules/scale/library/research-readiness'
import type { ScaleEvidenceRecord } from '../../modules/scale/library/catalog-manifest'

const evidence = (overrides: Partial<ScaleEvidenceRecord> & { evidenceId: string; evidenceType: ScaleEvidenceRecord['evidenceType'] }): ScaleEvidenceRecord => ({
  population: '中国大陆青少年样本',
  locale: 'zh-CN',
  territory: 'CN',
  studyDesign: '横断面验证',
  rating: 'SUFFICIENT',
  citation: '示例文献',
  ...overrides,
})

const deployment = { locale: 'zh-CN', territory: 'CN' }

describe('Research-grade readiness review (SL2-C5)', () => {
  it('returns READY when every required dimension for the declared uses is sufficiently evidenced', () => {
    const decision = evaluateResearchGradeReadiness({
      intendedUses: ['RESEARCH'],
      deployment,
      evidence: [
        evidence({ evidenceId: 'e-structural', evidenceType: 'STRUCTURAL_VALIDITY' }),
        evidence({ evidenceId: 'e-internal', evidenceType: 'INTERNAL_CONSISTENCY' }),
      ],
    })
    expect(decision.status).toBe('READY')
    expect(decision.gaps).toHaveLength(0)
    expect(decision.evidenceRefs).toEqual(expect.arrayContaining(['e-structural', 'e-internal']))
  })

  it('returns PARTIAL when only some required dimensions are evidenced', () => {
    const decision = evaluateResearchGradeReadiness({
      intendedUses: ['RESEARCH'],
      deployment,
      evidence: [evidence({ evidenceId: 'e-internal', evidenceType: 'INTERNAL_CONSISTENCY' })],
    })
    expect(decision.status).toBe('PARTIAL')
    expect(decision.gaps.some((gap) => gap.includes('STRUCTURAL_VALIDITY'))).toBe(true)
    expect(decision.strengths.some((strength) => strength.includes('INTERNAL_CONSISTENCY'))).toBe(true)
  })

  it('returns NOT_ESTABLISHED with empty evidence', () => {
    const decision = evaluateResearchGradeReadiness({ intendedUses: ['RESEARCH'], deployment, evidence: [] })
    expect(decision.status).toBe('NOT_ESTABLISHED')
    expect(decision.strengths).toHaveLength(0)
  })

  it('applies NOT_APPLICABLE logic: one-time educational description does not demand responsiveness (§23)', () => {
    const decision = evaluateResearchGradeReadiness({
      intendedUses: ['INDIVIDUAL_REFLECTION'],
      deployment,
      evidence: [
        evidence({ evidenceId: 'e-content', evidenceType: 'CONTENT_VALIDITY' }),
        evidence({ evidenceId: 'e-internal', evidenceType: 'INTERNAL_CONSISTENCY' }),
      ],
    })
    expect(decision.status).toBe('READY')
    expect(decision.gaps.some((gap) => gap.includes('RESPONSIVENESS'))).toBe(false)
    expect(decision.gaps.some((gap) => gap.includes('MEASUREMENT_INVARIANCE'))).toBe(false)
  })

  it('requires responsiveness when progress monitoring is the declared use', () => {
    const decision = evaluateResearchGradeReadiness({
      intendedUses: ['PROGRESS_MONITORING'],
      deployment,
      evidence: [evidence({ evidenceId: 'e-content', evidenceType: 'CONTENT_VALIDITY' })],
    })
    expect(decision.status).toBe('NOT_ESTABLISHED')
    expect(decision.gaps.some((gap) => gap.includes('RESPONSIVENESS'))).toBe(true)
    expect(decision.gaps.some((gap) => gap.includes('TEST_RETEST'))).toBe(true)
  })

  it('counts only SUFFICIENT required evidence and caps MIXED evidence at PARTIAL', () => {
    const mixedOnly = evaluateResearchGradeReadiness({
      intendedUses: ['RESEARCH'],
      deployment,
      evidence: [
        evidence({ evidenceId: 'e-structural', evidenceType: 'STRUCTURAL_VALIDITY', rating: 'MIXED' }),
        evidence({ evidenceId: 'e-internal', evidenceType: 'INTERNAL_CONSISTENCY', rating: 'MIXED' }),
      ],
    })
    expect(mixedOnly.status).toBe('PARTIAL')
    expect(mixedOnly.strengths).toHaveLength(0)
    expect(mixedOnly.gaps.filter((gap) => gap.includes('MIXED'))).toHaveLength(2)

    const sufficientWithMixed = evaluateResearchGradeReadiness({
      intendedUses: ['RESEARCH'],
      deployment,
      evidence: [
        evidence({ evidenceId: 'e-structural', evidenceType: 'STRUCTURAL_VALIDITY', rating: 'SUFFICIENT' }),
        evidence({ evidenceId: 'e-structural-caveat', evidenceType: 'STRUCTURAL_VALIDITY', rating: 'MIXED' }),
        evidence({ evidenceId: 'e-internal', evidenceType: 'INTERNAL_CONSISTENCY', rating: 'SUFFICIENT' }),
      ],
    })
    expect(sufficientWithMixed.status).toBe('PARTIAL')
    expect(sufficientWithMixed.gaps.some((gap) => gap.includes('MIXED'))).toBe(true)

    const insufficient = evaluateResearchGradeReadiness({
      intendedUses: ['RESEARCH'],
      deployment,
      evidence: [
        evidence({ evidenceId: 'e-structural', evidenceType: 'STRUCTURAL_VALIDITY', rating: 'SUFFICIENT' }),
        evidence({ evidenceId: 'e-internal', evidenceType: 'INTERNAL_CONSISTENCY', rating: 'INSUFFICIENT' }),
      ],
    })
    expect(insufficient.status).toBe('PARTIAL')
    expect(insufficient.gaps.some((gap) => gap.includes('INSUFFICIENT'))).toBe(true)
  })

  it('does not satisfy required evidence from the wrong locale', () => {
    const decision = evaluateResearchGradeReadiness({
      intendedUses: ['RESEARCH'],
      deployment,
      evidence: [
        evidence({ evidenceId: 'e-structural-en', evidenceType: 'STRUCTURAL_VALIDITY', locale: 'en' }),
        evidence({ evidenceId: 'e-internal-cn', evidenceType: 'INTERNAL_CONSISTENCY' }),
      ],
    })

    expect(decision.status).toBe('PARTIAL')
    expect(decision.evidenceRefs).not.toContain('e-structural-en')
    expect(decision.gaps.some((gap) => gap.includes('STRUCTURAL_VALIDITY') && gap.includes('locale=zh-CN'))).toBe(true)
  })

  it('does not satisfy required evidence from the wrong territory', () => {
    const decision = evaluateResearchGradeReadiness({
      intendedUses: ['RESEARCH'],
      deployment,
      evidence: [
        evidence({ evidenceId: 'e-structural-gb', evidenceType: 'STRUCTURAL_VALIDITY', territory: 'GB' }),
        evidence({ evidenceId: 'e-internal-cn', evidenceType: 'INTERNAL_CONSISTENCY' }),
      ],
    })

    expect(decision.status).toBe('PARTIAL')
    expect(decision.evidenceRefs).not.toContain('e-structural-gb')
    expect(decision.gaps.some((gap) => gap.includes('STRUCTURAL_VALIDITY') && gap.includes('territory=CN'))).toBe(true)
  })

  it('handles NOT_ESTABLISHED for no declared intended use', () => {
    const decision = evaluateResearchGradeReadiness({ intendedUses: [], deployment, evidence: [] })
    expect(decision.status).toBe('NOT_ESTABLISHED')
    expect(decision.gaps[0]).toContain('intended use')
  })

  it('is a non-blocking read model: output carries only status/strengths/gaps/evidenceRefs', () => {
    const decision = evaluateResearchGradeReadiness({ intendedUses: ['SCREENING'], deployment, evidence: [] })
    expect(Object.keys(decision).sort()).toEqual(['evidenceRefs', 'gaps', 'status', 'strengths'])
    expect(decision.status).toBe('NOT_ESTABLISHED')
  })
})
