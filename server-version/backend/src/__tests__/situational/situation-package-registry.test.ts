import { describe, expect, it } from 'vitest'
import {
  getSituationPackage,
  hasSituationPackage,
  listSituationPackages,
  validateSituationPackage,
  type SituationPackageV1,
} from '../../modules/situational/situation-package.registry'
import { instrumentSourceSchema } from '../../modules/situational/onboarding/schema'
import { GENERATED_SITUATIONAL_INSTRUMENT_SOURCES } from '../../modules/situational/onboarding/instruments.generated'
import { SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-anxiety-golden-zh-cn-v1'

describe('situation package registry', () => {
  it('retains golden identities, catalog order, uniqueness, and exact version resolution', () => {
    const packages = listSituationPackages()
    const identities = packages.map(p => `${p.key}@${p.instrumentVersion}`)
    expect(identities).toEqual(expect.arrayContaining([
      'sjt-assertiveness-golden@1.0.0',
      'sjt-responsibility-golden@1.0.0',
      'sjt-anxiety-golden@1.0.0',
    ]))
    const expectedCatalog = GENERATED_SITUATIONAL_INSTRUMENT_SOURCES
      .map(source => instrumentSourceSchema.parse(source))
      .sort((a, b) => a.content.catalogOrder - b.content.catalogOrder
        || a.content.identity.instrumentKey.localeCompare(b.content.identity.instrumentKey, 'en'))
      .map(source => [source.content.identity.instrumentKey, source.content.identity.instrumentVersion])
    expect(packages.map(p => [p.key, p.instrumentVersion])).toEqual(expectedCatalog)
    expect(new Set(identities).size).toBe(packages.length)
    for (const p of packages) {
      expect(hasSituationPackage(p.key, p.instrumentVersion)).toBe(true)
      expect(getSituationPackage(p.key, p.instrumentVersion)).toBe(p)
    }
    expect(hasSituationPackage('sjt-anxiety-golden', '1.0.0')).toBe(true)
    expect(hasSituationPackage('sjt-anxiety-golden', '9.9.9')).toBe(false)
    expect(getSituationPackage('sjt-anxiety-golden', '1.0.0')?.key).toBe('sjt-anxiety-golden')
  })

  it('validates every package cleanly (definition, hash, runner, golden cases)', () => {
    listSituationPackages().forEach((situationPackage) => {
      const validation = validateSituationPackage(situationPackage)
      // self_authored content is expected to carry the descriptive-presentation warning
      expect(validation.issues.filter((issue) => issue.severity === 'error')).toEqual([])
      expect(validation.issues.filter((issue) => issue.severity === 'warning').every((issue) => issue.path === 'license')).toBe(true)
      expect(validation.valid).toBe(true)
      expect(validation.definitionHash).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  it('flags packages with broken golden expectations or invalid identity', () => {
    const brokenGolden: SituationPackageV1 = {
      ...SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE,
      goldenCases: SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE.goldenCases.map((fixture) => (
        fixture.name === 'high-threat-high-arousal'
          ? { ...fixture, expected: { ...fixture.expected, metrics: { 'bfi2.anxiety.appraisal': 9, 'bfi2.anxiety.emotion': 80 } } }
          : fixture
      )),
    }
    const goldenValidation = validateSituationPackage(brokenGolden)
    expect(goldenValidation.valid).toBe(false)
    expect(goldenValidation.issues.some((issue) => issue.path.startsWith('goldenCases.0.metrics.'))).toBe(true)

    const brokenIdentity: SituationPackageV1 = { ...SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE, key: '' }
    const identityValidation = validateSituationPackage(brokenIdentity)
    expect(identityValidation.valid).toBe(false)
    expect(identityValidation.issues.some((issue) => issue.path === 'key')).toBe(true)

    const brokenMaturity = {
      ...SJT_ANXIETY_GOLDEN_ZH_CN_V1_PACKAGE,
      scienceMaturity: 'EXPERIMENTAL',
    } as unknown as SituationPackageV1
    const maturityValidation = validateSituationPackage(brokenMaturity)
    expect(maturityValidation.valid).toBe(true)
    expect(maturityValidation.issues.some((issue) => issue.path === 'scienceMaturity')).toBe(false)
  })
})

