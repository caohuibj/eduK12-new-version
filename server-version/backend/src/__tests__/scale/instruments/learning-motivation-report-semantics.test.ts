import { describe, expect, it } from 'vitest'
import { getScaleInstrumentSource, listScaleInstrumentSources } from '../../../modules/scale/onboarding/instrument-registry'
import { hashScaleDefinition } from '../../../modules/scale/scale-definition'
import { canonicalHash } from '../../../modules/assessment-runtime/canonical'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { allowsScaleAxisRevision } from '../../../modules/scale/onboarding/axis-snapshots'
import baseline from './fixtures/learning-motivation-v1-facts.json'

// Later independent-axis instruments are outside this revision's frozen
// six-family × six-subject measurement/reference baseline.
const wave1Keys = new Set(['academic_self_concept', 'academic_self_efficacy', 'domain_fixed_mindset', 'teacher_subject_liking', 'tutoring_necessity', 'value_cost'].flatMap(family =>
  ['mathematics', 'chemistry', 'physics', 'biology', 'english', 'chinese'].map(subject => `${family}_${subject}_zh_cn`)))
const sources = listScaleInstrumentSources().filter(source => wave1Keys.has(source.identity.instrumentKey) && source.identity.instrumentVersion === '1.0.0')
const positions = { very_low: '较低', low: '偏低', middle: '中间', high: '偏高', very_high: '较高' } as const

