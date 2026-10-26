import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/bpses5_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const code = (n: number) => `BPSES_${String(n).padStart(2, '0')}`
const middle: ScaleAnswer[] = Array.from({ length: 5 }, (_, i) => ({ itemCode: code(i + 1), responseValue: '3' }))
const result = (answers: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-bpses5', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers })
const docs = resolve(process.cwd(), '../../docs/scale-instruments/research-drafts/bpses5/1.0.0')

describe('BPSES original final-five independent Chinese adult self-report DRAFT', () => {
  it('validates distinct DRAFT/CANDIDATE with five ordered Chinese working stems and agreement values', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'bpses5_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.scientificReview).toBeUndefined()
    expect(d.items.map(i => i.itemCode)).toEqual([1, 2, 3, 4, 5].map(code))
    expect(d.items.map(i => i.content)).toEqual(['即使我不一定总能做到，我也知道自己在与孩子相处时需要做什么。', '我能够做一些有助于改善孩子行为的事。', '我能对孩子产生重要的影响。', '在大多数情况下，我知道应该怎么做才能让孩子表现得当。', '我做的事情会对孩子的行为产生影响。'])
    expect(d.items.every(i => !i.required && !i.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(d.responseSets[0].options.map(o => [o.value, o.score, o.label])).toEqual(['非常不同意', '不同意', '中立', '同意', '非常同意'].map((s, i) => [String(i + 1), i + 1, s]))
  })
  it('retains author final original 1/4/5/8/9 mapping and separately prepared Methods-based instructions', () => {
    const bilingual = JSON.parse(readFileSync(resolve(docs, 'bilingual-content.json'), 'utf8')) as { items: Array<{ originalNumber: number; en: string; zh: string }>; instruction: string; recallPeriod: null }
    expect(bilingual.items.map(i => i.originalNumber)).toEqual([1, 4, 5, 8, 9])
    expect(bilingual.items.map(i => i.en)).toEqual(["Even though I may not always manage it, I know what I need to do with my child", "I am able to do the things that will improve my child's behaviour", 'I can make an important difference to my child', 'In most situations I know what I should do to ensure my child behaves', "The things I do make a difference to my child's behaviour"])
    expect(bilingual.items.map(i => i.zh)).toEqual(d.items.map(i => i.content))
    expect(bilingual.recallPeriod).toBeNull()
    const sidecar = JSON.parse(readFileSync(resolve(docs, 'administration-sidecar.prepared.json'), 'utf8')) as { status: string; instructions: string[]; recallPeriod: null }
    expect(sidecar.status).toBe('PREPARED_NOT_RUNTIME_CONNECTED')
    expect(sidecar.instructions).toEqual([bilingual.instruction])
    expect(sidecar.recallPeriod).toBeNull()
    expect(d.items[0].content).not.toContain('下面五句话')
  })
  it('allows just one all-item total sum 5–25 with no reverse or original three-triad scores', () => {
    expect(d.respondentType).toBe('participant_self_report')
    expect(d.scoring.itemRules).toHaveLength(5)
    expect(d.scoring.itemRules.every(r => r.transform.type === 'identity')).toBe(true)
    expect(d.scoring.scores).toHaveLength(1)
    expect(d.scoring.scores[0]).toMatchObject({ key: 'total', type: 'total', canonical: true, direction: 'higher_is_more', missingPolicy: { type: 'complete_required' }, source: { type: 'items', aggregation: 'sum' } })
    expect(d.scoring.scores[0].source.type === 'items' ? d.scoring.scores[0].source.items : []).toEqual([1, 2, 3, 4, 5].map(n => ({ itemCode: code(n), weight: 1 })))
    expect(d.scoring.scores.filter(s => s.type === 'dimension')).toEqual([])
    expect(d.referencePolicy).toEqual({ type: 'none' })
    expect(pkg.references).toEqual([])
  })
  for (const fixture of pkg.goldenCases) it(`independent arithmetic: ${fixture.name}`, () => {
    const actual = scoreScale(d, fixture.answers)
    expect(actual.quality.status).toBe(fixture.expected.quality)
    expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
    expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    expect(actual.scores[0].range).toEqual({ min: 5, max: 25 })
    expect(actual.scores[0].value).toBe(fixture.answers.length === 5 ? fixture.answers.reduce((n, a) => n + Number(a.responseValue), 0) : null)
  })
  it('gives each of all five items an independent positive unit contribution without converting sum to mean', () => {
    expect(scoreScale(d, middle).scores[0].value).toBe(15)
    for (let n = 1; n <= 5; n++) {
      expect(scoreScale(d, middle.map(a => a.itemCode === code(n) ? { ...a, responseValue: '5' } : a)).scores[0].value).toBe(17)
      expect(scoreScale(d, middle.map(a => a.itemCode === code(n) ? { ...a, responseValue: '1' } : a)).scores[0].value).toBe(13)
    }
  })
  it('leaves every incomplete total null without zero fill, imputation, changing denominator or invalid prose', () => {
    for (let n = 1; n <= 5; n++) {
      const r = result(middle.filter(a => a.itemCode !== code(n)))
      expect(r.quality.status).toBe('invalid')
      expect(r.itemScores).toHaveLength(4)
      expect(r.scores).toHaveLength(1)
      expect(r.scores[0]).toMatchObject({ key: 'total', value: null, prorated: false, status: 'not_calculable' })
      expect(r.interpretations).toEqual([])
    }
    expect(result([]).scores[0].value).toBeNull()
  })
  it('rejects out-of-range/wrong-type responses, unknown items and duplicates', () => {
    for (const value of ['0', '6', '', 'x', 3, 1.5, Number.NaN]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...middle.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...middle, middle[0]])).toThrow('量表回答不合法')
    expect(() => result([...middle, { itemCode: code(6), responseValue: '3' }])).toThrow('量表回答不合法')
  })
  it('treats adult parent/carer as SELF subject, rejects proxy types and never substitutes child age or lets missing age pass', () => {
    const eligibility = (ageMonths?: number, respondentType: 'SELF' | 'PARENT' | 'TEACHER' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(source.catalog.population.respondentTypes).toEqual(['SELF'])
    expect(eligibility(215).outcome).toBe('INELIGIBLE')
    expect(eligibility(216).outcome).toBe('ELIGIBLE')
    expect(eligibility(900).outcome).toBe('ELIGIBLE')
    expect(eligibility().outcome).toBe('INDETERMINATE')
    expect(eligibility(360, 'PARENT').outcome).toBe('INELIGIBLE')
    expect(eligibility(360, 'TEACHER').outcome).toBe('INELIGIBLE')
    expect(eligibility(60).outcome).toBe('INELIGIBLE')
  })
  it('refuses DRAFT activation despite open-source rights labels', () => {
    const preview = previewScaleInstrument({ source, authorizations: [], locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'], nowIso: '2026-10-26T11:00:00.000Z' })
    expect(preview.sourceValidation.ok).toBe(true)
    expect(preview.allowActivation).toBe(false)
    expect(preview.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
    expect(preview.blockers).toContain('AUTHORIZATION_MISSING')
  })
  it('builds actual plain-language score-only Chinese reflection without diagnosis, rank, child-change promises or parent blame', () => {
    for (const fixture of pkg.goldenCases.filter(f => f.expected.quality === 'interpretable')) {
      const r = parseScaleResultV2(result(fixture.answers))
      expect(r.interpretations).toHaveLength(1)
      expect(r.interpretations[0]).toMatchObject({ scoreKey: 'total', label: null, referenceVersion: null })
      expect(r.interpretations[0].interpretation.length).toBeGreaterThanOrEqual(100)
      expect(r.interpretations[0].guidance.map(g => g.category)).toEqual(['reflection', 'strategy'])
      expect(r.references).toEqual([])
      expect(r.method).toMatchObject({ instrumentVersion: '1.0.0', scoringVersion: '1.0.0', reportVersion: '1.0.0', localizationVersion: '1.0.0', referenceVersions: [] })
    }
    const text = d.report.interpretations[0]
    expect(text.source.type).toBe('score_only')
    expect(text.bands).toEqual([])
    expect(text.summary).toContain('不能凭此判断实际教养能力')
    expect(text.summary).toContain('不能把孩子的表现归因于家长')
    expect(text.summary).toContain('若你愿意')
    expect(text.summary).not.toMatch(/百分位|高于常模|疗效保证|保证孩子|家长失职|CFA|Cronbach|RMSEA/)
    expect(d.report.audienceContract?.locale).toBe('zh-CN')
  })
  it('keeps content/localization, no-norm parameter strategy and report axes independent without catalog hash pollution', () => {
    expect(d.versionAxes).toMatchObject({ subjectKey: 'bpses5', locale: 'zh-CN', localizationVersion: '1.0.0' })
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
  it('records original English evidence and CC attribution while keeping Chinese, expert review and all eight tag axes honest', () => {
    expect(source.localization).toMatchObject({ sourceLocale: 'en', targetLocale: 'zh-CN', adaptationMethod: 'DIRECT_TRANSLATION', expertReviewStatus: 'PENDING', reviewStatus: 'PENDING', localEvidenceRefs: [] })
    expect(source.catalog.evidence.every(e => e.locale === 'en' && e.territory === 'GB' && e.sampleSize === 355)).toBe(true)
    expect(source.catalog.construct.constructOverlapTags.length).toBeGreaterThanOrEqual(35)
    for (const axis of ['domain', 'construct', 'orientation', 'population', 'response', 'use', 'license', 'language_validation']) expect(source.catalog.construct.constructOverlapTags.some(t => t.startsWith(axis + ':'))).toBe(true)
    expect(d.license).toMatchObject({ status: 'verified', redistribution: 'allowed' })
    expect(d.license.note).toContain('CC BY 4.0')
    expect(d.source?.publicationYear).toBe(2023)
    expect(d.source?.citation).toContain('2025 issue')
    expect(source.usageRequirements?.requiredRightsActions).toContain('translation')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(source.localization?.notes).toContain('不是Wang等2026')
  })
})
