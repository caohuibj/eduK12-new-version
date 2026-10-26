import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../modules/scale/onboarding/instrument-registry', () => ({ getScaleInstrumentSource: () => undefined }))
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/ars30_2016_zh_cn_research/1.0.0/instrument'
import type { ScaleInstrumentSourceV1 } from '../../../modules/scale/onboarding/types'
import { defineScaleInstrumentSource, projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { previewScaleInstrument } from '../../../modules/scale/onboarding/preview'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { scoreScale, type ScaleAnswer } from '../../../modules/scale/scale-scoring'
import { buildScaleResult, parseScaleResultV2 } from '../../../modules/scale/scale-result'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'

const pkg = projectScalePackage(source)!, d = pkg.definition
const code = (n: number) => `ARS30_2016_${String(n).padStart(2, '0')}`
const all = (value: string): ScaleAnswer[] => Array.from({ length: 30 }, (_, i) => ({ itemCode: code(i + 1), responseValue: value }))
const middle = all('3')
const result = (answers: ScaleAnswer[]) => buildScaleResult({ scaleId: 'synthetic-ars30', instrumentKey: source.identity.instrumentKey, instrumentVersion: source.identity.instrumentVersion, name: source.catalog.identity.canonicalName, definition: d, answers })
const docs = resolve(process.cwd(), '../../docs/scale-instruments/research-drafts/ars30_2016/1.0.0')

const REVERSED = [2, 4, 8, 9, 10, 11, 13, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30]
const FACETS = {
  perseverance: [1, 2, 3, 4, 5, 8, 9, 10, 11, 13, 15, 16, 17, 30],
  reflection_help_seeking: [18, 20, 21, 22, 24, 25, 26, 27, 29],
  adaptive_emotional_response: [6, 7, 12, 14, 19, 23, 28],
} as const

describe('ARS-30 2016 article-carrier independent Chinese university-student DRAFT', () => {
  it('validates as DRAFT/CANDIDATE with 30 fixed Chinese working stems and preserved original endpoints', () => {
    expect(() => defineScaleInstrumentSource(source)).not.toThrow()
    expect(source.identity).toEqual({ instrumentKey: 'ars30_2016_zh_cn_research', instrumentVersion: '1.0.0' })
    expect(pkg.releaseStatus).toBe('DRAFT')
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.scientificReview).toBeUndefined()
    expect(d.items).toHaveLength(30)
    expect(d.items.map(i => i.itemCode)).toEqual(Array.from({ length: 30 }, (_, i) => code(i + 1)))
    expect(d.items.every(i => !i.required && !i.randomizeOptions)).toBe(true)
    expect(d.display.randomizeItems).toBe(false)
    // 2016 Methods endpoints: 1 = likely, 5 = unlikely; intermediates stay numeric.
    expect(d.responseSets[0].options.map(o => [String(o.value), o.score, o.label])).toEqual(
      [['1', 1, '很可能'], ['2', 2, '2'], ['3', 3, '3'], ['4', 4, '4'], ['5', 5, '不太可能']],
    )
  })

  it('carries the mandatory personal-adversity vignette as a versioned frozen instruction', () => {
    const vignette = JSON.parse(readFileSync(resolve(docs, 'bilingual-content.json'), 'utf8')) as { requiredVignette: { platformChinese: string }; instructions: { platformChinese: string } }
    expect(source.instruction).toBeDefined()
    expect(source.instruction!.schemaVersion).toBe(1)
    expect(source.instruction!.language).toBe('zh-CN')
    expect(source.instruction!.version).toBe('1.0.0')
    expect(source.instruction!.source.length).toBeGreaterThan(0)
    // The vignette must appear in full, before any item, and never as a scored item.
    expect(source.instruction!.text).toContain(vignette.requiredVignette.platformChinese)
    expect(d.items.some(i => i.content.includes('不及格'))).toBe(false)
    expect(d.items[0].content).toBe('我不会接受老师的反馈。')
  })

  it('keeps presentation revisions outside the measurement identity hash', () => {
    const edited = JSON.parse(JSON.stringify(source)) as ScaleInstrumentSourceV1
    edited.instruction = { ...source.instruction!, text: source.instruction!.text + '　补充说明：请独立作答。', version: '1.0.1' }
    const editedPkg = projectScalePackage(edited)!
    expect(hashScaleDefinition(editedPkg.definition)).toBe(hashScaleDefinition(d))
    expect(edited.instruction.version).toBe('1.0.1')
  })

  it('applies the authors 6-x conversion to exactly the 20 positive-response items', () => {
    expect(d.scoring.itemRules).toHaveLength(30)
    const reversed = d.scoring.itemRules.filter(r => r.transform.type === 'reverse').map(r => Number(r.itemCode.slice(-2)))
    expect(reversed).toEqual(REVERSED)
    expect(d.scoring.itemRules.filter(r => r.transform.type === 'identity')).toHaveLength(10)
    // item 23 belongs to facet three yet is still converted as a positive item.
    const rule23 = d.scoring.itemRules.find(r => r.itemCode === code(23))!
    expect(rule23.transform.type).toBe('reverse')
    expect(scoreScale(d, all('1')).scores.find(s => s.key === 'total')!.value).toBe(110)
    expect(scoreScale(d, all('5')).scores.find(s => s.key === 'total')!.value).toBe(70)
  })

  it('keeps one total 30-150 and three facets 14/9/7 strictly separate', () => {
    expect(d.scoring.scores).toHaveLength(4)
    expect(d.scoring.scores.map(s => s.key)).toEqual(['total', 'perseverance', 'reflection_help_seeking', 'adaptive_emotional_response'])
    const total = d.scoring.scores[0]
    expect(total).toMatchObject({ key: 'total', type: 'total', canonical: true, direction: 'higher_is_more', missingPolicy: { type: 'complete_required' }, source: { type: 'items', aggregation: 'sum' } })
    expect(total.source.type === 'items' ? total.source.items.length : 0).toBe(30)
    for (const [key, members] of Object.entries(FACETS)) {
      const score = d.scoring.scores.find(s => s.key === key)!
      expect(score.type).toBe('dimension')
      expect(score.direction).toBe('higher_is_more')
      const items = score.source.type === 'items' ? score.source.items : []
      expect(items.map(i => Number(i.itemCode.slice(-2)))).toEqual(members)
    }
    // Ranges are derived by the generic scorer from response mappings, never
    // hand-declared, so they cannot drift away from the aggregation rules.
    const derived = Object.fromEntries(scoreScale(d, all('3')).scores.map(s => [s.key, s.range]))
    expect(derived).toEqual({
      total: { min: 30, max: 150 },
      perseverance: { min: 14, max: 70 },
      reflection_help_seeking: { min: 9, max: 45 },
      adaptive_emotional_response: { min: 7, max: 35 },
    })
    expect(d.scoring.scores.every(s => s.range === undefined)).toBe(true)
    expect(d.referencePolicy).toEqual({ type: 'none' })
    expect(pkg.references).toEqual([])
  })

  it('scores every installed golden fixture exactly as hand-calculated', () => {
    expect(pkg.goldenCases.length).toBeGreaterThanOrEqual(5)
    for (const fixture of pkg.goldenCases) {
      const actual = scoreScale(d, fixture.answers)
      expect(actual.quality.status).toBe(fixture.expected.quality)
      expect(Object.fromEntries(actual.scores.map(s => [s.key, s.value]))).toEqual(fixture.expected.scores)
      expect(actual.scores.map(s => s.key)).toEqual(fixture.expected.totalScoreKeys)
    }
    // Facets must always sum to the declared total.
    const output = scoreScale(d, middle)
    const byKey = Object.fromEntries(output.scores.map(s => [s.key, s.value!]))
    expect(byKey.perseverance + byKey.reflection_help_seeking + byKey.adaptive_emotional_response).toBe(byKey.total)
    expect(byKey.total).toBe(90)
  })

  it('reaches both declared extremes only through mixed authorship-consistent answering', () => {
    const reversedSet = new Set(REVERSED)
    const extreme = (high: boolean) => {
      const answers: ScaleAnswer[] = []
      for (let n = 1; n <= 30; n++) {
        const rev = reversedSet.has(n)
        const value = high ? (rev ? '1' : '5') : (rev ? '5' : '1')
        answers.push({ itemCode: code(n), responseValue: value })
      }
      return scoreScale(d, answers)
    }
    expect(extreme(true).scores.find(s => s.key === 'total')!.value).toBe(150)
    expect(extreme(false).scores.find(s => s.key === 'total')!.value).toBe(30)
  })

  it('leaves incomplete scores null per facet without zero fill, imputation or prorating', () => {
    const ownerOf = (n: number) => Object.entries(FACETS).find(([, members]) => (members as readonly number[]).includes(n))![0]
    for (const n of [1, 3, 6, 12, 23, 29, 30]) {
      const owner = ownerOf(n)
      const r = result(middle.filter(a => a.itemCode !== code(n)))
      expect(r.quality.status).toBe('invalid')
      const value = (key: string) => r.scores.find(s => s.key === key)!.value
      // The total and the owning facet must not be computed; unrelated facets
      // stay computable because they are complete, which is the per-score
      // complete_required contract rather than a whole-form pass/fail.
      expect(value('total')).toBeNull()
      expect(value(owner)).toBeNull()
      for (const key of Object.keys(FACETS)) if (key !== owner) expect(value(key)).not.toBeNull()
      expect(r.scores.every(s => s.prorated === false)).toBe(true)
      expect(r.interpretations).toEqual([])
    }
    expect(result([]).scores.every(s => s.value === null)).toBe(true)
  })

  it('rejects out-of-range/wrong-type responses, unknown items and duplicates', () => {
    for (const value of ['0', '6', '', 'x', 3, 1.5, Number.NaN]) expect(() => result([{ itemCode: code(1), responseValue: value }, ...middle.slice(1)])).toThrow('量表回答不合法')
    expect(() => result([...middle, middle[0]])).toThrow('量表回答不合法')
    expect(() => result([...middle, { itemCode: code(31), responseValue: '3' }])).toThrow('量表回答不合法')
  })

  it('requires the respondent to be the 18+ adult university student, never a proxy or missing age', () => {
    const eligibility = (ageMonths?: number, respondentType: 'SELF' | 'PARENT' | 'TEACHER' = 'SELF') => evaluateInstrumentEligibility(source.applicability!, { respondentType, subject: ageMonths === undefined ? undefined : { ageMonths }, availableContextKeys: [] })
    expect(source.catalog.population.respondentTypes).toEqual(['SELF'])
    expect(eligibility(215).outcome).toBe('INELIGIBLE')
    expect(eligibility(216).outcome).toBe('ELIGIBLE')
    // A missing age must never be treated as passable: it stays unconfirmed.
    expect(eligibility(undefined).outcome).toBe('INDETERMINATE')
    expect(eligibility(undefined).outcome).not.toBe('ELIGIBLE')
    expect(eligibility(300, 'PARENT').outcome).toBe('INELIGIBLE')
    expect(eligibility(300, 'TEACHER').outcome).toBe('INELIGIBLE')
  })

  it('builds a real score-only result preview without bands, labels or clinical language', () => {
    const built = result(all('3'))
    const parsed = parseScaleResultV2(JSON.parse(JSON.stringify(built)))
    expect(parsed.scores.map(s => s.key)).toEqual(['total', 'perseverance', 'reflection_help_seeking', 'adaptive_emotional_response'])
    expect(parsed.interpretations.map(i => i.headline)).toEqual(d.report.interpretations.map(i => i.headline))
    for (const interpretation of d.report.interpretations) {
      expect(interpretation.source.type).toBe('score_only')
      expect(interpretation.bands).toEqual([])
      expect(interpretation.summary.length).toBeGreaterThan(0)
    }
    // Text the participant actually reads must stay non-clinical. The separate
    // limitations block legitimately names diagnosis and norms as exclusions.
    const participantText = d.report.interpretations
      .map(i => [i.headline, i.summary, ...i.guidance.map(g => g.text)].join(''))
      .join('')
    // Clinical safety is asserted structurally (score_only, empty bands, declared
    // forbidden uses) rather than by banning words that legitimately appear inside
    // necessary negations such as "这个分数不能说明你是否患病".
    expect(source.catalog.intendedUse.forbiddenUses).toContain('DIAGNOSIS')
    expect(participantText).not.toMatch(/保证|一定能|彻底改变|必然/)
    expect(d.report.limitations.join('')).toContain('没有中文常模')
    for (const fixture of pkg.goldenCases) {
      const r = parseScaleResultV2(JSON.parse(JSON.stringify(result(fixture.answers))))
      expect(r.interpretations).toHaveLength(4)
      expect(r.interpretations.map(i => i.scoreKey)).toEqual(['total', 'perseverance', 'reflection_help_seeking', 'adaptive_emotional_response'])
      for (const interpretation of r.interpretations) {
        expect(interpretation.interpretation.length).toBeGreaterThanOrEqual(100)
        expect(interpretation.label).toBeNull()
        expect(interpretation.referenceVersion).toBeNull()
        expect(interpretation.guidance.map(g => g.category)).toEqual(['strategy', 'reflection'])
      }
    }
  })

  it('refuses DRAFT activation despite the open CC BY 4.0 article carrier', () => {
    const preview = previewScaleInstrument({ source, authorizations: [], locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL', deploymentModes: ['STANDALONE'], nowIso: '2026-10-27T00:00:00.000Z' })
    expect(preview.sourceValidation.ok).toBe(true)
    expect(preview.allowActivation).toBe(false)
    expect(preview.blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
    // The two localization blockers are the honest state of this instrument:
    // an unreviewed independent working translation must not present itself as ready.
    expect(preview.blockers).toContain('LOCALIZATION_EXPERT_REVIEW_PENDING')
    expect(preview.blockers).toContain('LOCALIZATION_REVIEW_PENDING')
    expect(source.localization).toMatchObject({ expertReviewStatus: 'PENDING', reviewStatus: 'PENDING', cognitiveDebriefStatus: 'NOT_ESTABLISHED' })
  })
})
