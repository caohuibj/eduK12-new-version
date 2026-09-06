import { describe, expect, it } from 'vitest'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

describe('ScaleCatalogManifestV1 administration + intended use (SL1-C3)', () => {
  it('parses a valid administration and intendedUse section', () => {
    const result = parseScaleCatalogManifest(validCatalogManifestBase())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.administration.itemCount).toBe(5)
      expect(result.manifest.intendedUse.intendedUses).toHaveLength(3)
    }
  })

  it('expresses research allowed, diagnosis forbidden and progress-monitoring evidence unknown together', () => {
    const result = parseScaleCatalogManifest(validCatalogManifestBase())
    expect(result.ok).toBe(true)
    if (result.ok) {
      const byUse = new Map(result.manifest.intendedUse.intendedUses.map((entry) => [entry.use, entry]))
      expect(byUse.get('RESEARCH')?.evidenceStatus).toBe('SUPPORTED')
      expect(byUse.get('PROGRESS_MONITORING')?.evidenceStatus).toBe('EVIDENCE_UNKNOWN')
      expect(result.manifest.intendedUse.forbiddenUses).toContain('DIAGNOSIS')
    }
  })

  it('can mark a use NOT_SUPPORTED instead of silently dropping it', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      intendedUse: {
        intendedUses: [
          { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
          { use: 'SCREENING', evidenceStatus: 'NOT_SUPPORTED', notes: '缺少 cutoff 效度证据' },
        ],
        forbiddenUses: ['DIAGNOSIS', 'SCHOOL_RANKING'],
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const screening = result.manifest.intendedUse.intendedUses.find((entry) => entry.use === 'SCREENING')
      expect(screening?.evidenceStatus).toBe('NOT_SUPPORTED')
    }
  })

  it('rejects duplicate intended use declarations', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      intendedUse: {
        intendedUses: [
          { use: 'RESEARCH', evidenceStatus: 'SUPPORTED' },
          { use: 'RESEARCH', evidenceStatus: 'EVIDENCE_UNKNOWN' },
        ],
        forbiddenUses: ['DIAGNOSIS'],
      },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('同一用途只能声明一条 evidenceStatus'))).toBe(true)
  })

  it('rejects duplicate forbidden uses', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      intendedUse: {
        ...base.intendedUse,
        forbiddenUses: ['DIAGNOSIS', 'DIAGNOSIS'],
      },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('forbiddenUses 不能重复'))).toBe(true)
  })

  it('requires at least one intended use', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      intendedUse: { intendedUses: [], forbiddenUses: ['DIAGNOSIS'] },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('intendedUse.intendedUses'))).toBe(true)
  })

  it('rejects an unknown administration mode', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      administration: { ...base.administration, administrationModes: ['TELEPATHY'] },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('administration.administrationModes'))).toBe(true)
  })

  it('rejects duplicate administration modes', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      administration: { ...base.administration, administrationModes: ['PAPER', 'PAPER'] },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('administrationModes 不能重复'))).toBe(true)
  })

  it('rejects zero item count or estimated minutes', () => {
    const base = validCatalogManifestBase()
    for (const patch of [{ itemCount: 0 }, { estimatedMinutes: 0 }]) {
      const result = parseScaleCatalogManifest({
        ...base,
        administration: { ...base.administration, ...patch },
      })
      expect(result.ok).toBe(false)
    }
  })

  it('rejects an empty timeFrame', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      administration: { ...base.administration, timeFrame: '' },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('administration.timeFrame'))).toBe(true)
  })

  it('rejects an unknown intended or forbidden use', () => {
    const base = validCatalogManifestBase()
    const unknownIntended = parseScaleCatalogManifest({
      ...base,
      intendedUse: {
        intendedUses: [{ use: 'RANK_TEACHERS', evidenceStatus: 'SUPPORTED' }],
        forbiddenUses: ['DIAGNOSIS'],
      },
    })
    expect(unknownIntended.ok).toBe(false)
    const unknownForbidden = parseScaleCatalogManifest({
      ...base,
      intendedUse: {
        ...base.intendedUse,
        forbiddenUses: ['WEAPON_TESTING'],
      },
    })
    expect(unknownForbidden.ok).toBe(false)
  })

  it('is strict about unknown administration or intendedUse fields', () => {
    const base = validCatalogManifestBase()
    const unknownAdministration = parseScaleCatalogManifest({
      ...base,
      administration: { ...base.administration, certifiedByVendor: true },
    })
    expect(unknownAdministration.ok).toBe(false)
    const unknownIntendedUse = parseScaleCatalogManifest({
      ...base,
      intendedUse: { ...base.intendedUse, allowed: true },
    })
    expect(unknownIntendedUse.ok).toBe(false)
  })
})