describe('learning motivation report/reference presentation revision', () => {
  it('preserves all 36 measurements and every reference fact except version and display labels', () => {
    expect(sources).toHaveLength(36)
    expect(sources.map(source => source.identity.instrumentKey).sort()).toEqual([...wave1Keys].sort())
    for (const source of sources) {
      const previous = baseline.rows.find(row => row.key === source.identity.instrumentKey)!
      const executable = source.executable!
      expect(hashScaleDefinition(executable.definition), source.identity.instrumentKey).toBe(previous.measurementHash)
      const facts = executable.references.map(reference => {
        const { referenceVersion: _version, ...rest } = structuredClone(reference)
        return { ...rest, entries: rest.entries.map(entry => ({
          ...entry,
          governance: { ...entry.governance!, bands: entry.governance!.bands.map(({ label: _label, ...band }) => band) },
        })) }
      })
      expect(canonicalHash(facts), source.identity.instrumentKey).toBe(previous.referenceFactsHash)
      expect(source.identity.instrumentVersion).toBe('1.0.0')
      expect(executable.definition.scoring.scoringVersion).toBe('1.0.0')
      expect(executable.definition.report.reportVersion).toBe(source.identity.instrumentKey === 'teacher_subject_liking_chemistry_zh_cn' ? '1.1.1' : '1.1.0')
      expect(executable.references.every(ref => ref.referenceVersion === 'wave1-20261001-v2')).toBe(true)
      expect(executable.definition.referencePolicy.type).toBe('declared')
      if (executable.definition.referencePolicy.type === 'declared') {
        expect(executable.definition.referencePolicy.selections.every(selection => selection.referenceVersion === 'wave1-20261001-v2')).toBe(true)
      }
    }
  })

  it('versions report and reference revisions without overwriting the previous frozen definition', () => {
    for (const source of sources) {
      const next = source.executable!.definition
      const previous = structuredClone(next)
      previous.report.reportVersion = '1.0.0'
      previous.report.interpretations[0].summary = 'Previous immutable report copy'
      if (previous.referencePolicy.type !== 'declared') throw new Error('fixture policy')
      previous.referencePolicy.selections.forEach(selection => { selection.referenceVersion = 'wave1-20261001-v1' })
      const frozen = canonicalHash(previous)
      expect(allowsScaleAxisRevision(previous, next)).toBe(true)
      expect(canonicalHash(previous)).toBe(frozen)
      const invalid = structuredClone(next)
      invalid.report.reportVersion = '1.0.0'
      expect(allowsScaleAxisRevision(previous, invalid)).toBe(false)
    }
  })

  it('labels historical positions and theoretical descriptions separately, preserving the 10/26 evidence split', () => {
    let empirical = 0
    let theoretical = 0
    for (const source of sources) {
      const executable = source.executable!
      const local = executable.references.some(reference => reference.entries.some(entry => entry.governance!.kind !== 'THEORETICAL_RANGE'))
      if (local) empirical++; else theoretical++
      for (const reference of executable.references) for (const entry of reference.entries) {
        for (const band of entry.governance!.bands) {
          const position = positions[band.key as keyof typeof positions]
          expect(band.label).toBe(local ? `历史参考组内相对${position}分段` : `暂定量尺${position}分段（非人群位置）`)
        }
        if (!local) {
          expect(entry.governance!.sampleN).toBeNull()
          expect(entry.statistics).toEqual({})
        }
      }
      for (const interpretation of executable.definition.report.interpretations) {
        for (const variant of interpretation.bands) {
          expect(variant.summary).toContain('若页面显示均分')
          expect(variant.summary).toContain('原作答选项')
          expect(variant.summary).not.toContain('先看本页')
          expect(variant.summary.length).toBeLessThanOrEqual(380)
          expect(variant.summary).toContain(local ? '不等于对题目的绝对认同程度' : '不是经数据验证的心理转折点')
          expect(variant.label).toContain(local ? '历史参考组内相对' : '非人群位置')
        }
      }
    }
    expect({ empirical, theoretical }).toEqual({ empirical: 10, theoretical: 26 })
  })

  const witnesses = [
    { key: 'academic_self_concept_chemistry_zh_cn', score: 'academic_self_concept', grade: '11', answers: [2, 2, 3, 3], mean: 2.5, band: 'high', oldClaim: '你已经比较愿意相信自己能学好' },
    { key: 'academic_self_concept_mathematics_zh_cn', score: 'academic_self_concept', grade: '11', answers: [3, 3, 3, 3], mean: 3, band: 'high', oldClaim: '你已经比较愿意相信自己能学好' },
    { key: 'domain_fixed_mindset_chemistry_zh_cn', score: 'domain_fixed_mindset', grade: '8', answers: [3, 3, 4], mean: 10 / 3, band: 'high', oldClaim: '自己再练也很难变多少' },
    { key: 'domain_fixed_mindset_mathematics_zh_cn', score: 'domain_fixed_mindset', grade: '8', answers: [3, 4], mean: 3.5, band: 'high', oldClaim: '自己再练也很难变多少' },
    { key: 'teacher_subject_liking_chemistry_zh_cn', score: 'teacher_subject_liking', grade: '8', answers: [4, 4, 4], mean: 4, band: 'low', oldClaim: '整体印象还不太鲜明' },
    { key: 'value_cost_mathematics_zh_cn', score: 'value', grade: '8', answers: [4, 5, 5, 3, 3, 3, 3], mean: 14 / 3, band: 'low', oldClaim: '意义还没有很强的感觉' },
    { key: 'value_cost_mathematics_zh_cn', score: 'value', grade: '11', answers: [4, 5, 5, 3, 3, 3, 3], mean: 14 / 3, band: 'low', oldClaim: '意义还没有很强的感觉' },
    { key: 'value_cost_chemistry_zh_cn', score: 'value', grade: '8', answers: [4, 4, 4, 3, 3, 3, 3], mean: 4, band: 'low', oldClaim: '意义还没有很强的感觉' },
    { key: 'value_cost_chemistry_zh_cn', score: 'cost', grade: '8', answers: [4, 4, 4, 3, 3, 3, 4], mean: 3.25, band: 'high', oldClaim: '比较常觉得化学占用了太多时间' },
  ]
  it.each(witnesses)('corrects the synthetic $key / $score / grade $grade witness without moving its band', witness => {
    const source = getScaleInstrumentSource(witness.key, '1.0.0')!
    const executable = source.executable!
    const result = buildScaleResult({
      scaleId: 'synthetic-report-semantics', instrumentKey: witness.key,
      name: source.catalog.identity.canonicalName, instrumentVersion: '1.0.0',
      definition: executable.definition, referenceSets: executable.references,
      answers: witness.answers.map((value, index) => ({ itemCode: executable.definition.items[index].itemCode, responseValue: String(value) })),
      participantContext: { gradeLevel: witness.grade },
    })
    expect(result.scores.find(score => score.key === witness.score)!.value).toBeCloseTo(witness.mean, 8)
    const reference = result.references.find(entry => entry.scoreKey === witness.score)!
    expect(reference.criterionBand?.key).toBe(witness.band)
    expect(reference.criterionBand?.label).toMatch(/^历史参考组内相对/)
    const report = result.interpretations.find(entry => entry.scoreKey === witness.score)!
    expect(report.headline).toContain('历史参考组内相对')
    expect(report.label).toMatch(/^历史参考组内相对/)
    expect(report.interpretation).toContain('原作答选项')
    expect(report.interpretation).toContain('不等于对题目的绝对认同程度')
    expect(report.interpretation).toContain('即使相对偏低，均分仍可能偏向同意')
    if (witness.key === 'teacher_subject_liking_chemistry_zh_cn') {
      // R1.1.1 removed a warning contradicted by both actual P stage ranges.
      for (const set of executable.references) for (const entry of set.entries) {
        for (const key of ['high', 'very_high']) expect(entry.governance!.bands.find(band => band.key === key)!.lower).toBeGreaterThan(3.5)
      }
      expect(report.interpretation).not.toContain('相对偏高也未必偏向同意')
    } else expect(report.interpretation).toContain('相对偏高也未必偏向同意')
    expect(report.headline + report.interpretation).not.toContain(witness.oldClaim)
  })

  it('keeps anchor and construct boundaries in every fallback and selected-band explanation', () => {
    for (const source of sources) for (const interpretation of source.executable!.definition.report.interpretations) {
      const texts = [interpretation.summary, ...interpretation.bands.map(band => band.summary)]
      for (const text of texts) {
        if (interpretation.scoreKey === 'academic_self_concept') expect(text).toContain('3＝中性')
        else if (interpretation.scoreKey === 'academic_self_efficacy') {
          expect(text).toContain('下学期')
          expect(text).toContain('3＝一般')
          expect(text).toContain('不是客观中等能力')
        } else expect(text).toContain('没有对应的中性选项')
        if (interpretation.scoreKey === 'domain_fixed_mindset') expect(text).toContain('不等于已经测得高成长心态')
        if (interpretation.scoreKey === 'teacher_subject_liking') {
          expect(text).toContain('这是学生感知，不是教师自评')
          expect(text).toContain('认同程度不是“偶尔、经常”的发生频率')
        }
        if (interpretation.scoreKey === 'tutoring_necessity') expect(text).toContain('高分不能证明你感到焦虑')
        if (interpretation.scoreKey === 'value') expect(text).toContain('不相加、不相减，也不互相抵消')
        if (interpretation.scoreKey === 'cost') expect(text).toContain('不是实际学习时长、事情发生频率或心理健康的测量')
      }
    }
  })
})
