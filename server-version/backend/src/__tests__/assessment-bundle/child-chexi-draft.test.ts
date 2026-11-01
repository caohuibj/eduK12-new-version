import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createChexiZhHansSource, CHEXI_ITEM_GROUPS } from '../../modules/scale/packages/chexi-zh-hans-v1'
import { parseScaleInstrumentSourceSchema } from '../../modules/scale/onboarding/schema'
import { validateScaleInstrumentSource } from '../../modules/scale/onboarding/validate-instrument'
import { scoreScale } from '../../modules/scale/scale-scoring'
import { childChexiObserverDefinition } from '../../modules/assessment-bundle/bundles/child-chexi-observer-zh-cn-v1'
import { parseAssessmentBundleDefinition } from '../../modules/assessment-bundle/definition'
import { loadPackage } from '../../modules/assessment-bundle/onboarding/loader'
import { verifyPackageFixtures } from '../../modules/assessment-bundle/onboarding/fixtures'
import { dependencyBlockers } from '../../modules/assessment-bundle/onboarding/dependencies'

// Synthetic text exercises the real scorer; official text lives in the private
// administrator import, whose separate validation does not make it installed.
const source = () => createChexiZhHansSource({ items: Array.from({ length: 24 }, (_, i) => `合成题文 ${i + 1}`), instruction: '合成观察指导语' })
const definition = () => source().executable!.definition
const answers = (value: number) => Array.from({ length: 24 }, (_, i) => ({ itemCode: `CHEXI-${String(i + 1).padStart(2, '0')}`, responseValue: value }))
const score = (input: ReturnType<typeof answers>) => scoreScale(definition(), input)
const pack = () => loadPackage(path.resolve(__dirname, '../../modules/assessment-bundle/intake-candidates/child_cognitive_tasks_zh_cn/0.1.0'))

describe('child CHEXI shared content and separate reporters', () => {
  it('assembles a valid private DRAFT with explicit unknown rights and an official translation identity', () => {
    const s = source()
    expect(parseScaleInstrumentSourceSchema(s).identity).toEqual(s.identity)
    expect(validateScaleInstrumentSource(s)).toMatchObject({ valid: true, issues: [] })
    expect(s.executable!.releaseStatus).toBe('DRAFT')
    expect(s.executable!.definition.license).toMatchObject({ status: 'unknown', redistribution: 'unknown' })
    expect(s.localization).toMatchObject({ sourceLocale: 'zh-CN', targetLocale: 'zh-CN', adaptationMethod: 'ORIGINAL_SOURCE', reviewStatus: 'PENDING' })
    expect(s.catalog.population).toMatchObject({ minAge: 4, maxAge: 12, respondentTypes: ['PARENT', 'TEACHER'] })
  })

  it('reuses one instrument and score set for the two actual adult observers', () => {
    const parent = childChexiObserverDefinition('PARENT'), teacher = childChexiObserverDefinition('TEACHER')
    expect(parent.slots[0].instrumentKey).toBe(teacher.slots[0].instrumentKey)
    expect(parent.slots[0].instrumentVersion).toBe(teacher.slots[0].instrumentVersion)
    expect(parent.slots[0].valueSelectors).toEqual(teacher.slots[0].valueSelectors)
    expect(parent.respondentTypes).toEqual(['PARENT'])
    expect(teacher.respondentTypes).toEqual(['TEACHER'])
    expect(parent.slots[0].respondentType).toBe('PARENT')
    expect(teacher.slots[0].respondentType).toBe('TEACHER')
  })

  it('scores every item into its published factor and facet, using direct item means', () => {
    const independentGroups = {
      working_memory: [1, 3, 6, 7, 9, 12, 14, 17, 19, 20, 21, 23, 24],
      inhibition: [2, 4, 5, 8, 10, 11, 13, 15, 16, 18, 22],
      working_memory_facet: [1, 3, 6, 7, 9, 19, 21, 23, 24], planning: [12, 14, 17, 20],
      regulation: [2, 4, 8, 11, 15], inhibition_facet: [5, 10, 13, 16, 18, 22],
    }
    expect(CHEXI_ITEM_GROUPS).toEqual(independentGroups)
    for (let n = 1; n <= 24; n++) {
      const input = answers(1); input[n - 1].responseValue = 5
      const output = score(input)
      for (const [key, group] of Object.entries(independentGroups)) {
        const expected = (group.length + (group.includes(n) ? 4 : 0)) / group.length
        expect(output.scores.find(s => s.key === key)!.value).toBeCloseTo(expected, 10)
      }
    }
    // Four planning items at 5 and nine WM items at 1: 29/13, not (1+5)/2.
    const input = answers(1)
    for (const n of independentGroups.planning) input[n - 1].responseValue = 5
    expect(score(input).scores.find(s => s.key === 'working_memory')!.value).toBeCloseTo(29 / 13, 10)
  })

  it('leaves incomplete means null, keeps intact scores, and never invents a total or norm', () => {
    const output = score(answers(1).slice(0, 23))
    expect(output.quality.status).toBe('invalid')
    expect(output.scores.find(s => s.key === 'working_memory')!.value).toBeNull()
    expect(output.scores.find(s => s.key === 'inhibition')!.value).toBe(1)
    expect(definition().scoring.scores.every(s => s.type === 'dimension')).toBe(true)
    expect(definition().report.interpretations.every(i => i.bands.length === 0)).toBe(true)
    expect(definition().referencePolicy).toEqual({ type: 'none' })
    expect(() => createChexiZhHansSource({ items: ['缺少题目'], instruction: '指导语' })).toThrow('CHEXI_OFFICIAL_24_ITEM_MATERIAL_REQUIRED')
  })

  it('keeps exact metrics and exposes the existing integer dependency mismatch before registration', () => {
    const p = pack()
    // The authoring contract has number, but registry counts declare integer.
    // Retain true denominators and report this shared gap; do not rename them
    // as ratios or weaken the dependency validator just to pass admission.
    expect(dependencyBlockers(p)).toEqual([
      'gonogo_commission_errors: COGNITIVE selector/type/unit mismatch',
      'gonogo_go_trial_count: COGNITIVE selector/type/unit mismatch',
      'gonogo_nogo_trial_count: COGNITIVE selector/type/unit mismatch',
    ])
    expect(verifyPackageFixtures(p)).toHaveLength(4)
    expect(p.manifest.cognitiveDependencies.every(d => d.profile === 'standard')).toBe(true)
    expect(p.manifest.definition.slots.filter(s => s.unitType === 'COGNITIVE').map(s => s.respondentType)).toEqual(['SELF', 'SELF'])
    expect(p.fixtures.valid.values.flanker_flanker_effect_ms).toEqual({ state: 'present', value: -12 })
    expect(p.fixtures.valid.values.gonogo_omission_rate).toEqual({ state: 'present', value: 0 })
    expect(p.fixtures['not-applicable'].expectedKind).toBe('UNAVAILABLE')
  })

  it('documents rather than bypasses the current mixed-respondent runtime limit', () => {
    const p = pack(), observer = childChexiObserverDefinition('PARENT').slots[0]
    const mixed = { ...p.manifest.definition, category: 'integrated', respondentTypes: ['SELF', 'PARENT'], slots: [...p.manifest.definition.slots, { ...observer, position: 3 }] }
    expect(() => parseAssessmentBundleDefinition(mixed)).toThrow()
    // Do not erase PARENT to make a child/adult mixed workflow look executable.
    expect(observer.respondentType).toBe('PARENT')
  })
})
