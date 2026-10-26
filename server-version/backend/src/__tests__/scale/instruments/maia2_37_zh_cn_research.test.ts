import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/maia2_37_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const keys = ['noticing', 'not_distracting', 'not_worrying', 'attention_regulation', 'emotional_awareness', 'self_regulation', 'body_listening', 'trusting']
const groups = [[1, 2, 3, 4], [5, 6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20, 21, 22], [23, 24, 25, 26, 27], [28, 29, 30, 31], [32, 33, 34], [35, 36, 37]]
const reversed = [5, 6, 7, 8, 9, 10, 11, 12, 15]
const code = (n: number) => `MAIA2_${String(n).padStart(2, '0')}`
const allTwo: ScaleAnswer[] = Array.from({ length: 37 }, (_, i) => ({ itemCode: code(i + 1), responseValue: '2' }))
const result = (answers: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-maia2-37', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers })

describe('MAIA-2 adult 37-item fixed 2018 Table2 independent Chinese derivative', () => {
  it('validates a distinct complete DRAFT/CANDIDATE with locked order and original response values', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'maia2_37_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.scientificReview).toBeUndefined()
    expect(d.items.map(x => x.itemCode)).toEqual(Array.from({ length: 37 }, (_, i) => code(i + 1)))
    expect(d.items.every(x => !x.required && !x.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets[0].options.map(o => [o.value, o.score, o.label])).toEqual([0, 1, 2, 3, 4, 5].map(n => [String(n), n, n === 0 ? '从不' : n === 5 ? '总是' : String(n)]))
    expect(d.items[8].content).not.toContain('别的')
  })
  it('preserves all nine reverse keys and 4/6/5/7/5/4/3/3 independent facet means without a total', () => {
    expect(d.scoring.itemRules.filter(r => r.transform.type === 'reverse').map(r => r.itemCode)).toEqual(reversed.map(code))
    expect(d.scoring.scores.map(s => s.key)).toEqual(keys)
    expect(d.scoring.scores.map(s => s.source.type === 'items' ? s.source.items.map(i => i.itemCode) : [])).toEqual(groups.map(g => g.map(code)))
    expect(d.scoring.scores.every(s => s.type === 'dimension' && s.source.type === 'items' && s.source.aggregation === 'mean')).toBe(true)
    expect(d.scoring.scores.every(s => s.missingPolicy?.type === 'complete_required')).toBe(true)
    expect(d.referencePolicy).toEqual({ type: 'none' })
    expect(d.report.primaryScoreKeys).toEqual(keys)
    expect(d.scoring.scores.filter(s => s.type === 'total')).toEqual([])
  })
  for (const fixture of pkg.goldenCases) it(`matches independent arithmetic: ${fixture.name}`, () => {
    const actual = scoreScale(d, fixture.answers)
    expect(actual.quality.status).toBe(fixture.expected.quality)
    expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
    // Legacy field names all output keys, including dimensions.
    expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    expect(actual.scores.every(s => s.range?.min === 0 && s.range.max === 5)).toBe(true)
    expect(actual.scores.some(s => s.type === 'total')).toBe(false)
  })
  it('does not mistake raw endpoints for reverse-transformed minimum and maximum', () => {
    expect(scoreScale(d, allTwo.map(x => ({ ...x, responseValue: '0' }))).scores.map(s => s.value)).toEqual([0, 5, 3, 0, 0, 0, 0, 0])
    expect(scoreScale(d, allTwo.map(x => ({ ...x, responseValue: '5' }))).scores.map(s => s.value)).toEqual([5, 0, 2, 5, 5, 5, 5, 5])
  })
  it('changes only the owning facet with the correct reverse direction', () => {
    const baseline = scoreScale(d, allTwo).scores.map(s => s.value!)
    for (let n = 1; n <= 37; n++) {
      const actual = scoreScale(d, allTwo.map(x => x.itemCode === code(n) ? { ...x, responseValue: '5' } : x)).scores
      for (let j = 0; j < 8; j++) expect(actual[j].value).toBeCloseTo(baseline[j] + (groups[j].includes(n) ? (reversed.includes(n) ? -3 : 3) / groups[j].length : 0), 12)
    }
  })
  it('requires each facet complete without filling missing answers and suppresses invalid-result prose', () => {
    for (const n of [1, 5, 11, 16, 23, 28, 32, 35]) {
      const r = result(allTwo.filter(x => x.itemCode !== code(n)))
      expect(r.quality.status).toBe('invalid')
      expect(r.itemScores).toHaveLength(36)
      expect(r.scores.filter(s => s.value === null).map(s => s.key)).toEqual([keys[groups.findIndex(g => g.includes(n))]])
      expect(r.scores.every(s => !s.prorated)).toBe(true)
      expect(r.interpretations).toEqual([])
    }
    expect(result([]).scores.every(s => s.value === null)).toBe(true)
  })
  it('rejects invalid options, duplicate answers and unknown items', () => {
    for (const value of ['-1', '6', '', 'bad', 2.5, Number.NaN]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...allTwo.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...allTwo, allTwo[0]])).toThrow('量表回答不合法')
    expect(() => result([...allTwo, { itemCode: code(38), responseValue: '2' }])).toThrow('量表回答不合法')
  })
  it('uses an explicit adult lower bound and never lets missing age pass', () => {
    const eligibility = (ageMonths?: number, respondentType: 'SELF' | 'TEACHER' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(eligibility(215).outcome).toBe('INELIGIBLE')
    expect(eligibility(216).outcome).toBe('ELIGIBLE')
    expect(eligibility(900).outcome).toBe('ELIGIBLE')
    expect(eligibility().outcome).toBe('INDETERMINATE')
    expect(eligibility(360, 'TEACHER').outcome).toBe('INELIGIBLE')
  })
  it('refuses activation of the supplied DRAFT source even with source-level open rights labels', () => {
    const preview = previewScaleInstrument({ source, authorizations: [], locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'], nowIso: '2026-10-26T07:00:00.000Z' })
    expect(preview.sourceValidation.ok).toBe(true)
    expect(preview.allowActivation).toBe(false)
    expect(preview.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
    // Authorization records are deliberately not a deployment gate (see
    // policy/deployment.ts): an absent record must not block usage, so activation
    // stays refused by release status and unfinished localization review instead.
    expect(preview.blockers).toContain('LOCALIZATION_REVIEW_PENDING')
  })
  it('builds eight actual plain-language score-only interpretations without rankings or foreign norms', () => {
    for (const fixture of pkg.goldenCases.filter(f => f.expected.quality === 'interpretable')) {
      const r = parseScaleResultV2(result(fixture.answers))
      expect(r.interpretations).toHaveLength(8)
      expect(r.interpretations.every(i => i.label === null && i.referenceVersion === null && i.guidance.length === 2 && i.interpretation.length >= 100)).toBe(true)
      expect(r.references).toEqual([])
      expect(r.scores.every(s => s.type === 'dimension')).toBe(true)
      expect(r.method).toMatchObject({ instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', localizationVersion: '1.0.0', referenceVersions: [] })
    }
    expect(d.report.interpretations.every(i => i.summary.length >= 100 && i.bands.length === 0 && i.source.type === 'score_only')).toBe(true)
    expect(d.report.interpretations.map(i => i.summary).join('')).not.toMatch(/百分位|高于常模|治愈|疗效保证|CFA|Cronbach/)
  })
  it('keeps content, localization and report versions independent without catalog hash pollution', () => {
    expect(d.versionAxes).toMatchObject({ subjectKey: 'maia2_37', locale: 'zh-CN', localizationVersion: '1.0.0' })
    const hash = hashScaleDefinition(d), changed = structuredClone(source)
    changed.catalog.construct.constructOverlapTags.push('新检索词')
    expect(hashScaleDefinition(projectScalePackage(changed)!.definition)).toBe(hash)
    const report = structuredClone(d); report.report.reportVersion = '1.0.1'
    expect(hashScaleDefinition(report)).toBe(hash)
    expect(report.scoring.scoringVersion).toBe('1.0.0')
    const content = structuredClone(d); content.items[0].content += '（修订）'
    expect(hashScaleDefinition(content)).not.toBe(hash)
    expect(d.report.reportVersion).toBe('1.0.0')
  })
  it('retains exact source rights and language-version distinctions with pending human and China review', () => {
    expect(source.localization).toMatchObject({ sourceLocale: 'en', targetLocale: 'zh-CN', expertReviewStatus: 'PENDING', localEvidenceRefs: [] })
    expect(source.catalog.evidence.every(e => e.locale === 'en' && e.territory === 'GB')).toBe(true)
    expect(source.catalog.construct.constructOverlapTags.length).toBeGreaterThanOrEqual(40)
    for (const axis of ['domain', 'construct', 'orientation', 'population', 'response', 'use', 'license', 'language_validation']) expect(source.catalog.construct.constructOverlapTags.some(t => t.startsWith(axis + ':'))).toBe(true)
    expect(d.license).toMatchObject({ status: 'verified', redistribution: 'allowed' })
    expect(d.license.note).toContain('CC BY 4.0')
    expect(source.usageRequirements?.requiredRightsActions).toContain('translation')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(source.localization?.notes).toContain('31题七因子')
  })
})
