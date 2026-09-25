import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as GRIT } from '../../../modules/scale/instruments/grit_s_zh_cn/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as BSCS } from '../../../modules/scale/instruments/bscs_zh_cn/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as CDRISC2 } from '../../../modules/scale/instruments/cdrisc2_zh_cn/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as GENERAL_FIXED } from '../../../modules/scale/instruments/general_fixed_mindset_zh_cn/1.0.0/instrument'
import { SCALE_INSTRUMENT_SOURCE as CROSS_DOMAIN } from '../../../modules/scale/instruments/cross_domain_talent_beliefs_zh_cn/1.0.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { scoreScale } from '../../../modules/scale/scale-scoring'

const sources = [GRIT, BSCS, CDRISC2, GENERAL_FIXED, CROSS_DOMAIN]
const packages = sources.map((source) => projectScalePackage(source)!)

describe('student traits PILOT batch 2', () => {
  it('keeps all five sources deterministic, executable, and PILOT', () => {
    sources.forEach((source) => {
      expect(validateScaleInstrumentSource(source).valid).toBe(true)
      expect(source.catalog.scientificMaturity).toBe('PILOT')
      expect(source.executable?.releaseStatus).toBe('PUBLISHED')
    })
    packages.forEach((pkg) => expect(validateScalePackage(pkg).valid).toBe(true))
  })

  it('restores the canonical Grit-S 8-item five-point form and reverse keys', () => {
    const pkg = projectScalePackage(GRIT)!
    expect(pkg.definition.items).toHaveLength(8)
    expect(pkg.definition.responseSets[0]?.options.map((option) => option.score)).toEqual([1, 2, 3, 4, 5])
    expect(pkg.definition.responseSets[0]?.options.map((option) => option.label)).toEqual([
      '一点也不像我',
      '不太像我',
      '有点像我',
      '比较像我',
      '非常像我',
    ])
    expect(pkg.definition.scoring.itemRules.filter((row) => row.transform.type === 'reverse').map((row) => row.itemCode)).toEqual([
      'GRIT-S-01',
      'GRIT-S-03',
      'GRIT-S-05',
      'GRIT-S-06',
    ])
    expect(pkg.definition.scoring.scores.map((score) => score.key)).toEqual([
      'grit_total',
      'consistency_of_interest',
      'perseverance_of_effort',
    ])
    expect(pkg.definition.report.interpretations.every((row) => row.bands.length === 0)).toBe(true)
    expect(pkg.definition.referencePolicy).toEqual({ type: 'none' })
  })

  it('restores the standard 13-item BSCS order and overall-score-only reporting', () => {
    const pkg = projectScalePackage(BSCS)!
    expect(pkg.definition.items).toHaveLength(13)
    expect(pkg.definition.items[0]?.content).toContain('抵制诱惑')
    expect(pkg.definition.items[12]?.content).toContain('不进行全面考虑')
    expect(pkg.definition.scoring.itemRules.filter((row) => row.transform.type === 'reverse').map((row) => row.itemCode)).toEqual([
      'BSCS-02',
      'BSCS-03',
      'BSCS-04',
      'BSCS-05',
      'BSCS-07',
      'BSCS-09',
      'BSCS-10',
      'BSCS-12',
      'BSCS-13',
    ])
    expect(pkg.definition.scoring.scores.map((score) => score.key)).toEqual(['self_control'])
    const high = scoreScale(pkg.definition, [
      { itemCode: 'BSCS-01', responseValue: '5' },
      { itemCode: 'BSCS-02', responseValue: '1' },
      { itemCode: 'BSCS-03', responseValue: '1' },
      { itemCode: 'BSCS-04', responseValue: '1' },
      { itemCode: 'BSCS-05', responseValue: '1' },
      { itemCode: 'BSCS-06', responseValue: '5' },
      { itemCode: 'BSCS-07', responseValue: '1' },
      { itemCode: 'BSCS-08', responseValue: '5' },
      { itemCode: 'BSCS-09', responseValue: '1' },
      { itemCode: 'BSCS-10', responseValue: '1' },
      { itemCode: 'BSCS-11', responseValue: '5' },
      { itemCode: 'BSCS-12', responseValue: '1' },
      { itemCode: 'BSCS-13', responseValue: '1' },
    ])
    expect(high.scores.find((row) => row.key === 'self_control')?.value).toBe(5)
  })

  it('restores standard CD-RISC2 past-month 0-4 response scoring and 0-8 sum', () => {
    const pkg = projectScalePackage(CDRISC2)!
    expect(pkg.definition.items).toHaveLength(2)
    expect(pkg.definition.responseSets[0]?.options.map((option) => option.score)).toEqual([0, 1, 2, 3, 4])
    expect(CDRISC2.catalog.administration.timeFrame).toBe('过去一个月')
    const highest = scoreScale(pkg.definition, [
      { itemCode: 'CDRISC2-01', responseValue: '4' },
      { itemCode: 'CDRISC2-02', responseValue: '4' },
    ])
    expect(highest.scores.find((row) => row.key === 'resilience')?.value).toBe(8)
    expect(pkg.definition.scoring.itemRules.every((row) => row.transform.type === 'identity')).toBe(true)
    expect(pkg.definition.referencePolicy).toEqual({ type: 'none' })
  })

  it('freezes the project General Fixed Mindset form with two-of-three scoring', () => {
    const pkg = projectScalePackage(GENERAL_FIXED)!
    expect(pkg.definition.items).toHaveLength(3)
    expect(pkg.definition.responseSets[0]?.options.map((option) => option.score)).toEqual([1, 2, 3, 4, 5, 6])
    const partial = scoreScale(pkg.definition, [
      { itemCode: 'GFM-01', responseValue: '4' },
      { itemCode: 'GFM-02', responseValue: '6' },
    ])
    expect(partial.quality.status).toBe('limited')
    expect(partial.scores.find((row) => row.key === 'general_fixed_mindset')?.value).toBe(5)
    expect(pkg.definition.scoring.itemRules.every((row) => row.transform.type === 'identity')).toBe(true)
  })

  it('freezes the self-developed Cross-Domain Talent Beliefs form with three-of-four scoring', () => {
    const pkg = projectScalePackage(CROSS_DOMAIN)!
    expect(pkg.definition.items).toHaveLength(4)
    expect(CROSS_DOMAIN.executable?.definition.license.status).toBe('self_authored')
    const partial = scoreScale(pkg.definition, [
      { itemCode: 'CDTB-01', responseValue: '2' },
      { itemCode: 'CDTB-02', responseValue: '4' },
      { itemCode: 'CDTB-03', responseValue: '6' },
    ])
    expect(partial.quality.status).toBe('limited')
    expect(partial.scores.find((row) => row.key === 'cross_domain_talent_beliefs')?.value).toBe(4)
    expect(pkg.definition.referencePolicy).toEqual({ type: 'none' })
  })

  it('keeps every report descriptive and non-normative', () => {
    packages.forEach((pkg) => {
      expect(pkg.definition.report.interpretations.length).toBeGreaterThan(0)
      expect(pkg.definition.report.interpretations.every((row) => row.source.type === 'score_only')).toBe(true)
      expect(pkg.definition.report.interpretations.every((row) => row.bands.length === 0)).toBe(true)
      expect(pkg.definition.referencePolicy).toEqual({ type: 'none' })
      expect(pkg.definition.report.disclaimer.length).toBeGreaterThan(20)
    })
  })
})
