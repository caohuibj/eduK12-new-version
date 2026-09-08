import { describe, expect, it } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { createScaleCatalogRegistry } from '../../modules/scale/library/catalog-registry'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const base = () => validCatalogManifestBase()

describe('Scientific maturity contract (SL2-C2)', () => {
  it('defaults to PILOT for new instruments (§10 default principle)', () => {
    const result = parseScaleCatalogManifest(base())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.scientificMaturity).toBe('PILOT')
    }
  })

  it('accepts an explicit RESEARCH_GRADE declaration', () => {
    const result = parseScaleCatalogManifest({ ...base(), scientificMaturity: 'RESEARCH_GRADE' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.scientificMaturity).toBe('RESEARCH_GRADE')
    }
  })

  it('rejects unknown maturity values (no intermediate state machine)', () => {
    for (const maturity of ['PILOT_1', 'VALIDATING', 'NORMING', 'PRE_RESEARCH_GRADE', 'validated']) {
      const result = parseScaleCatalogManifest({ ...base(), scientificMaturity: maturity })
      expect(result.ok, maturity).toBe(false)
    }
  })

  it('keeps maturity independent from product lifecycle (both axes coexist)', () => {
    const pilot = parseScaleCatalogManifest({ ...base(), scientificMaturity: 'PILOT' })
    const research = parseScaleCatalogManifest({ ...base(), scientificMaturity: 'RESEARCH_GRADE' })
    expect(pilot.ok && research.ok).toBe(true)
    // releaseStatus 属于 package 轴，catalog 只承载 scientific maturity 轴：
    // 两个 manifest 除 maturity 外完全一致，product lifecycle 字段不存在于 catalog。
    if (pilot.ok && research.ok) {
      expect('releaseStatus' in pilot.manifest).toBe(false)
    }
  })

  it('changing scientificMaturity only bumps catalogManifestVersion and never the definition hash', () => {
    const pilotManifest = base()
    const researchManifest = { ...pilotManifest, scientificMaturity: 'RESEARCH_GRADE' as const, catalogManifestVersion: 2 }
    const registryPilot = createScaleCatalogRegistry([pilotManifest])
    const registryResearch = createScaleCatalogRegistry([researchManifest])
    const pilotEntry = registryPilot.getEntry('who5', '1.0.0')
    const researchEntry = registryResearch.getEntry('who5', '1.0.0')
    expect(pilotEntry?.bindingStatus).toBe('BOUND')
    expect(researchEntry?.bindingStatus).toBe('BOUND')
    expect(pilotEntry?.pkg).toBe(researchEntry?.pkg)
    expect(hashScaleDefinition(pilotEntry!.pkg!.definition)).toBe(hashScaleDefinition(researchEntry!.pkg!.definition))
  })

  it('keeps existing SL1 manifests parsing unchanged (backward compatible field)', () => {
    const manifest = base()
    expect('scientificMaturity' in manifest).toBe(false)
    expect(parseScaleCatalogManifest(manifest).ok).toBe(true)
  })
})
