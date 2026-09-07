import { describe, expect, it } from 'vitest'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../modules/scale/scale-package.registry'
import { evaluateReportEligibility } from '../../modules/scale/library/report-eligibility'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'
import type { AssessmentReferenceSetDefinition } from '../../modules/assessment-reference/reference'

const who5 = WHO5_ZH_CN_V1_PACKAGE

const pilotReference = (evidenceLevel: 'local_pilot' | 'literature_beta'): AssessmentReferenceSetDefinition => ({
  schemaVersion: 1,
  instrumentType: 'scale',
  instrumentKey: 'who5',
  referenceVersion: 'who5-pilot-cn-v1',
  status: 'ACTIVE',
  entries: [{
    scoreKey: 'raw_total',
    referenceKind: 'normative_distribution',
    evidenceLevel,
    provenanceType: 'local_observed',
    instrumentVersion: '1.0.0',
    scoringVersion: '1.0.0',
    population: { description: 'eduK12 本地试行样本' },
    source: { citation: 'eduK12 PILOT 本地试行数据, 2026' },
    statistics: { mean: 12, sd: 4 },
  }],
})

const declaredDefinition = (evidenceLevel: 'local_pilot' | 'literature_beta') => ({
  ...who5.definition,
  referencePolicy: {
    type: 'declared' as const,
    selections: [{ scoreKey: 'raw_total', referenceVersion: 'who5-pilot-cn-v1', referenceKind: 'normative_distribution' as const }],
  },
})

const manifestWithMaturity = (maturity: 'PILOT' | 'RESEARCH_GRADE') => {
  const result = parseScaleCatalogManifest({ ...validCatalogManifestBase(), scientificMaturity: maturity })
  if (!result.ok) throw new Error('fixture manifest should parse')
  return result.manifest
}

