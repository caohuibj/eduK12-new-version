import { describe, expect, it } from 'vitest'
import {
  approveInstrumentAuthorization,
  createInstrumentAuthorizationDraft,
} from '../../modules/assessment-authorization'
import { buildScaleLibraryReadModel } from '../../modules/scale/library/scale-library-read-model'
import { getScalePackage } from '../../modules/scale/scale-package.registry'

const NOW = '2026-09-07T00:00:00.000Z'

const approvedAuthorization = (instrumentKey: string, instrumentVersion: string) => {
  const draft = createInstrumentAuthorizationDraft({
    instrumentKey,
    instrumentVersion,
    grantor: 'Wave 0 TEXI gate regression',
    grantee: 'eduK12',
    scope: {
      electronicAdministration: true,
      scoring: true,
      translation: true,
      display: true,
      territories: ['CN'],
      locales: ['en'],
      commercialNature: 'NON_COMMERCIAL',
    },
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    basis: 'Test-only authorization used to prove the Library cannot bypass the authoritative TEXI localization gate.',
    createdByUserId: 'wave0-test-admin',
    now: NOW,
  })
  return approveInstrumentAuthorization({
    record: draft,
    actorUserId: 'wave0-test-approver',
    now: NOW,
  }).record
}

describe('Wave 0 Scale Library TEXI gate parity', () => {
  it.each([
    { instrumentKey: 'texi_parent_zh_cn', respondent: 'PARENT', scaleId: 'scale-texi-parent' },
    { instrumentKey: 'texi_teacher_zh_cn', respondent: 'TEACHER', scaleId: 'scale-texi-teacher' },
  ] as const)(
    'keeps $instrumentKey unavailable while the authoritative TEXI localization manifest is unsigned',
    ({ instrumentKey, respondent, scaleId }) => {
      const pkg = getScalePackage(instrumentKey, '1.0.0')!
      const originalReleaseStatus = pkg.releaseStatus
      pkg.releaseStatus = 'PUBLISHED'
      try {
        const model = buildScaleLibraryReadModel({
          locale: 'en',
          territory: 'CN',
          respondent,
          viewerRole: 'ADMIN',
          nowIso: NOW,
          authorizations: [approvedAuthorization(instrumentKey, '1.0.0')],
          deployments: [{
            scaleId,
            code: instrumentKey,
            instrumentVersion: '1.0.0',
            status: 'PUBLISHED',
          }],
        })
        const entry = model.entries.find((candidate) => candidate.identity.instrumentKey === instrumentKey)!

        // Source-owned localization remains pending and blocks launch independently of product readiness.
        expect(entry.localization.reviewStatus).toBe('PENDING')
        expect(entry.availability.status).toBe('RESTRICTED')
        expect(entry.availability.launch).toBeUndefined()
        expect(entry.availability.reasons.join(' ')).toContain('本地化治理条件尚未满足')
        expect(entry.governance?.gate.publishable).toBe(true)
        expect(entry.governance?.gate.warnings.some((error) => (
          error.includes('reviewStatus=PENDING')
        ))).toBe(true)
      } finally {
        pkg.releaseStatus = originalReleaseStatus
      }
    },
  )
})
