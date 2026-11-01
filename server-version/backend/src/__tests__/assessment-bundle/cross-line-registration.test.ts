import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverPackages } from '../../modules/assessment-bundle/onboarding/loader'
import { generatedPackages } from '../../modules/assessment-bundle/onboarding/catalog'
import { dependencyBlockers } from '../../modules/assessment-bundle/onboarding/dependencies'
import { createCodeBundleDefinitionProvider } from '../../modules/bundle-product/code-catalog'
import { getExecutableScalePackage } from '../../modules/scale/onboarding/executable-registry'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'

const additions = [
  'integrated_gonogo_adexi_adult_zh_cn_v1@1.1.0',
  'cognitive_self_regulation_adolescent_en_v1@1.0.0',
  'child_chexi_parent_zh_cn_v1@0.1.0', 'child_chexi_teacher_zh_cn_v1@0.1.0',
  'child_cognitive_control_parent_teacher_zh_cn@0.1.0',
  'child_cognitive_control_parent_zh_cn@0.1.0', 'child_cognitive_control_teacher_zh_cn@0.1.0',
  'child_cognitive_tasks_zh_cn@0.1.0',
]
describe('local three-line registration junction only', () => {
  it('loads the exact union once, preserves legacy and base packages, and resolves all three histories', () => {
    const discovered = discoverPackages(path.resolve(__dirname, '../../modules/assessment-bundle/packages'))
    const generated = generatedPackages()
    expect(generated).toHaveLength(12)
    expect(canonicalHash(generated)).toBe(canonicalHash(discovered))
    const provider = createCodeBundleDefinitionProvider()
    for (const identity of additions) {
      const [key, version] = identity.split('@')
      expect(provider.exact(key, version)?.definition.status).toBe('DRAFT')
    }
    expect(provider.exact('integrated_gonogo_adexi_adult_zh_cn_v1', '1.0.0')!.definition.slots).toHaveLength(2)
    expect(provider.exact('learning_motivation_math_support', '0.1.1')).not.toBeNull()
    expect(provider.exact('learning_motivation_math_support', '0.1.2')).not.toBeNull()
    expect(new Set(provider.list().map(p => p.definition.bundleKey + '@' + p.definition.bundleVersion)).size).toBe(provider.list().length)
  })
  it('keeps real private source dependencies explicit instead of fabricating public executables', () => {
    expect(getExecutableScalePackage('texi_self_en', '1.0.0')).toBeDefined()
    expect(getExecutableScalePackage('chexi_zh_hans', '1.0.0')).toBeUndefined()
    expect(getExecutableScalePackage('texi_self_zh_cn', '1.0.0')).toBeUndefined()
    const provider = createCodeBundleDefinitionProvider()
    expect(provider.exact('cognitive_self_regulation_adolescent_zh_cn_v1', '1.0.0')).toBeNull()
    for (const pack of generatedPackages()) {
      const unknown = pack.manifest.definition.slots.filter(s => s.unitType === 'SCALE' && s.instrumentKey === 'chexi_zh_hans')
        .map(s => `${s.slotKey}: unknown SCALE identity`).sort()
      expect(dependencyBlockers(pack)).toEqual(unknown)
    }
  })
})
