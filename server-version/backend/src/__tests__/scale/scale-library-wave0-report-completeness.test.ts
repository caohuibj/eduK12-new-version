import { describe, expect, it } from 'vitest'
import { buildScaleResult } from '../../modules/scale/scale-result'
import { listScalePackages } from '../../modules/scale/scale-package.registry'

const scopedKeys = new Set([
  'adexi_v1',
  'who5',
  'sdq_parent_zh_cn',
  'sdq_teacher_zh_cn',
  'texi_parent_zh_cn',
  'texi_teacher_zh_cn',
])

describe('Wave 0 scale report completeness', () => {
  it('keeps every scoped package scoreable with a complete descriptive report', () => {
    const packages = listScalePackages().filter((pkg) => scopedKeys.has(pkg.key))
    expect(packages).toHaveLength(6)

    for (const pkg of packages) {
      const fixture = pkg.goldenCases.find((candidate) => candidate.expected.quality === 'interpretable')
      expect(fixture, `${pkg.key} needs an interpretable golden case`).toBeTruthy()
      const result = buildScaleResult({
        scaleId: `wave0-${pkg.key}`,
        instrumentKey: pkg.key,
        name: pkg.definition.source.title ?? pkg.key,
        instrumentVersion: pkg.instrumentVersion,
        definition: pkg.definition,
        answers: fixture!.answers,
        referenceSets: pkg.references,
      })

      expect(result.quality.status, pkg.key).toBe('interpretable')
      expect(result.scores, pkg.key).toHaveLength(pkg.definition.scoring.scores.length)
      expect(result.interpretations, pkg.key).toHaveLength(pkg.definition.scoring.scores.length)
      expect(result.interpretations.every((interpretation) => (
        interpretation.headline.trim().length > 0
        && interpretation.interpretation.trim().length > 0
        && interpretation.guidance.length > 0
        && interpretation.limitations.length > 0
      )), pkg.key).toBe(true)
      expect(pkg.definition.report.limitations.length, pkg.key).toBeGreaterThan(0)
      expect(pkg.definition.report.disclaimer.trim().length, pkg.key).toBeGreaterThan(0)
      expect(pkg.definition.source.citation?.trim().length, pkg.key).toBeGreaterThan(0)
      expect(pkg.definition.referencePolicy.type, pkg.key).toBe('none')
      expect(result.references, pkg.key).toHaveLength(0)
      expect(result.caveats, pkg.key).toContain('未提供群体参考。')
      expect(result.method.reportVersion, pkg.key).toBe(pkg.definition.report.reportVersion)
    }
  })
})
