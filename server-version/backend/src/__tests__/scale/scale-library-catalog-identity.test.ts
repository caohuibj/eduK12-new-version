import { describe, expect, it } from 'vitest'
import {
  parseScaleCatalogManifest,
  scaleCatalogManifestV1Schema,
} from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

describe('ScaleCatalogManifestV1 identity + taxonomy (SL1-C1)', () => {
  it('parses a valid minimal manifest', () => {
    const result = parseScaleCatalogManifest(validCatalogManifestBase())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.identity.instrumentKey).toBe('who5')
      expect(result.manifest.catalogStatus).toBe('REVIEWED')
    }
  })

  it('rejects an unknown construct domain', () => {
    const manifest = {
      ...validCatalogManifestBase(),
      construct: {
        ...validCatalogManifestBase().construct,
        primaryDomain: 'CLINICAL_DEPRESSION',
      },
    }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('construct.primaryDomain'))).toBe(true)
  })

  it('rejects duplicate secondary domains', () => {
    const manifest = {
      ...validCatalogManifestBase(),
      construct: {
        ...validCatalogManifestBase().construct,
        secondaryDomains: ['MOTIVATION', 'MOTIVATION'],
      },
    }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('secondaryDomains 不能重复'))).toBe(true)
  })

  it('rejects a secondary domain equal to the primary domain', () => {
    const manifest = {
      ...validCatalogManifestBase(),
      construct: {
        ...validCatalogManifestBase().construct,
        secondaryDomains: ['WELL_BEING'],
      },
    }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('secondaryDomains 不能与 primaryDomain 重复'))).toBe(true)
  })

  it('requires catalogManifestVersion', () => {
    const manifest = validCatalogManifestBase()
    const missing = { ...manifest }
    delete (missing as Partial<typeof manifest>).catalogManifestVersion
    const result = parseScaleCatalogManifest(missing)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('catalogManifestVersion'))).toBe(true)
  })

  it('rejects a non-positive or fractional catalogManifestVersion', () => {
    for (const version of [0, -1, 1.5]) {
      const result = parseScaleCatalogManifest({
        ...validCatalogManifestBase(),
        catalogManifestVersion: version,
      })
      expect(result.ok).toBe(false)
    }
  })

  it('requires a known catalogStatus', () => {
    const result = parseScaleCatalogManifest({
      ...validCatalogManifestBase(),
      catalogStatus: 'PUBLISHED',
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('catalogStatus'))).toBe(true)
  })

  it('rejects instrument keys that do not match the product key style', () => {
    const base = validCatalogManifestBase()
    for (const key of ['WHO5', 'who-5', '', '5who']) {
      const result = parseScaleCatalogManifest({
        ...base,
        identity: { ...base.identity, instrumentKey: key },
      })
      expect(result.ok).toBe(false)
      expect(result.issues.some((issue) => issue.path.includes('identity.instrumentKey'))).toBe(true)
    }
  })

  it('rejects instrument versions that are not x.y.z', () => {
    const base = validCatalogManifestBase()
    for (const version of ['1', 'v1.0.0', '1.0', '1.0.0.0']) {
      const result = parseScaleCatalogManifest({
        ...base,
        identity: { ...base.identity, instrumentVersion: version },
      })
      expect(result.ok).toBe(false)
      expect(result.issues.some((issue) => issue.path.includes('identity.instrumentVersion'))).toBe(true)
    }
  })

  it('rejects an empty canonicalName', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      identity: { ...base.identity, canonicalName: '' },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('identity.canonicalName'))).toBe(true)
  })

  it('is strict about unknown top-level fields (fail closed)', () => {
    const result = parseScaleCatalogManifest({
      ...validCatalogManifestBase(),
      isLicensed: true,
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid constructLevel', () => {
    const manifest = {
      ...validCatalogManifestBase(),
      construct: {
        ...validCatalogManifestBase().construct,
        constructLevel: 'GLOBAL_ONTOLOGY',
      },
    }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('construct.constructLevel'))).toBe(true)
  })

  it('exposes the zod schema for consumers that need issues directly', () => {
    expect(scaleCatalogManifestV1Schema.safeParse(validCatalogManifestBase()).success).toBe(true)
    expect(scaleCatalogManifestV1Schema.safeParse({}).success).toBe(false)
  })
})
