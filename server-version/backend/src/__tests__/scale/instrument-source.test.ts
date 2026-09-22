import { describe, expect, it } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import {
  assertUniqueExecutablePackagesForTest,
  assertUniqueScorerPluginsForTest,
} from '../../modules/scale/onboarding/executable-registry'
import {
  createScaleInstrumentRegistry,
  listScaleInstrumentSources,
} from '../../modules/scale/onboarding/instrument-registry'
import { scaleInstrumentSourceV1Schema } from '../../modules/scale/onboarding/schema'
import type { VersionedScorerRegistration } from '../../modules/scale/onboarding/types'

const legacyExecutableIdentities = [
  'adexi_v1:2.0.0',
  'who5:1.0.0',
  'sdq_parent_zh_cn:1.0.0',
  'sdq_teacher_zh_cn:1.0.0',
  'texi_parent_zh_cn:1.0.0',
  'texi_teacher_zh_cn:1.0.0',
]

const catalogOnlyIdentities = [
  'dass21_zh_cn:1.0.0',
  'gse_zh_cn:1.0.0',
  'mpfi24_zh_cn:1.0.0',
  'pss10_zh_cn:1.0.0',
]

describe('ScaleInstrumentSourceV1 registry', () => {
  it('preserves the six-package legacy API order and definition hashes', () => {
    const packages = listScalePackages()
    const packageIdentities = packages.map((pkg) => `${pkg.key}:${pkg.instrumentVersion}`)
    expect(packageIdentities.slice(0, legacyExecutableIdentities.length)).toEqual(legacyExecutableIdentities)
    expect(new Set(packageIdentities).size).toBe(packageIdentities.length)

    const sourceByIdentity = new Map(listScaleInstrumentSources().map((source) => [
      `${source.identity.instrumentKey}:${source.identity.instrumentVersion}`,
      source,
    ]))
    packages.forEach((pkg) => {
      const source = sourceByIdentity.get(`${pkg.key}:${pkg.instrumentVersion}`)
      expect(source?.executable).toBeDefined()
      expect(hashScaleDefinition(source!.executable!.definition)).toBe(hashScaleDefinition(pkg.definition))
      expect(source!.executable!.goldenCases).toEqual(pkg.goldenCases)
    })
  })

  it('enumerates sources exactly once while allowing new content identities', () => {
    const sources = listScaleInstrumentSources()
    const identities = sources.map((source) => `${source.identity.instrumentKey}:${source.identity.instrumentVersion}`)
    expect(new Set(identities).size).toBe(identities.length)
    expect(identities).toEqual([...identities].sort((left, right) => left.localeCompare(right)))

    const executableIdentities = sources
      .filter((source) => source.executable)
      .map((source) => `${source.identity.instrumentKey}:${source.identity.instrumentVersion}`)
    legacyExecutableIdentities.forEach((identity) => expect(executableIdentities).toContain(identity))

    const catalogOnly = sources
      .filter((source) => !source.executable)
      .map((source) => `${source.identity.instrumentKey}:${source.identity.instrumentVersion}`)
    catalogOnlyIdentities.forEach((identity) => expect(catalogOnly).toContain(identity))
  })

  it('allows a catalog-only source but rejects a new executable without explicit policy', () => {
    const candidate = listScaleInstrumentSources().find((source) => !source.executable)
    expect(candidate).toBeDefined()
    expect(scaleInstrumentSourceV1Schema.safeParse(candidate).success).toBe(true)

    const executable = listScaleInstrumentSources().find((source) => source.executable)
    expect(executable).toBeDefined()
    const { applicability: _applicability, ...withoutApplicability } = executable!
    expect(scaleInstrumentSourceV1Schema.safeParse(withoutApplicability).success).toBe(false)
  })

  it('rejects unknown source fields and duplicate exact identities', () => {
    const source = listScaleInstrumentSources()[0]
    expect(scaleInstrumentSourceV1Schema.safeParse({ ...source, unexpected: true }).success).toBe(false)
    expect(() => createScaleInstrumentRegistry([source, source])).toThrow(/Duplicate ScaleInstrumentSource identity/)
  })

  it('rejects duplicate executable identities before Map overwrite', () => {
    const pkg = listScalePackages()[0]
    expect(() => assertUniqueExecutablePackagesForTest([pkg, pkg])).toThrow(/Duplicate scale executable identity/)
  })

  it('rejects duplicate scorer descriptors and active-key version collisions', () => {
    const scorer: VersionedScorerRegistration['scorer'] = () => ({ scores: [] })
    const first: VersionedScorerRegistration = { key: 'test-scorer', version: '1.0.0', scorer }
    expect(() => assertUniqueScorerPluginsForTest([first, first])).toThrow(/Duplicate scale scorer plugin descriptor/)
    expect(() => assertUniqueScorerPluginsForTest([first, { ...first, version: '2.0.0' }])).toThrow(/Multiple versions/)
  })
})
