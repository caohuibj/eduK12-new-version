import { describe, expect, it } from 'vitest'
import { validateScaleProductDefinition } from '../../modules/scale/product-definition-readiness'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../modules/scale/scale-package.registry'
import { validateTaskDefinition } from '../../modules/cognitive/v2/publication-gate'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { validateSituationPackage } from '../../modules/situational/situation-package.registry'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'

describe('product publication boundaries', () => {
  it('does not require Scale source/license provenance for executable publication', () => {
    const definition = {
      ...WHO5_ZH_CN_V1_PACKAGE.definition,
      source: {},
      license: { status: 'unknown' as const, redistribution: 'unknown' as const },
    }
    const decision = validateScaleProductDefinition(definition, 'STANDARD')
    expect(decision.valid, JSON.stringify(decision.issues)).toBe(true)
  })

  it('still blocks a Scale presentation capability the current runner does not support', () => {
    const definition = {
      ...WHO5_ZH_CN_V1_PACKAGE.definition,
      display: { randomizeItems: true },
      source: {},
      license: { status: 'unknown' as const, redistribution: 'unknown' as const },
    }
    const decision = validateScaleProductDefinition(definition, 'STANDARD')
    expect(decision.valid).toBe(false)
    expect(decision.issues).toContainEqual(expect.objectContaining({ path: 'display.randomizeItems', severity: 'error' }))
  })

  it('does not require a Cognitive reference mapping to publish an otherwise executable task', () => {
    const base = getCognitiveV2TaskDefinition('reaction', '1.0.0', '1.1.0')
    if (!base) throw new Error('reaction definition missing')
    const definition = {
      ...base,
      references: [],
      publication: { ...base.publication, status: 'PUBLISHED' as const, referenceRequired: true },
    }
    const issues = validateTaskDefinition(definition)
    expect(issues.some((issue) => issue.path === 'references' && issue.severity === 'error')).toBe(false)
    expect(issues).toContainEqual(expect.objectContaining({ path: 'references', severity: 'warning' }))
  })

  it('does not require Situational source/license provenance for executable publication', () => {
    const pkg = {
      ...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE,
      definition: {
        ...SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE.definition,
        source: {},
        license: { status: 'unknown' as const, redistribution: 'unknown' as const },
      },
    }
    const decision = validateSituationPackage(pkg)
    expect(decision.valid, JSON.stringify(decision.issues)).toBe(true)
  })
})
