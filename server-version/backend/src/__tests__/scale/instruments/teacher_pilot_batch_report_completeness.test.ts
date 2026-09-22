import { describe, expect, it } from 'vitest'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { SCALE_INSTRUMENT_SOURCE as TSWQ } from '../../../modules/scale/instruments/tswq_en/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as CBI } from '../../../modules/scale/instruments/cbi_en/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as HSE } from '../../../modules/scale/instruments/hse_msit_en/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as COPSOQ_JS } from '../../../modules/scale/instruments/copsoq3_job_satisfaction_en/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as JCQ } from '../../../modules/scale/instruments/jcq_en/1.0.0/instrument'

const sources = [TSWQ, CBI, HSE, COPSOQ_JS, JCQ]

describe('Teacher PILOT Batch 1 report completeness', () => {
  it('keeps every new exact identity at PILOT without a fabricated scientific review', () => {
    for (const source of sources) {
      expect(source.catalog.scientificMaturity, source.identity.instrumentKey).toBe('PILOT')
      expect(source.scientificReview, source.identity.instrumentKey).toBeUndefined()
      expect(source.executable?.releaseStatus, source.identity.instrumentKey).toBe('PUBLISHED')
    }
  })

  it('produces a complete descriptive report for every score', () => {
    for (const source of sources) {
      const pkg = projectScalePackage(source)!
      const fixture = pkg.goldenCases.find(row => row.expected.quality === 'interpretable')
      expect(fixture, source.identity.instrumentKey).toBeTruthy()

      const result = buildScaleResult({
        scaleId: `teacher-pilot-${source.identity.instrumentKey}`,
        instrumentKey: source.identity.instrumentKey,
        name: source.catalog.identity.canonicalName,
        instrumentVersion: source.identity.instrumentVersion,
        definition: pkg.definition,
        answers: fixture!.answers,
        referenceSets: pkg.references,
      })

      expect(result.quality.status, source.identity.instrumentKey).toBe('interpretable')
      expect(result.scores, source.identity.instrumentKey).toHaveLength(pkg.definition.scoring.scores.length)
      expect(result.interpretations, source.identity.instrumentKey).toHaveLength(pkg.definition.scoring.scores.length)
      expect(result.interpretations.every(row => (
        row.headline.trim().length > 0
        && row.interpretation.trim().length > 0
        && row.guidance.length >= 2
        && row.guidance.every(item => item.text.trim().length > 0)
        && row.limitations.length >= 2
      )), source.identity.instrumentKey).toBe(true)
      expect(pkg.definition.report.limitations.length, source.identity.instrumentKey).toBeGreaterThanOrEqual(2)
      expect(pkg.definition.report.disclaimer.trim().length, source.identity.instrumentKey).toBeGreaterThan(20)
      expect(pkg.definition.source.citation?.trim().length, source.identity.instrumentKey).toBeGreaterThan(20)
      expect(pkg.definition.referencePolicy.type, source.identity.instrumentKey).toBe('none')
      expect(result.references, source.identity.instrumentKey).toHaveLength(0)
      expect(result.caveats, source.identity.instrumentKey).toContain('未提供群体参考。')
    }
  })
})
