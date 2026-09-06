import { describe, expect, it } from 'vitest'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const base = () => validCatalogManifestBase()

describe('ScaleCatalogManifestV1 reference applicability metadata (SL1-C5)', () => {
  it('parses a valid referenceApplicability record', () => {
    const result = parseScaleCatalogManifest(base())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.referenceApplicability).toHaveLength(1)
      expect(result.manifest.referenceApplicability[0].referenceKind).toBe('descriptive_sample')
      expect(result.manifest.referenceApplicability[0].samplingMethod).toBe('STRATIFIED')
    }
  })

  it('expresses a UK teacher-report descriptive reference as distinct from a Mainland China norm', () => {
    const manifest = base()
    manifest.referenceApplicability.push({
      applicabilityId: 'ref-applicability-uk-teacher-2011',
      referenceVersion: 'who5-uk-2011-v1',
      referenceKind: 'normative_distribution',
      respondent: 'TEACHER',
      locale: 'en',
      territory: 'UK',
      minAgeMonthsInclusive: 96,
      maxAgeMonthsExclusive: 180,
      sampleN: 900,
      samplingMethod: 'PROBABILITY',
      collectionYears: '2010-2011',
    })
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const [cn, uk] = result.manifest.referenceApplicability
      expect(cn.territory).toBe('CN')
      expect(uk.territory).toBe('UK')
      expect(cn.respondent).not.toBe(uk.respondent)
      expect(cn.referenceKind).not.toBe(uk.referenceKind)
    }
  })

  it('requires samplingMethod so a convenience sample cannot silently pass as a norm', () => {
    const manifest = base()
    delete (manifest.referenceApplicability[0] as { samplingMethod?: string }).samplingMethod
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('referenceApplicability.0.samplingMethod'))).toBe(true)
  })

  it('rejects duplicate applicabilityId', () => {
    const manifest = base()
    manifest.referenceApplicability.push({ ...manifest.referenceApplicability[0] })
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('applicabilityId 不能重复'))).toBe(true)
  })

  it('rejects an unknown referenceKind', () => {
    const manifest = { ...base(), referenceApplicability: [{ ...base().referenceApplicability[0], referenceKind: 'national_norm' }] }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
  })

  it('rejects an invalid locale, territory or respondent', () => {
    const first = base()
    first.referenceApplicability[0].locale = 'zh_CN_bad'
    expect(parseScaleCatalogManifest(first).ok).toBe(false)
    const second = base()
    second.referenceApplicability[0].territory = 'cn'
    expect(parseScaleCatalogManifest(second).ok).toBe(false)
    const third = { ...base(), referenceApplicability: [{ ...base().referenceApplicability[0], respondent: 'AI_TUTOR' }] }
    expect(parseScaleCatalogManifest(third).ok).toBe(false)
  })

  it('rejects an inverted month age range', () => {
    const manifest = base()
    manifest.referenceApplicability[0] = {
      ...manifest.referenceApplicability[0],
      minAgeMonthsInclusive: 216,
      maxAgeMonthsExclusive: 108,
    }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('月龄下界必须小于不含上界'))).toBe(true)
  })

  it('rejects a non-positive sampleN', () => {
    const manifest = base()
    manifest.referenceApplicability[0] = { ...manifest.referenceApplicability[0], sampleN: 0 }
    expect(parseScaleCatalogManifest(manifest).ok).toBe(false)
  })

  it('allows an empty referenceApplicability list', () => {
    const manifest = { ...base(), referenceApplicability: [] }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.referenceApplicability).toEqual([])
    }
  })

  it('is strict about unknown applicability fields', () => {
    const manifest = {
      ...base(),
      referenceApplicability: [{ ...base().referenceApplicability[0], isMainlandNorm: true }],
    }
    expect(parseScaleCatalogManifest(manifest).ok).toBe(false)
  })
})
