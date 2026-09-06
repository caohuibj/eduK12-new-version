import { describe, expect, it } from 'vitest'
import {
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
} from '../../modules/assessment-authorization'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../modules/scale/scale-package.registry'
import { evaluatePilotFirstPublicationGate } from '../../modules/scale/library/pilot-publication-gate'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const NOW = '2026-09-07T00:00:00.000Z'

const who5Authorization = (overrides?: { validTo?: string }) => {
  const draft = createInstrumentAuthorizationDraft({
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    grantor: 'World Health Organization',
    grantee: 'eduK12',
    scope: {
      electronicAdministration: true,
      scoring: true,
      translation: false,
      display: true,
      territories: ['CN'],
      locales: ['zh-CN'],
      commercialNature: 'NON_COMMERCIAL',
    },
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: overrides?.validTo ?? '2027-01-01T00:00:00.000Z',
    basis: 'WHO-5 CC BY-NC-SA 3.0 IGO non-commercial electronic use',
    createdByUserId: 'admin-1',
    now: NOW,
  })
  return approveInstrumentAuthorization({ record: draft, actorUserId: 'admin-2', now: NOW }).record
}

const who5LocalizationManifest = (overrides?: Record<string, unknown>) => ({
  schemaVersion: 1 as const,
  instrumentKey: 'who5',
  instrumentVersion: '1.0.0',
  sourceLocale: 'zh-CN',
  targetLocale: 'zh-CN',
  localizationVersion: '1.0.0',
  translationSource: 'WHO 官方 Chinese PR PDF（原文部署）',
  translationRightsStatus: 'COVERED_BY_INSTRUMENT_AUTHORIZATION' as const,
  adaptationMethod: 'ORIGINAL_SOURCE' as const,
  expertReviewStatus: 'COMPLETED' as const,
  cognitiveDebriefStatus: 'NOT_ESTABLISHED' as const,
  localEvidenceRefs: [],
  reviewStatus: 'APPROVED' as const,
  reviewedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

const runGate = (overrides?: Partial<Parameters<typeof evaluatePilotFirstPublicationGate>[0]>) => evaluatePilotFirstPublicationGate({
  pkg: WHO5_ZH_CN_V1_PACKAGE,
  manifest: validCatalogManifestBase(),
  localizationManifest: who5LocalizationManifest(),
  authorizations: [who5Authorization()],
  locale: 'zh-CN',
  territory: 'CN',
  requestedRespondent: 'SELF',
  nowIso: NOW,
  ...overrides,
})

describe('Pilot-first publication gate composition (SL2-C6)', () => {
  it('publishes PUBLISHED + PILOT with full hard layers green and soft science layer as gaps only', () => {
    const result = runGate()
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.errors).toHaveLength(0)
    expect(result.localizationUsable).toBe(true)
    // Q1：PILOT 是完整产品——报告能力不被 maturity 降级
    expect(result.reportEligibility.maxEligibleLevel).toBe('L2_DESCRIPTIVE')
    // Q3：科学不完整只出现在软层
    expect(result.decision.researchGaps.length).toBeGreaterThan(0)
    expect(result.decision.limitations.some((line) => line.includes('PILOT'))).toBe(true)
  })

  it('blocks when localization provenance is missing entirely (§12.C)', () => {
    const result = runGate({ localizationManifest: undefined })
    expect(result.decision.publishable).toBe(false)
    expect(result.decision.errors.some((error) => error.includes('localization provenance missing'))).toBe(true)
    expect(result.localizationUsable).toBe(false)
  })

  it('blocks on DENIED translation rights in the localization manifest', () => {
    const result = runGate({ localizationManifest: who5LocalizationManifest({ translationRightsStatus: 'DENIED' }) })
    expect(result.decision.publishable).toBe(false)
    expect(result.decision.errors.some((error) => error.includes('DENIED'))).toBe(true)
  })

  it('blocks when the localization manifest has not passed governance review', () => {
    const result = runGate({
      localizationManifest: who5LocalizationManifest({ reviewStatus: 'PENDING', reviewedAt: undefined }),
    })
    expect(result.decision.publishable).toBe(false)
    expect(result.decision.errors.some((error) => error.includes('reviewStatus=PENDING'))).toBe(true)
  })

  it('warns (not blocks) on PILOT-level incomplete localization research items (§8)', () => {
    const result = runGate({
      localizationManifest: who5LocalizationManifest({ cognitiveDebriefStatus: 'PENDING' }),
    })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.warnings.some((warning) => warning.includes('cognitiveDebriefStatus=PENDING'))).toBe(true)
  })

  it('blocks on missing, expired or wrong-locale authorization (§14 rights fail-closed)', () => {
    const noAuth = runGate({ authorizations: [] })
    expect(noAuth.decision.publishable).toBe(false)
    expect(noAuth.decision.errors.some((error) => /authorization/i.test(error))).toBe(true)

    const expired = runGate({ authorizations: [who5Authorization({ validTo: '2026-06-01T00:00:00.000Z' })] })
    expect(expired.decision.publishable).toBe(false)
    expect(expired.decision.errors.some((error) => /EXPIRED|validFrom\/validTo/.test(error))).toBe(true)

    const wrongLocale = runGate({ locale: 'en' })
    expect(wrongLocale.decision.publishable).toBe(false)
  })

  it('blocks a requested respondent outside the catalog declaration (§29)', () => {
    const result = runGate({ requestedRespondent: 'TEACHER' })
    expect(result.decision.publishable).toBe(false)
    expect(result.decision.errors.some((error) => error.includes('respondent'))).toBe(true)
  })

  it('blocks an invalid catalog manifest instead of throwing', () => {
    const result = runGate({ manifest: { identity: 'broken' } })
    expect(result.decision.publishable).toBe(false)
    expect(result.decision.errors.some((error) => error.includes('[catalogManifest]'))).toBe(true)
    expect(result.reportEligibility.maxEligibleLevel).toBeNull()
  })

  it('keeps scientific completeness driven by territory: CN applicability removes the local-norm gap', () => {
    const manifest = validCatalogManifestBase()
    manifest.referenceApplicability.push({
      applicabilityId: 'ref-applicability-cn-norm-2026',
      referenceVersion: 'who5-pilot-cn-v1',
      referenceKind: 'normative_distribution',
      respondent: 'SELF',
      locale: 'zh-CN',
      territory: 'CN',
      sampleN: 500,
      samplingMethod: 'PROBABILITY',
    })
    const result = runGate({ manifest })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.researchGaps.some((gap) => gap.code === 'NO_LOCAL_NORM')).toBe(false)
  })
})
