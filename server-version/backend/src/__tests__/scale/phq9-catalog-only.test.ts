import { describe, expect, it } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../modules/scale/instruments/phq9_zh_cn_research/1.0.0/instrument'
import { parseScaleInstrumentSourceSchema } from '../../modules/scale/onboarding/schema'
import { validateScaleInstrumentSource } from '../../modules/scale/onboarding/validate-instrument'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { getExecutableScalePackage } from '../../modules/scale/onboarding/executable-registry'
import { buildUnifiedScaleLibraryReadModel, filterUnifiedScaleLibraryEntries } from '../../modules/scale/library/catalog-only-read-model'
import { isScaleLibraryPublicPayloadSafe, type ScaleLibraryEntry } from '../../modules/scale/library/scale-library-read-model'

const key = 'phq9_zh_cn_research'
const context = { locale: 'zh-CN', territory: 'CN', nowIso: '2026-10-21T00:00:00.000Z' }

describe('PHQ-9 catalog-only research candidate', () => {
  it('passes existing schema without claiming executable, authorization or scientific review', () => {
    expect(parseScaleInstrumentSourceSchema(source)).toEqual(source)
    expect(validateScaleInstrumentSource(source)).toEqual({ valid: true, issues: [] })
    expect(source.executable).toBeUndefined()
    expect(source.scientificReview).toBeUndefined()
    expect(source.catalog.catalogStatus).toBe('CANDIDATE')
    expect(source.catalog.scientificMaturity).toBe('PILOT')
    expect(source.catalog.population.minAge).toBe(18)
    expect(source.catalog.intendedUse.forbiddenUses).toContain('DIAGNOSIS')
    expect(source.localization?.reviewStatus).toBe('PENDING')
    expect(source.localization?.expertReviewStatus).toBe('PENDING')
    expect(source.localization?.localEvidenceRefs).toEqual([])
    expect(source.catalog.construct.constructOverlapTags).toEqual(['mental_health', 'depression'])
  })

  it('is registered for discovery only, never as an executable package', () => {
    expect(getScaleInstrumentSource(key, '1.0.0')?.candidatePreview?.status).toBe('CATALOG_ONLY')
    expect(getExecutableScalePackage(key, '1.0.0')).toBeUndefined()
  })

  it('appears through the existing unified public projection with no launch or runtime item data', () => {
    const entry = buildUnifiedScaleLibraryReadModel({ ...context, viewerRole: 'TEACHER' }).entries.find(row => row.identity.instrumentKey === key)!
    expect(entry).toBeDefined()
    expect(entry.availability.status).toBe('NOT_AVAILABLE')
    expect(entry.availability).not.toHaveProperty('launch')
    expect(entry.availability.reasons).toContain('EXECUTABLE_NOT_REGISTERED')
    expect(entry.governance).toBeUndefined()
    expect(entry.report.maxEligibleLevel).toBeNull()
    expect(entry.report.levels.L1_SCORE_ONLY.eligible).toBe(false)
    expect(isScaleLibraryPublicPayloadSafe(entry as unknown as ScaleLibraryEntry)).toBe(true)
    expect(JSON.stringify(entry)).not.toContain('responseSets')
    expect(JSON.stringify(entry)).not.toContain('itemRules')
  })

  it('remains not publishable for administrators, without an invented grant', () => {
    const entry = buildUnifiedScaleLibraryReadModel({ ...context, viewerRole: 'ADMIN' }).entries.find(row => row.identity.instrumentKey === key)!
    expect(entry.governance?.gate.publishable).toBe(false)
    expect(entry.governance?.packageReleaseStatus).toBe('NOT_BUILT')
    expect(entry.governance).not.toHaveProperty('authorization')
    expect(entry.availability).not.toHaveProperty('launch')
  })

  it('uses the existing domain/tag/availability filters without mixing population into construct tags', () => {
    const entries = buildUnifiedScaleLibraryReadModel(context).entries
    const match = (filters: Parameters<typeof filterUnifiedScaleLibraryEntries>[1]) => filterUnifiedScaleLibraryEntries(entries, filters).some(row => row.identity.instrumentKey === key)
    expect(match({ constructDomain: 'WELL_BEING', overlapTag: 'depression', locale: 'zh-CN', availability: 'NOT_AVAILABLE' })).toBe(true)
    expect(match({ overlapTag: 'mental_health', minAge: 18 })).toBe(true)
    expect(match({ overlapTag: 'anxiety' })).toBe(false)
    expect(match({ constructDomain: 'EXECUTIVE_FUNCTION' })).toBe(false)
    expect(match({ availability: 'AVAILABLE' })).toBe(false)
    expect(match({ maxAge: 17 })).toBe(false)
  })
})
