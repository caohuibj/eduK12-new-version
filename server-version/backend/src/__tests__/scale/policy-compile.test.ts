import { describe, expect, it } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { compileScalePolicy, hashCompiledScalePolicy } from '../../modules/scale/policy/compile'
import { listScaleInstrumentSources } from '../../modules/scale/onboarding/instrument-registry'

describe('compiled scale policy', () => {
  it('is deterministic and self-hashing', () => {
    const source = listScaleInstrumentSources().find((candidate) => candidate.executable)!
    const first = compileScalePolicy(source)
    const second = compileScalePolicy(source)
    expect(second).toEqual(first)
    expect(hashCompiledScalePolicy(first)).toBe(first.runtimePolicyHash)
  })

  it('does not include catalog prose or scientific evidence in runtimePolicyHash', () => {
    const source = listScaleInstrumentSources().find((candidate) => candidate.executable)!
    const baseline = compileScalePolicy(source)
    const changedCatalog = {
      ...source,
      catalog: {
        ...source.catalog,
        construct: {
          ...source.catalog.construct,
          constructDefinition: `${source.catalog.construct.constructDefinition} governance-only edit`,
        },
        evidence: [...source.catalog.evidence, {
          evidenceId: 'test-only-evidence',
          evidenceType: 'CONTENT_VALIDITY' as const,
          population: 'test population',
          locale: 'zh-CN',
          territory: 'CN',
          studyDesign: 'test only',
          rating: 'UNKNOWN' as const,
          citation: 'test citation',
        }],
      },
    }
    expect(compileScalePolicy(changedCatalog).runtimePolicyHash).toBe(baseline.runtimePolicyHash)
  })

  it('changes policy hash without changing definitionHash when applicability changes', () => {
    const source = listScaleInstrumentSources().find((candidate) => candidate.executable)!
    const definitionHash = hashScaleDefinition(source.executable!.definition)
    const baseline = compileScalePolicy(source)
    const changed = {
      ...source,
      applicability: {
        ...source.applicability!,
        policyVersion: 'test-policy-v2',
        subject: { ageMonths: { minInclusive: 168 } },
      },
    }
    expect(compileScalePolicy(changed).runtimePolicyHash).not.toBe(baseline.runtimePolicyHash)
    expect(hashScaleDefinition(changed.executable!.definition)).toBe(definitionHash)
  })

  it('does not compile catalog-only candidates', () => {
    const source = listScaleInstrumentSources().find((candidate) => !candidate.executable)!
    expect(() => compileScalePolicy(source)).toThrow(/Catalog-only/)
  })
})