describe('Pilot report / claim eligibility (SL2-C4)', () => {
  it('Case A: PILOT with no reference → full descriptive report allowed, L3 blocked, no fabricated percentile', () => {
    const decision = evaluateReportEligibility({
      definition: who5.definition,
      references: who5.references,
      instrumentKey: who5.key,
      instrumentVersion: who5.instrumentVersion,
      scoringVersion: who5.definition.scoring.scoringVersion,
    })
    expect(decision.levels.L1_SCORE_ONLY.eligible).toBe(true)
    expect(decision.levels.L2_DESCRIPTIVE.eligible).toBe(true)
    expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(false)
    expect(decision.levels.L3_REFERENCED_INTERPRETIVE.reasons.some((reason) => reason.includes('referencePolicy'))).toBe(true)
    expect(decision.maxEligibleLevel).toBe('L2_DESCRIPTIVE')
    expect(decision.forbiddenClaims).toContain('全国常模')
  })

  it('Case B: PILOT + valid local_pilot reference → L3 eligible with mandatory pilot wording', () => {
    const decision = evaluateReportEligibility({
      definition: declaredDefinition('local_pilot'),
      references: [pilotReference('local_pilot')],
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      scoringVersion: '1.0.0',
    })
    expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(true)
    expect(decision.pilotWordingRequired).toBe(true)
    expect(decision.requiredReferenceWording[0]).toContain('试行参考')
  })

  it('locks pilot wording for literature_beta references too', () => {
    const decision = evaluateReportEligibility({
      definition: declaredDefinition('literature_beta'),
      references: [pilotReference('literature_beta')],
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      scoringVersion: '1.0.0',
    })
    expect(decision.pilotWordingRequired).toBe(true)
  })

  it('Case C: PILOT + reference population mismatch → governance-level L3 block', () => {
    const manifest = manifestWithMaturity('PILOT')
    const decision = evaluateReportEligibility({
      definition: declaredDefinition('local_pilot'),
      references: [pilotReference('local_pilot')],
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      scoringVersion: '1.0.0',
      deployment: { territory: 'CN', respondent: 'SELF' },
      catalogReferenceApplicability: [{
        ...manifest.referenceApplicability[0],
        referenceVersion: 'who5-pilot-cn-v1',
        referenceKind: 'normative_distribution',
        territory: 'UK',
        respondent: 'TEACHER',
      }],
    })
    expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(false)
    expect(decision.levels.L3_REFERENCED_INTERPRETIVE.reasons.some((reason) => reason.includes('UK/TEACHER'))).toBe(true)
  })

  it('any matching applicability record prevents a conflict when multiple records exist', () => {
    const manifest = manifestWithMaturity('PILOT')
    const applicabilityBase = manifest.referenceApplicability[0]
    const decision = evaluateReportEligibility({
      definition: declaredDefinition('local_pilot'),
      references: [pilotReference('local_pilot')],
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      scoringVersion: '1.0.0',
      deployment: { territory: 'CN', respondent: 'SELF' },
      catalogReferenceApplicability: [
        { ...applicabilityBase, referenceVersion: 'who5-pilot-cn-v1', referenceKind: 'normative_distribution', territory: 'UK', respondent: 'TEACHER' },
        { ...applicabilityBase, referenceVersion: 'who5-pilot-cn-v1', referenceKind: 'normative_distribution', territory: 'CN', respondent: 'SELF' },
      ],
    })
    expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(true)
  })

  it('Case D: RESEARCH_GRADE with no reference still cannot fabricate percentile', () => {
    const decision = evaluateReportEligibility({
      definition: who5.definition,
      references: who5.references,
      instrumentKey: who5.key,
      instrumentVersion: who5.instrumentVersion,
      scoringVersion: who5.definition.scoring.scoringVersion,
    })
    expect(decision.levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(false)
  })

  it('report levels are not bound to maturity: identical eligibility for PILOT and RESEARCH_GRADE manifests', () => {
    const evaluateFor = (maturity: 'PILOT' | 'RESEARCH_GRADE') => {
      // maturity 只存在于 catalog manifest；eligibility evaluator 不接收 maturity 输入
      manifestWithMaturity(maturity)
      return evaluateReportEligibility({
        definition: who5.definition,
        references: who5.references,
        instrumentKey: who5.key,
        instrumentVersion: who5.instrumentVersion,
        scoringVersion: who5.definition.scoring.scoringVersion,
      })
    }
    const pilot = evaluateFor('PILOT')
    const research = evaluateFor('RESEARCH_GRADE')
    expect(pilot.levels).toEqual(research.levels)
    expect(pilot.maxEligibleLevel).toBe(research.maxEligibleLevel)
  })

  it('all six maturity × level combinations are representable', () => {
    const noRef = who5.definition
    const withRef = declaredDefinition('local_pilot')
    const refs = [pilotReference('local_pilot')]
    for (const maturity of ['PILOT', 'RESEARCH_GRADE'] as const) {
      manifestWithMaturity(maturity)
      // PILOT/RESEARCH_GRADE + L1（no reference）
      expect(evaluateReportEligibility({
        definition: noRef, references: [], instrumentKey: 'who5', instrumentVersion: '1.0.0', scoringVersion: '1.0.0',
      }).levels.L1_SCORE_ONLY.eligible).toBe(true)
      // maturity + L2
      expect(evaluateReportEligibility({
        definition: noRef, references: [], instrumentKey: 'who5', instrumentVersion: '1.0.0', scoringVersion: '1.0.0',
      }).levels.L2_DESCRIPTIVE.eligible).toBe(true)
      // maturity + L3（with local_pilot reference）
      expect(evaluateReportEligibility({
        definition: withRef, references: refs, instrumentKey: 'who5', instrumentVersion: '1.0.0', scoringVersion: '1.0.0',
      }).levels.L3_REFERENCED_INTERPRETIVE.eligible).toBe(true)
    }
  })

  it('locks PILOT full-report minimum capability on a real package (Gate A: prove, not re-implement)', () => {
    const manifest = manifestWithMaturity('PILOT')
    const report = who5.definition.report
    // runtime 报告契约已具备：主分数、解释、限制、免责声明全部存在
    expect(who5.definition.scoring.scores.length).toBeGreaterThanOrEqual(1)
    expect(report.primaryScoreKeys.length).toBeGreaterThanOrEqual(1)
    expect(report.interpretations.length).toBeGreaterThanOrEqual(1)
    expect(report.interpretations[0].summary.length).toBeGreaterThan(0)
    expect(report.disclaimer.length).toBeGreaterThan(0)
    expect(who5.definition.report.limitations.length).toBeGreaterThan(0)
    // 治理层确认 PILOT 不降级为 raw-only
    const decision = evaluateReportEligibility({
      definition: who5.definition,
      references: who5.references,
      instrumentKey: who5.key,
      instrumentVersion: who5.instrumentVersion,
      scoringVersion: who5.definition.scoring.scoringVersion,
    })
    expect(decision.maxEligibleLevel).toBe('L2_DESCRIPTIVE')
    expect(manifest.scientificMaturity).toBe('PILOT')
  })
})
