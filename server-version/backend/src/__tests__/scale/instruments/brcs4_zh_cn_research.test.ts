import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/brcs4_zh_cn_research/1.0.0/instrument'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const code = (i: number) => 'BRCS_' + String(i).padStart(2, '0')
const answers = (values: number[]): ScaleAnswer[] => values.map((v, i) => ({ itemCode: code(i + 1), responseValue: String(v) }))
const result = (a: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-brcs4', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers: a })
const bilingual = JSON.parse(readFileSync(resolve('../../docs/scale-instruments/research-drafts/brcs4/1.0.0/bilingual-content.json'), 'utf8')) as { questions: Array<{ itemCode: string; originalEnglish: string; platformChinese: string; reverse: boolean }> }

describe('brcs4 independent Chinese research adaptation', () => {
  it('validates a complete independent DRAFT source without claiming activation', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'brcs4_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.scientificReview).toBeUndefined()
    expect(source.catalog.identity.canonicalName).toContain('中文研究工作稿')
  })
  it('preserves the complete four open-author items, ordered separately from instructions', () => {
    expect(d.items.map(i => i.itemCode)).toEqual([1, 2, 3, 4].map(code))
    expect(d.items.map(i => i.content)).toEqual(bilingual.questions.map(q => q.platformChinese))
    expect(bilingual.questions[2].originalEnglish).toBe('I believe that I can grow in positive ways by dealing with difficult situations.')
    expect(bilingual.questions.every(q => q.reverse === false)).toBe(true)
    expect(d.items.every(i => i.required && !i.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    expect(d.items[0].content).not.toMatch(/请|作答说明/)
    expect(Object.prototype.hasOwnProperty.call(source, 'instruction')).toBe(false)
  })
  it('uses the independently arranged five-point format, with numeric middle options', () => {
    expect(d.responseSets).toHaveLength(1)
    expect(d.responseSets[0].options.map(o => o.score)).toEqual([1, 2, 3, 4, 5])
    expect(d.responseSets[0].options.map(o => o.label)).toEqual(['完全不符合我', '2', '3', '4', '非常符合我'])
    expect(source.catalog.administration.layoutConstraints.join(' ')).toContain('四点改编')
    expect(source.localization?.notes).toContain('独立研究改编身份')
  })
  it('defines one equal-weight total and no reverse or imported Rasch conversion', () => {
    expect(d.scoring.itemRules).toEqual([1, 2, 3, 4].map(i => ({ itemCode: code(i), transform: { type: 'identity' } })))
    expect(d.scoring.scores).toHaveLength(1)
    expect(d.scoring.scores[0].canonical).toBe(true)
    expect(d.scoring.scores[0].source).toEqual({ type: 'items', items: [1, 2, 3, 4].map(i => ({ itemCode: code(i), weight: 1 })), aggregation: 'sum' })
    expect(d.scoring.defaultMissingPolicy).toEqual({ type: 'complete_required' })
  })
  for (const f of pkg.goldenCases) it('scores pinned arithmetic ' + f.name, () => {
    const actual = scoreScale(d, f.answers)
    expect(actual.quality.status).toBe(f.expected.quality)
    expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(f.expected.scores)
    expect(actual.scores.filter(s => s.type === 'total').map(s => s.key)).toEqual(['resilient_coping'])
  })
  it('checks every legal answer combination against independent addition', () => {
    for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) for (let c = 1; c <= 5; c++) for (let e = 1; e <= 5; e++) {
      const actual = scoreScale(d, answers([a, b, c, e]))
      expect(actual.scores[0].value).toBe(a + b + c + e)
      expect(actual.scores[0].range).toEqual({ min: 4, max: 20 })
      expect(actual.quality.status).toBe('interpretable')
    }
  })
  it('refuses interpretation for every single missing item without imputation', () => {
    const full = answers([2, 3, 4, 5])
    for (let i = 0; i < 4; i++) {
      const r = result(full.filter((_, j) => i !== j))
      expect(r.scores[0].value).toBeNull()
      expect(r.quality.status).toBe('invalid')
      expect(r.interpretations).toEqual([])
      expect(r.scores[0].prorated).toBe(false)
      expect(r.itemScores).toHaveLength(3)
    }
  })
  it('rejects illegal, duplicate and unknown values', () => {
    const full = answers([2, 3, 4, 5])
    for (const value of ['0', '6', '', 'bad', 2.5, Number.NaN]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...full.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...full, full[0]])).toThrow('量表回答不合法')
    expect(() => result([...full, { itemCode: code(5), responseValue: '3' }])).toThrow('量表回答不合法')
  })
  it('applies a provisional adult-self boundary and never guesses missing age', () => {
    const elig = (ageMonths?: number, respondentType: 'SELF' | 'PARENT' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(elig(215).outcome).toBe('INELIGIBLE')
    expect(elig(216).outcome).toBe('ELIGIBLE')
    expect(elig().outcome).toBe('INDETERMINATE')
    expect(elig(216, 'PARENT').outcome).toBe('INELIGIBLE')
  })
  it('builds actual plain-language reflection without norm labels or boundaries', () => {
    for (const values of [[1, 1, 1, 1], [3, 3, 3, 3], [1, 4, 2, 5], [5, 5, 5, 5]]) {
      const r = parseScaleResultV2(result(answers(values)))
      expect(r.interpretations).toHaveLength(1)
      const i = r.interpretations[0]
      expect(i.label).toBeNull()
      expect(i.referenceVersion).toBeNull()
      expect(i.interpretation.length).toBeGreaterThan(100)
      expect(i.interpretation).not.toMatch(/Rasch|Cronbach|百分位|标准差|低韧性|高韧性|\d/)
      expect(i.guidance.some(g => g.category === 'reflection')).toBe(true)
      expect(i.guidance.some(g => g.category === 'strategy')).toBe(true)
      expect(r.references).toEqual([])
      expect(r.method.reportVersion).toBe('1.0.0')
    }
    expect(d.referencePolicy).toEqual({ type: 'none' })
    expect(d.report.interpretations[0].source).toEqual({ type: 'score_only' })
    expect(d.report.interpretations[0].bands).toEqual([])
  })
  it('keeps content, localization, scoring and report versions independently traceable', () => {
    const changed = structuredClone(d)
    changed.report.reportVersion = '1.0.1'; changed.report.disclaimer += ' 说明修订'
    expect(hashScaleDefinition(changed)).toBe(hashScaleDefinition(d))
    changed.items[0].content += ' 内容修订'
    expect(hashScaleDefinition(changed)).not.toBe(hashScaleDefinition(d))
    expect(d.scoring.scoringVersion).toBe('1.0.0')
    expect(d.versionAxes?.localizationVersion).toBe('1.0.0')
    expect(source.localization?.localizationVersion).toBe('1.0.0')
  })
  it('records rich factual eight-axis tags and pending local scientific work', () => {
    const tags = source.catalog.construct.constructOverlapTags
    expect(tags.length).toBeGreaterThanOrEqual(40)
    expect(new Set(tags).size).toBe(tags.length)
    for (const axis of ['domain', 'construct', 'orientation', 'population', 'response', 'use', 'license', 'language_validation']) expect(tags.some(t => t.startsWith(axis + ':'))).toBe(true)
    expect(tags.filter(t => /[\u4e00-\u9fff]/.test(t)).length).toBeGreaterThanOrEqual(8)
    expect(tags).toContain('license:cc_by_4_0')
    expect(source.localization?.expertReviewStatus).toBe('PENDING')
    expect(source.localization?.localEvidenceRefs).toEqual([])
    expect(source.localization?.cognitiveDebriefStatus).toBe('NOT_ESTABLISHED')
  })
  it('binds reuse rights to open coauthor wording while excluding original-manual and norms claims', () => {
    expect(d.license.status).toBe('verified')
    expect(d.license.redistribution).toBe('allowed')
    expect(d.license.note).toContain('CC BY 4.0')
    expect(d.license.note).toContain('不声称原2004精确题本已取得')
    expect(d.license.note).toContain('65e415c77423e1c279ea341976f24a401fc74aa06525ef270e1b54606786a07d')
    expect(source.usageRequirements?.allowedCommercialNatures).toEqual(['NON_COMMERCIAL', 'COMMERCIAL'])
    expect(d.report.audienceContract?.respondent).toBe('ADULT_SELF')
    expect(source.catalog.referenceApplicability).toEqual([])
    expect(source.catalog.evidence).toEqual([])
  })
})
