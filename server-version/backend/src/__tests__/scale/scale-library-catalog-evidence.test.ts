import { describe, expect, it } from 'vitest'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const base = () => validCatalogManifestBase()

describe('ScaleCatalogManifestV1 scientific evidence matrix (SL1-C4)', () => {
  it('parses valid evidence records with population and locale distinguished', () => {
    const result = parseScaleCatalogManifest(base())
    expect(result.ok).toBe(true)
    if (result.ok) {
      const locales = result.manifest.evidence.map((record) => record.locale)
      expect(locales).toEqual(['zh-CN', 'en'])
      const ratings = new Map(result.manifest.evidence.map((record) => [record.evidenceId, record.rating]))
      expect(ratings.get('evidence-internal-consistency-cn-2020')).toBe('SUFFICIENT')
      expect(ratings.get('evidence-structural-validity-uk-2011')).toBe('MIXED')
    }
  })

  it('supports the same evidence type rated differently across populations', () => {
    const manifest = base()
    manifest.evidence.push({
      ...manifest.evidence[0],
      evidenceId: 'evidence-internal-consistency-hk-2015',
      population: '香港青少年样本',
      locale: 'zh-HK',
      territory: 'HK',
      rating: 'INSUFFICIENT',
      citation: '示例文献：某繁体中文版验证研究, 2015',
    })
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const internalConsistency = result.manifest.evidence.filter((record) => record.evidenceType === 'INTERNAL_CONSISTENCY')
      expect(internalConsistency.map((record) => record.rating)).toEqual(['SUFFICIENT', 'INSUFFICIENT'])
    }
  })

  it('rejects an evidence record without citation', () => {
    const manifest = base()
    delete (manifest.evidence[0] as { citation?: string }).citation
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('evidence 必须提供 citation'))).toBe(true)
  })

  it('rejects duplicate evidenceId', () => {
    const manifest = base()
    manifest.evidence.push({ ...manifest.evidence[0] })
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('evidenceId 不能重复'))).toBe(true)
  })

  it('rejects an invalid locale or territory', () => {
    const manifest = base()
    manifest.evidence[0].locale = 'chinese'
    const badLocale = parseScaleCatalogManifest(manifest)
    expect(badLocale.ok).toBe(false)
    expect(badLocale.issues.some((issue) => issue.path.includes('evidence.0.locale'))).toBe(true)

    const other = base()
    other.evidence[0].territory = 'china'
    const badTerritory = parseScaleCatalogManifest(other)
    expect(badTerritory.ok).toBe(false)
    expect(badTerritory.issues.some((issue) => issue.path.includes('evidence.0.territory'))).toBe(true)
  })

  it('rejects an unknown evidence type or rating', () => {
    const manifest = { ...base(), evidence: [{ ...base().evidence[0], evidenceType: 'MAGIC' }] }
    expect(parseScaleCatalogManifest(manifest).ok).toBe(false)
    const other = { ...base(), evidence: [{ ...base().evidence[0], rating: 'PERFECT' }] }
    expect(parseScaleCatalogManifest(other).ok).toBe(false)
  })

  it('rejects a non-positive or fractional sampleSize', () => {
    for (const sampleSize of [0, -5, 12.5]) {
      const manifest = { ...base(), evidence: [{ ...base().evidence[0], sampleSize }] }
      expect(parseScaleCatalogManifest(manifest).ok).toBe(false)
    }
  })

  it('allows an empty evidence list (CANDIDATE instruments may have none yet)', () => {
    const manifest = { ...base(), evidence: [] }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.evidence).toEqual([])
    }
  })

  it('rejects a global validated=true flag anywhere in the manifest (fail closed)', () => {
    expect(parseScaleCatalogManifest({ ...base(), validated: true }).ok).toBe(false)
    const evidence = { ...base().evidence[0], validated: true }
    expect(parseScaleCatalogManifest({ ...base(), evidence: [evidence] }).ok).toBe(false)
  })

  it('is strict about unknown evidence fields', () => {
    const manifest = { ...base(), evidence: [{ ...base().evidence[0], sourceBlog: 'https://blog.example.com' }] }
    expect(parseScaleCatalogManifest(manifest).ok).toBe(false)
  })
})
