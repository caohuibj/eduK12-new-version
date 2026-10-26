import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/chime_s24_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const code = (n: number) => `CHIMES_${String(n).padStart(2, '0')}`
const keys = ['external_awareness', 'internal_awareness', 'acting_awareness', 'thoughts_relativity', 'insightful_understanding', 'nonjudgmental_acceptance', 'nonreactive_decentering', 'openness']
const allKeys = [...keys, 'total']
const reversed = [8, 9, 22, 23, 24]
const allThree: ScaleAnswer[] = Array.from({ length: 24 }, (_, i) => ({ itemCode: code(i + 1), responseValue: '3' }))
const result = (answers: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-chimes24', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers })

describe('CHIME-S24 exact 2024 S1 independent Chinese working version', () => {
  it('validates the complete short form and remains a distinct draft candidate', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'chime_s24_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.scientificReview).toBeUndefined()
    expect(d.items.map(x => x.itemCode)).toEqual(Array.from({ length: 24 }, (_, i) => code(i + 1)))
    expect(d.items.every(x => !x.required && !x.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets[0].options.map(x => x.label)).toEqual(['几乎从不', '很少', '较少', '较常', '经常', '几乎总是'])
    expect(d.responseSets[0].options.map(x => [x.value, x.score])).toEqual([1, 2, 3, 4, 5, 6].map(n => [String(n), n]))
  })
  it('retains all eight three-item facets, five reverse keys and the permitted whole-scale mean', () => {
    expect(d.scoring.itemRules.filter(r => r.transform.type === 'reverse').map(r => r.itemCode)).toEqual(reversed.map(code))
    expect(d.scoring.scores.map(s => s.key)).toEqual(allKeys)
    expect(d.scoring.scores.slice(0, 8).map(s => s.source.type === 'items' ? s.source.items.map(i => i.itemCode) : [])).toEqual(keys.map((_, i) => [i * 3 + 1, i * 3 + 2, i * 3 + 3].map(code)))
    expect(d.scoring.scores.every(s => s.source.type === 'items' && s.source.aggregation === 'mean')).toBe(true)
    expect(d.scoring.scores.filter(s => s.type === 'total').map(s => s.key)).toEqual(['total'])
    expect(d.scoring.scores.at(-1)?.source).toEqual({ type: 'items', items: Array.from({ length: 24 }, (_, i) => ({ itemCode: code(i + 1), weight: 1 })), aggregation: 'mean' })
    expect(d.scoring.scores.every(s => s.missingPolicy?.type === 'complete_required')).toBe(true)
    expect(d.referencePolicy).toEqual({ type: 'none' })
  })
  for (const fixture of pkg.goldenCases) it(`matches independently calculated fixture: ${fixture.name}`, () => {
    const actual = scoreScale(d, fixture.answers)
    expect(actual.quality.status).toBe(fixture.expected.quality)
    expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
    expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    expect(actual.scores.every(s => s.range?.min === 1 && s.range.max === 6)).toBe(true)
  })
  it('distinguishes raw response extremes from transformed minimum and maximum', () => {
    expect(scoreScale(d, allThree.map(x => ({ ...x, responseValue: '1' }))).scores.map(s => s.value)).toEqual([1, 1, 13 / 3, 1, 1, 1, 1, 6, 49 / 24])
    expect(scoreScale(d, allThree.map(x => ({ ...x, responseValue: '6' }))).scores.map(s => s.value)).toEqual([6, 6, 8 / 3, 6, 6, 6, 6, 1, 119 / 24])
  })
  it('changes only the owning facet and total, with the exact reverse direction', () => {
    const baseline = scoreScale(d, allThree).scores.map(s => s.value!)
    for (let n = 1; n <= 24; n++) {
      const actual = scoreScale(d, allThree.map(x => x.itemCode === code(n) ? { ...x, responseValue: '6' } : x)).scores
      const delta = reversed.includes(n) ? -3 : 3
      for (let j = 0; j < 8; j++) expect(actual[j].value).toBeCloseTo(baseline[j] + (Math.floor((n - 1) / 3) === j ? delta / 3 : 0), 12)
      expect(actual[8].value).toBeCloseTo(baseline[8] + delta / 24, 12)
    }
  })
  it('does not insert a zero or prorate omitted items; missing facet and total become null', () => {
    const r = result(allThree.filter(x => x.itemCode !== code(8)))
    expect(r.quality.status).toBe('invalid')
    expect(r.itemScores).toHaveLength(23)
    expect(r.scores.filter(s => s.value === null).map(s => s.key)).toEqual(['acting_awareness', 'total'])
    expect(r.scores.every(s => !s.prorated)).toBe(true)
    expect(r.interpretations).toEqual([])
    expect(result([]).scores.every(s => s.value === null)).toBe(true)
  })
  it('rejects illegal options, duplicates and unknown item codes', () => {
    for (const value of ['0', '7', '', 'bad', 2.5, Number.NaN]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...allThree.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...allThree, allThree[0]])).toThrow('量表回答不合法')
    expect(() => result([...allThree, { itemCode: code(25), responseValue: '3' }])).toThrow('量表回答不合法')
  })
  it('enforces the conservative adult boundary and does not allow missing age', () => {
    const eligibility = (ageMonths?: number, respondentType: 'SELF' | 'TEACHER' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(eligibility(215).outcome).toBe('INELIGIBLE')
    expect(eligibility(216).outcome).toBe('ELIGIBLE')
    expect(eligibility(900).outcome).toBe('ELIGIBLE')
    expect(eligibility().outcome).toBe('INDETERMINATE')
    expect(eligibility(360, 'TEACHER').outcome).toBe('INELIGIBLE')
  })
  it('builds nine readable real interpretations without thresholds or foreign norms', () => {
    for (const fixture of pkg.goldenCases.filter(f => f.expected.quality === 'interpretable')) {
      const r = parseScaleResultV2(result(fixture.answers))
      expect(r.interpretations).toHaveLength(9)
      expect(r.interpretations.every(i => i.label === null && i.referenceVersion === null && i.guidance.length === 2 && i.interpretation.length >= 100)).toBe(true)
      expect(r.references).toEqual([])
      expect(r.method).toMatchObject({ instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', localizationVersion: '1.0.0', referenceVersions: [] })
      expect(r.scores[8].value).toBeCloseTo(r.scores.slice(0, 8).reduce((sum, s) => sum + s.value!, 0) / 8, 12)
    }
    expect(d.report.primaryScoreKeys).toEqual(allKeys)
    expect(d.report.interpretations.every(i => i.summary.length >= 100 && i.bands.length === 0 && i.source.type === 'score_only')).toBe(true)
    expect(d.report.interpretations.map(i => i.summary).join('')).not.toMatch(/百分位|高于常模|治愈|疗效保证|CFA|Cronbach/)
  })
  it('preserves independent version axes without letting catalog facts alter executable content', () => {
    expect(d.versionAxes).toMatchObject({ subjectKey: 'chime_s24', locale: 'zh-CN', localizationVersion: '1.0.0' })
    const hash = hashScaleDefinition(d), changed = structuredClone(source)
    changed.catalog.construct.constructOverlapTags.push('新检索词')
    expect(hashScaleDefinition(projectScalePackage(changed)!.definition)).toBe(hash)
    const newReport = structuredClone(d); newReport.report.reportVersion = '1.0.1'
    expect(newReport.scoring.scoringVersion).toBe('1.0.0')
    expect(hashScaleDefinition(newReport)).toBe(hash)
    const newContent = structuredClone(d); newContent.items[0].content += "（修订）"
    expect(hashScaleDefinition(newContent)).not.toBe(hash)
    expect(d.report.reportVersion).toBe('1.0.0')
    expect(source.identity.instrumentKey).not.toMatch(/ffmq|chime_xs/)
  })
  it('keeps permission, source-language evidence and pending Chinese validation explicit', () => {
    expect(source.localization).toMatchObject({ sourceLocale: 'en', targetLocale: 'zh-CN', expertReviewStatus: 'PENDING', localEvidenceRefs: [] })
    expect(source.catalog.evidence.every(e => e.locale === 'en')).toBe(true)
    expect(source.catalog.construct.constructOverlapTags.length).toBeGreaterThanOrEqual(40)
    for (const axis of ['domain', 'construct', 'orientation', 'population', 'response', 'use', 'license', 'language_validation']) expect(source.catalog.construct.constructOverlapTags.some(t => t.startsWith(axis + ':'))).toBe(true)
    expect(d.license).toMatchObject({ status: 'verified', redistribution: 'allowed' })
    expect(d.license.note).toContain('CC BY 4.0')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(source.catalog.administration.layoutConstraints.join('')).toContain('原作者缺失规则')
  })
})
