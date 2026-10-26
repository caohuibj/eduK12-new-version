import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/socs_s20_2023_zh_cn/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const keys = ['recognizing_suffering', 'understanding_universality', 'feeling_for_self', 'tolerating_feelings', 'acting_to_alleviate', 'total']
const groups = [[1, 6, 11, 16], [2, 7, 12, 17], [3, 8, 13, 18], [4, 9, 14, 19], [5, 10, 15, 20]]
const code = (n: number) => `SOCSS_${String(n).padStart(2, '0')}`
const allThree: ScaleAnswer[] = Array.from({ length: 20 }, (_, i) => ({ itemCode: code(i + 1), responseValue: '3' }))
const result = (answers: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-socs-s20', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers })
const fixedTexts = ['我很善于识别我痛苦时的感受', '我知道每个人都会在生命中的某些阶段经历痛苦', '当我经历困难时，我会善待自己', '当我情绪低落时，我试着敞开心扉接受自己的感受，而不是回避它们', '当我苦恼时，我尽量让自己感觉好一点，即使我对此无能为力', '我会注意到我正在经历的痛苦', '我明白偶尔感到不安是人生常态', '当我遭遇不幸时，我会关心自己', '我与自己的痛苦持联结，而不是让它压倒我。', '遇到困难时，我会尽量照顾好自己', '我很快就注意到自己痛苦的早期迹象', '我知道其他人也像我一样在生活中会经历挣扎', '当我心烦意乱时，我试着调整我的感受', '我与自己的痛苦保持联结，而不是批判自己', '当我感到不安时，我尽量做对自己最有利的事', '我能识别自己的痛苦迹象', '我知道当生活中的事情进展不顺利时，我们都会感到痛苦', '即使我对自己很失望，我也能在困境中善待自己', '当我心烦意乱时，我会让情绪顺其自然而不受它控制', '当情绪低落时，我尽力照顾好自己']

describe('SOCS-S20 fixed Meng/Wang/Liu 2023 published Chinese research draft', () => {
  it('validates a distinct complete DRAFT/CANDIDATE with exact 20-item carrier and agreement labels', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'socs_s20_2023_zh_cn', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.scientificReview).toBeUndefined()
    expect(d.items.map(x => x.itemCode)).toEqual(Array.from({ length: 20 }, (_, i) => code(i + 1)))
    expect(d.items.map(x => x.content)).toEqual(fixedTexts)
    expect(d.items.every(x => !x.required && !x.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets[0].options.map(o => [o.value, o.score, o.label])).toEqual(['完全不符合', '基本不符合', '不确定', '基本符合', '完全符合'].map((s, i) => [String(i + 1), i + 1, s]))
  })
  it('uses five exact four-item facets and an allowed 20-item total, all identity mean with conservative complete_required', () => {
    expect(d.scoring.itemRules).toHaveLength(20)
    expect(d.scoring.itemRules.every(r => r.transform.type === 'identity')).toBe(true)
    expect(d.scoring.scores.map(s => s.key)).toEqual(keys)
    expect(d.scoring.scores.map(s => s.source.type === 'items' ? s.source.items.map(i => i.itemCode) : [])).toEqual([...groups, Array.from({ length: 20 }, (_, i) => i + 1)].map(g => g.map(code)))
    expect(d.scoring.scores.every(s => s.source.type === 'items' && s.source.aggregation === 'mean' && s.source.items.every(i => i.weight === 1))).toBe(true)
    expect(d.scoring.scores.every(s => s.missingPolicy?.type === 'complete_required')).toBe(true)
    expect(d.scoring.scores.filter(s => s.type === 'total').map(s => s.key)).toEqual(['total'])
    expect(d.referencePolicy).toEqual({ type: 'none' })
    expect(d.report.primaryScoreKeys).toEqual(keys)
  })
  for (const fixture of pkg.goldenCases) it(`matches independent arithmetic: ${fixture.name}`, () => {
    const actual = scoreScale(d, fixture.answers)
    expect(actual.quality.status).toBe(fixture.expected.quality)
    expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
    // Legacy field names every output key, including dimensions.
    expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    expect(actual.scores.every(s => s.range?.min === 1 && s.range.max === 5)).toBe(true)
    const byItem = new Map(fixture.answers.map(a => [a.itemCode, Number(a.responseValue)]))
    for (const [j, g] of [...groups, Array.from({ length: 20 }, (_, i) => i + 1)].entries()) {
      const complete = g.every(n => byItem.has(code(n)))
      expect(actual.scores[j].value).toBe(complete ? g.reduce((sum, n) => sum + byItem.get(code(n))!, 0) / g.length : null)
    }
  })
  it('changes exactly the owning facet and total without reverse transforms or other facet contamination', () => {
    for (let n = 1; n <= 20; n++) {
      const actual = scoreScale(d, allThree.map(a => a.itemCode === code(n) ? { ...a, responseValue: '5' } : a)).scores
      for (let j = 0; j < 5; j++) expect(actual[j].value).toBe(3 + (groups[j].includes(n) ? 0.5 : 0))
      expect(actual[5].value).toBe(3.1)
    }
  })
  it('preserves sum/mean linear conversions for complete data without importing any thresholds', () => {
    for (const fixture of pkg.goldenCases.filter(f => f.expected.quality === 'interpretable')) {
      const vals = fixture.answers.map(a => Number(a.responseValue))
      const scores = scoreScale(d, fixture.answers).scores
      expect(scores[5].value! * 20).toBeCloseTo(vals.reduce((a, b) => a + b, 0), 12)
      groups.forEach((g, i) => expect(scores[i].value! * 4).toBeCloseTo(g.reduce((a, n) => a + vals[n - 1], 0), 12))
    }
    expect(pkg.references).toEqual([])
    expect(d.report.interpretations.every(i => i.bands.length === 0)).toBe(true)
  })
  it('requires complete output groups without zero filling, changing denominator or generating invalid prose', () => {
    for (let n = 1; n <= 20; n++) {
      const r = result(allThree.filter(a => a.itemCode !== code(n)))
      expect(r.quality.status).toBe('invalid')
      expect(r.itemScores).toHaveLength(19)
      expect(r.scores.filter(s => s.value === null).map(s => s.key)).toEqual([keys[groups.findIndex(g => g.includes(n))], 'total'])
      expect(r.scores.filter(s => s.value !== null).every(s => s.value === 3)).toBe(true)
      expect(r.scores.every(s => !s.prorated)).toBe(true)
      expect(r.interpretations).toEqual([])
    }
    expect(result([]).scores.every(s => s.value === null)).toBe(true)
  })
  it('rejects illegal response types, out-of-range values, duplicate answers and unknown items', () => {
    for (const value of ['0', '6', '', 'bad', 2.5, Number.NaN, 3]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...allThree.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...allThree, allThree[0]])).toThrow('量表回答不合法')
    expect(() => result([...allThree, { itemCode: code(21), responseValue: '3' }])).toThrow('量表回答不合法')
  })
  it('enforces the project adult lower bound and refuses missing age or proxy respondents', () => {
    const eligibility = (ageMonths?: number, respondentType: 'SELF' | 'TEACHER' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(eligibility(215).outcome).toBe('INELIGIBLE')
    expect(eligibility(216).outcome).toBe('ELIGIBLE')
    expect(eligibility(900).outcome).toBe('ELIGIBLE')
    expect(eligibility().outcome).toBe('INDETERMINATE')
    expect(eligibility(360, 'TEACHER').outcome).toBe('INELIGIBLE')
  })
  it('refuses DRAFT activation despite open source-rights labels', () => {
    const preview = previewScaleInstrument({ source, authorizations: [], locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'], nowIso: '2026-10-26T10:00:00.000Z' })
    expect(preview.sourceValidation.ok).toBe(true)
    expect(preview.allowActivation).toBe(false)
    expect(preview.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
    // Authorization records are deliberately not a deployment gate (see
    // policy/deployment.ts): an absent record must not block usage, so activation
    // stays refused by release status and unfinished localization review instead.
    expect(preview.blockers).toContain('LOCALIZATION_REVIEW_PENDING')
  })
  it('builds actual six-part plain-language Chinese score-only reports without cutoffs or ranks', () => {
    for (const fixture of pkg.goldenCases.filter(f => f.expected.quality === 'interpretable')) {
      const r = parseScaleResultV2(result(fixture.answers))
      expect(r.interpretations).toHaveLength(6)
      expect(r.interpretations.every(i => i.label === null && i.referenceVersion === null && i.guidance.length === 2 && i.interpretation.length >= 100)).toBe(true)
      expect(r.references).toEqual([])
      expect(r.scores.map(s => s.type)).toEqual(['dimension', 'dimension', 'dimension', 'dimension', 'dimension', 'total'])
      expect(r.method).toMatchObject({ instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', localizationVersion: '1.0.0', referenceVersions: [] })
    }
    expect(d.report.audienceContract?.locale).toBe('zh-CN')
    expect(d.report.interpretations.every(i => i.summary.length >= 100 && i.bands.length === 0 && i.source.type === 'score_only')).toBe(true)
    expect(d.report.interpretations.map(i => i.summary).join('')).not.toMatch(/百分位|高于常模|治愈|疗效保证|Cronbach|CFA|IRT/)
  })
  it('keeps content/scoring, parameters and report axes independent without catalog pollution', () => {
    expect(d.versionAxes).toMatchObject({ subjectKey: 'socs_s20', locale: 'zh-CN', localizationVersion: '1.0.0' })
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
  it('records existing Chinese working-sample evidence, exact license attribution, pending platform review and all eight tag axes', () => {
    expect(source.localization).toMatchObject({ sourceLocale: 'zh-CN', targetLocale: 'zh-CN', adaptationMethod: 'ORIGINAL_SOURCE', expertReviewStatus: 'PENDING', reviewStatus: 'PENDING' })
    expect(source.localization?.localEvidenceRefs).toHaveLength(3)
    expect(source.catalog.evidence.every(e => e.locale === 'zh-CN' && e.territory === 'CN' && e.sampleSize === 1132)).toBe(true)
    expect(source.catalog.construct.constructOverlapTags.length).toBeGreaterThanOrEqual(35)
    for (const axis of ['domain', 'construct', 'orientation', 'population', 'response', 'use', 'license', 'language_validation']) expect(source.catalog.construct.constructOverlapTags.some(t => t.startsWith(axis + ':'))).toBe(true)
    expect(d.license).toMatchObject({ status: 'verified', redistribution: 'allowed' })
    expect(d.license.note).toContain('CC BY 4.0')
    expect(source.usageRequirements?.requiredRightsActions).not.toContain('translation')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(source.localization?.notes).toContain('not at all true/always true')
  })
})
