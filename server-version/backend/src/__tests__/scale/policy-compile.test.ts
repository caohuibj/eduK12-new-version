import { describe, expect, it } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { compileScalePolicy, hashCompiledScalePolicy } from '../../modules/scale/policy/compile'
import { listScaleInstrumentSources } from '../../modules/scale/onboarding/instrument-registry'
import { compileEffectiveDisclosure, DISCLOSURE_PRESETS, resolveAudienceDisclosure } from '../../modules/scale/policy/disclosure'

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

  it('freezes report visibility independently of the legacy report flags and raw-data ceiling', () => {
    const envelope={schemaVersion:1 as const,unknownAudience:'DENY' as const}
    const legacy={...envelope,policyVersion:'c1',audiences:{
      teacher:{...DISCLOSURE_PRESETS.SCORES(),methods:true},
    }}
    const visibility={numericScores:true,references:true,scoreDerivedLabels:true,individualInterpretations:true,educationalContent:true,artwork:false}
    const policy=compileEffectiveDisclosure(undefined,{...envelope,policyVersion:'r2',audiences:{teacher:visibility}},legacy)
    expect(resolveAudienceDisclosure(policy,'teacher')).toEqual({...visibility,rawAnswers:false,itemScores:false,methods:true,resultQualityDetails:false})
    expect(resolveAudienceDisclosure(policy,'subject')).toMatchObject({numericScores:false,artwork:false})
    expect(resolveAudienceDisclosure(policy,'unregistered')).toEqual(DISCLOSURE_PRESETS.NONE())
    expect(compileEffectiveDisclosure(undefined,undefined,legacy)).toEqual(legacy)
  })

  it('preserves implicit legacy artwork when a C data ceiling is introduced', () => {
    const envelope = { schemaVersion: 1 as const, unknownAudience: 'DENY' as const }
    const ceiling = { ...envelope, policyVersion: 'c2', audiences: {} }
    const legacy = { ...envelope, policyVersion: 'old-r', audiences: {
      subject: DISCLOSURE_PRESETS.EDUCATIONAL_ONLY(),
      teacher: DISCLOSURE_PRESETS.SCORES(),
    } }
    const policy = compileEffectiveDisclosure(ceiling, undefined, legacy)
    expect(resolveAudienceDisclosure(policy, 'subject')).toMatchObject({ artwork: true, rawAnswers: false })
    expect(resolveAudienceDisclosure(policy, 'teacher')).toMatchObject({ artwork: false, numericScores: true })
    expect(resolveAudienceDisclosure(compileEffectiveDisclosure(ceiling,
      { ...envelope, policyVersion: 'new-r', audiences: {} }, legacy), 'subject')).toMatchObject({ artwork: false })
  })
})
