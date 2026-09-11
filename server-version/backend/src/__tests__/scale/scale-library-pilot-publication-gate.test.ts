import { describe, expect, it } from 'vitest'
import {
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
} from '../../modules/assessment-authorization'
import { WHO5_ZH_CN_V1_PACKAGE } from '../../modules/scale/scale-package.registry'
import { evaluatePilotFirstPublicationGate } from '../../modules/scale/library/pilot-publication-gate'
import { validCatalogManifestBase } from './scale-library-catalog-fixtures'

const NOW = '2026-09-07T00:00:00.000Z'

const who5Authorization = (overrides?: { validTo?: string; locales?: string[]; scoring?: boolean; display?: boolean }) => {
  const draft = createInstrumentAuthorizationDraft({
    instrumentKey: 'who5',
    instrumentVersion: '1.0.0',
    grantor: 'World Health Organization',
    grantee: 'eduK12',
    scope: {
      electronicAdministration: true,
      scoring: overrides?.scoring ?? true,
      translation: false,
      display: overrides?.display ?? true,
      territories: ['CN'],
      locales: overrides?.locales ?? ['zh-CN'],
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
  it('publishes PUBLISHED + PILOT when executable correctness is green', () => {
    const result = runGate()
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.errors).toHaveLength(0)
    expect(result.localizationUsable).toBe(true)
    expect(result.reportEligibility.maxEligibleLevel).toBe('L2_DESCRIPTIVE')
    expect(result.decision.researchGaps.length).toBeGreaterThan(0)
    expect(result.decision.limitations.some((line) => line.includes('PILOT'))).toBe(true)
  })

  it('keeps missing localization provenance as a deployment warning, not a Product Release blocker', () => {
    const result = runGate({ localizationManifest: undefined })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.errors).toHaveLength(0)
    expect(result.decision.warnings.some((warning) => warning.includes('localization provenance missing'))).toBe(true)
    expect(result.localizationUsable).toBe(false)
  })

  it('keeps invalid localization governance metadata visible without changing Product Release', () => {
    const result = runGate({ localizationManifest: who5LocalizationManifest({ translationRightsStatus: 'DENIED' }) })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.warnings.some((warning) => warning.includes('translationRightsStatus'))).toBe(true)
    expect(result.localizationUsable).toBe(false)
  })

  it('keeps localization identity and deployed-locale mismatches as deployment diagnostics', () => {
    const wrongIdentity = runGate({
      localizationManifest: who5LocalizationManifest({ instrumentKey: 'other_scale' }),
    })
    expect(wrongIdentity.decision.publishable).toBe(true)
    expect(wrongIdentity.decision.warnings.some((warning) => warning.includes('instrumentKey'))).toBe(true)
    expect(wrongIdentity.localizationUsable).toBe(false)

    const wrongVersion = runGate({
      localizationManifest: who5LocalizationManifest({ instrumentVersion: '2.0.0' }),
    })
    expect(wrongVersion.decision.publishable).toBe(true)
    expect(wrongVersion.decision.warnings.some((warning) => warning.includes('instrumentVersion'))).toBe(true)
    expect(wrongVersion.localizationUsable).toBe(false)

    const wrongLocale = runGate({
      localizationManifest: who5LocalizationManifest({ targetLocale: 'en', sourceLocale: 'en', adaptationMethod: 'ORIGINAL_SOURCE' }),
    })
    expect(wrongLocale.decision.publishable).toBe(true)
    expect(wrongLocale.decision.warnings.some((warning) => warning.includes('targetLocale'))).toBe(true)
    expect(wrongLocale.localizationUsable).toBe(false)

    const wrongPackageContentLocale = runGate({
      locale: 'en',
      authorizations: [who5Authorization({ locales: ['en'] })],
      localizationManifest: who5LocalizationManifest({
        sourceLocale: 'en',
        targetLocale: 'en',
        adaptationMethod: 'ORIGINAL_SOURCE',
      }),
    })
    expect(wrongPackageContentLocale.decision.publishable).toBe(true)
    expect(wrongPackageContentLocale.decision.warnings.some((warning) => warning.includes('contentLocale'))).toBe(true)
    expect(wrongPackageContentLocale.localizationUsable).toBe(false)
  })

  it('keeps scoring/display authorization failures as governance warnings, not release blockers', () => {
    const noScoring = runGate({ authorizations: [who5Authorization({ scoring: false })] })
    expect(noScoring.decision.publishable).toBe(true)
    expect(noScoring.decision.warnings.some((warning) => warning.includes('scoring required'))).toBe(true)

    const noDisplay = runGate({ authorizations: [who5Authorization({ display: false })] })
    expect(noDisplay.decision.publishable).toBe(true)
    expect(noDisplay.decision.warnings.some((warning) => warning.includes('display required'))).toBe(true)
  })

  it('keeps localization review state separate from Product Release', () => {
    const result = runGate({
      localizationManifest: who5LocalizationManifest({ reviewStatus: 'PENDING', reviewedAt: undefined }),
    })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.warnings.some((warning) => warning.includes('reviewStatus=PENDING'))).toBe(true)
    expect(result.localizationUsable).toBe(false)
  })

  it('warns on PILOT-level incomplete localization research items', () => {
    const result = runGate({
      localizationManifest: who5LocalizationManifest({ cognitiveDebriefStatus: 'PENDING' }),
    })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.warnings.some((warning) => warning.includes('cognitiveDebriefStatus=PENDING'))).toBe(true)
  })

  it('keeps missing, expired or wrong-locale authorization outside Product Release', () => {
    const noAuth = runGate({ authorizations: [] })
    expect(noAuth.decision.publishable).toBe(true)
    expect(noAuth.decision.warnings.some((warning) => /authorization/i.test(warning))).toBe(true)

    const expired = runGate({ authorizations: [who5Authorization({ validTo: '2026-06-01T00:00:00.000Z' })] })
    expect(expired.decision.publishable).toBe(true)
    expect(expired.decision.warnings.some((warning) => /EXPIRED|validFrom\/validTo/.test(warning))).toBe(true)

    const wrongLocale = runGate({ locale: 'en' })
    expect(wrongLocale.decision.publishable).toBe(true)
    expect(wrongLocale.decision.warnings.length).toBeGreaterThan(0)
  })

  it('keeps respondent applicability as deployment governance, not lifecycle state', () => {
    const result = runGate({ requestedRespondent: 'TEACHER' })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.warnings.some((warning) => warning.includes('respondent'))).toBe(true)
  })

  it('keeps an invalid catalog manifest outside Product Release while disabling scientific/report eligibility', () => {
    const result = runGate({ manifest: { identity: 'broken' } })
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.errors).toHaveLength(0)
    expect(result.decision.warnings.some((warning) => warning.includes('[catalog/governance]'))).toBe(true)
    expect(result.reportEligibility.maxEligibleLevel).toBeNull()
  })

  it('keeps EVIDENCE_PENDING rights warn-only and surfaces the warning', () => {
    const result = runGate()
    expect(result.decision.publishable).toBe(true)
    expect(result.decision.warnings.some((warning) => warning.includes('EVIDENCE_PENDING'))).toBe(true)
    expect(result.decision.errors).toHaveLength(0)
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
