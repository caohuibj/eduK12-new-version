import { describe, expect, it } from 'vitest'
import { generatedPackages } from '../../modules/assessment-bundle/onboarding/catalog'
import { dependencyBlockers } from '../../modules/assessment-bundle/onboarding/dependencies'
import { publicDeclarationDependencies } from '../../modules/assessment-bundle/onboarding/public-check'

const parent = () => structuredClone(generatedPackages().find(p => p.manifest.definition.bundleKey === 'child_chexi_parent_zh_cn_v1')!)
describe('public Bundle declarations without private source text', () => {
  it('retains all declarations and reports private source unavailability explicitly', () => {
    const results = generatedPackages().map(publicDeclarationDependencies)
    expect(results.flatMap(r => r.blockers)).toEqual([])
    expect(results.filter(r => r.unavailablePrivateSources.length)).toHaveLength(5)
    expect(dependencyBlockers(parent())).toEqual(['chexi: unknown SCALE identity'])
  })
  it('does not exempt another bundle or source version', () => {
    const other = parent(); other.manifest.definition.bundleKey = 'unreviewed_child'
    expect(publicDeclarationDependencies(other).blockers).toContain('chexi: unknown SCALE identity')
    const published = parent(); published.manifest.definition.status = 'PUBLISHED'
    expect(() => publicDeclarationDependencies(published)).toThrow()
    const version = parent(); version.manifest.definition.slots[0].instrumentVersion = '9.0.0'
    expect(publicDeclarationDependencies(version).blockers).toContain('chexi: unknown SCALE identity')
  })
  it('does not excuse selector mismatches for available sources', () => {
    const pack = structuredClone(generatedPackages().find(p => p.manifest.definition.bundleKey === 'integrated_gonogo_adexi_adult_zh_cn_v1')!)
    const slot = pack.manifest.definition.slots.find(s => s.unitType === 'SCALE')!
    pack.evidence.find(e => e.slotKey === slot.slotKey)!.selector = 'nonexistent_score'
    expect(() => publicDeclarationDependencies(pack)).toThrow('selector not declared in slot')
  })
})
