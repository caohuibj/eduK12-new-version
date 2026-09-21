import { describe, expect, it } from 'vitest'
import { parseScaleCatalogManifest } from '../../modules/scale/library/catalog-manifest'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

describe('ScaleCatalogManifestV1 population + respondent (SL1-C2)', () => {
  it('parses a valid population section', () => {
    const result = parseScaleCatalogManifest(validCatalogManifestBase())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.population.respondentTypes).toEqual(['SELF'])
      expect(result.manifest.population.developmentalEvidence).toBe('PARTIAL')
    }
  })

  it('rejects minAge greater than maxAge', () => {
    const manifest = {
      ...validCatalogManifestBase(),
      population: {
        ...validCatalogManifestBase().population,
        minAge: 19,
        maxAge: 12,
      },
    }
    const result = parseScaleCatalogManifest(manifest)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('minAge 不能大于 maxAge'))).toBe(true)
  })

  it('allows a lower age bound without fabricating an upper bound', () => {
    const base = validCatalogManifestBase()
    const { maxAge: _maxAge, ...population } = base.population
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...population, minAge: 14 },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.population.minAge).toBe(14)
      expect(result.manifest.population.maxAge).toBeUndefined()
    }
  })

  it('allows an upper age bound without fabricating a lower bound', () => {
    const base = validCatalogManifestBase()
    const { minAge: _minAge, ...population } = base.population
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...population, maxAge: 12 },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.population.minAge).toBeUndefined()
      expect(result.manifest.population.maxAge).toBe(12)
    }
  })

  it('rejects invalid grades (out of range or fractional)', () => {
    const base = validCatalogManifestBase()
    for (const gradeRange of [{ minGrade: 0, maxGrade: 12 }, { minGrade: 3, maxGrade: 13 }, { minGrade: 3.5, maxGrade: 12 }]) {
      const result = parseScaleCatalogManifest({
        ...base,
        population: { ...base.population, gradeRange },
      })
      expect(result.ok).toBe(false)
      expect(result.issues.some((issue) => issue.path.startsWith('population.gradeRange'))).toBe(true)
    }
  })

  it('rejects minGrade greater than maxGrade', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...base.population, gradeRange: { minGrade: 9, maxGrade: 4 } },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('minGrade 不能大于 maxGrade'))).toBe(true)
  })

  it('rejects an empty respondent list', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...base.population, respondentTypes: [] },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('population.respondentTypes'))).toBe(true)
  })

  it('rejects duplicate respondent types', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...base.population, respondentTypes: ['PARENT', 'PARENT'] },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.message.includes('respondentTypes 不能重复'))).toBe(true)
  })

  it('rejects an unknown respondent type', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...base.population, respondentTypes: ['AI_TUTOR'] },
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown developmentalEvidence value', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...base.population, developmentalEvidence: 'VALIDATED' },
    })
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path.includes('population.developmentalEvidence'))).toBe(true)
  })

  it('expresses self-only, parent-only, teacher-only and multi-informant manifests', () => {
    const base = validCatalogManifestBase()
    const expectations: Array<[string[], string]> = [
      [['SELF'], 'self only'],
      [['PARENT'], 'parent only'],
      [['TEACHER'], 'teacher only'],
      [['SELF', 'PARENT', 'TEACHER'], 'multi-informant'],
    ]
    for (const [respondentTypes, label] of expectations) {
      const result = parseScaleCatalogManifest({
        ...base,
        population: { ...base.population, respondentTypes },
      })
      expect(result.ok, label).toBe(true)
      if (result.ok) {
        expect(result.manifest.population.respondentTypes, label).toEqual(respondentTypes)
      }
    }
  })

  it('allows population applicability to be expressed via populationNotes', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      population: {
        ...base.population,
        populationNotes: '仅适用于普通学校人群；不适用于已确诊发展障碍人群的个体化评估。',
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.population.populationNotes).toContain('不适用')
    }
  })

  it('is strict about unknown population fields', () => {
    const base = validCatalogManifestBase()
    const result = parseScaleCatalogManifest({
      ...base,
      population: { ...base.population, validatedForChildren: true },
    })
    expect(result.ok).toBe(false)
  })
})
