import { describe, expect, it } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { getScalePackage } from '../../modules/scale/scale-package.registry'
import { createScaleCatalogRegistry } from '../../modules/scale/library/catalog-registry'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const base = () => validCatalogManifestBase()

describe('ScaleCatalogRegistry package binding (SL1-C6)', () => {
  it('binds a catalog manifest to the registered package by instrumentKey + instrumentVersion', () => {
    const registry = createScaleCatalogRegistry([base()])
    expect(registry.valid).toBe(true)
    const entry = registry.getEntry('who5', '1.0.0')
    expect(entry?.bindingStatus).toBe('BOUND')
    expect(entry?.pkg?.key).toBe('who5')
    expect(entry?.pkg?.instrumentVersion).toBe('1.0.0')
    expect(registry.getEntry('who5', '9.9.9')).toBeUndefined()
  })

  it('rejects duplicate catalog manifests for the same binding key', () => {
    const registry = createScaleCatalogRegistry([base(), base()])
    expect(registry.valid).toBe(false)
    expect(registry.diagnostics.filter((diagnostic) => diagnostic.code === 'DUPLICATE_CATALOG_MANIFEST')).toHaveLength(1)
  })

  it('flags an orphan catalog entry when no package exists for the key at all', () => {
    const manifest = base()
    manifest.identity = { ...manifest.identity, instrumentKey: 'totally_unknown_scale' }
    const registry = createScaleCatalogRegistry([manifest])
    expect(registry.valid).toBe(false)
    const diagnostic = registry.diagnostics.find((entry) => entry.code === 'CATALOG_PACKAGE_MISSING')
    expect(diagnostic?.severity).toBe('error')
    expect(diagnostic?.message).toContain('totally_unknown_scale')
    expect(registry.getEntry('totally_unknown_scale', '1.0.0')?.bindingStatus).toBe('PACKAGE_MISSING')
  })

  it('distinguishes a version mismatch from a fully missing package', () => {
    const manifest = base()
    manifest.identity = { ...manifest.identity, instrumentVersion: '9.9.9' }
    const registry = createScaleCatalogRegistry([manifest])
    expect(registry.valid).toBe(false)
    const diagnostic = registry.diagnostics.find((entry) => entry.code === 'CATALOG_PACKAGE_VERSION_MISMATCH')
    expect(diagnostic?.severity).toBe('error')
    expect(registry.getEntry('who5', '9.9.9')?.bindingStatus).toBe('PACKAGE_VERSION_MISMATCH')
  })

  it('produces an error diagnostic for an invalid manifest instead of throwing', () => {
    const registry = createScaleCatalogRegistry([{ identity: 'not-a-manifest' }])
    expect(registry.valid).toBe(false)
    const diagnostic = registry.diagnostics.find((entry) => entry.code === 'INVALID_CATALOG_MANIFEST')
    expect(diagnostic?.severity).toBe('error')
    expect(registry.entries).toHaveLength(0)
  })

  it('warns about registered packages that have no catalog yet without blocking validity', () => {
    const registry = createScaleCatalogRegistry([base()])
    const withoutCatalog = registry.diagnostics.filter((diagnostic) => diagnostic.code === 'PACKAGE_WITHOUT_CATALOG')
    expect(withoutCatalog.length).toBeGreaterThanOrEqual(1)
    expect(withoutCatalog.every((diagnostic) => diagnostic.severity === 'warning')).toBe(true)
    expect(withoutCatalog.map((diagnostic) => diagnostic.path).join(',')).toContain('sdq_parent_zh_cn')
    expect(registry.valid).toBe(true)
  })

  it('changing catalog evidence only bumps catalogManifestVersion and never the definition hash', () => {
    const manifestV1 = base()
    const manifestV2 = {
      ...manifestV1,
      catalogManifestVersion: 2,
      evidence: manifestV1.evidence.map((record) => (
        record.evidenceId === 'evidence-internal-consistency-cn-2020'
          ? { ...record, citation: '修订后的示例文献：某中文版内部一致性验证研究, 2021' }
          : record
      )),
    }
    expect(manifestV1.evidence[0].citation).not.toBe(manifestV2.evidence[0].citation)

    const registryV1 = createScaleCatalogRegistry([manifestV1])
    const registryV2 = createScaleCatalogRegistry([manifestV2])
    const entryV1 = registryV1.getEntry('who5', '1.0.0')
    const entryV2 = registryV2.getEntry('who5', '1.0.0')
    expect(entryV1?.bindingStatus).toBe('BOUND')
    expect(entryV2?.bindingStatus).toBe('BOUND')

    // 两次绑定都指向同一个已注册 package（同一对象），definition 未被 catalog 影响
    expect(entryV1?.pkg).toBe(entryV2?.pkg)
    const definitionHash = hashScaleDefinition(entryV1!.pkg!.definition)
    expect(definitionHash).toBe(hashScaleDefinition(entryV2!.pkg!.definition))
    expect(definitionHash).toBe(hashScaleDefinition(getScalePackage('who5', '1.0.0')!.definition))

    // 且与 main 上既有 golden 断言一致：hash 稳定可复算
    expect(definitionHash).toBe(hashScaleDefinition(JSON.parse(JSON.stringify(entryV1!.pkg!.definition))))
  })
})
