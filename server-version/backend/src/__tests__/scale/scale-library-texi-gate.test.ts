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
    'keeps $instrumentKey pending review visible while enforcing the exact content locale and deployment publication',
    ({ instrumentKey, respondent, scaleId }) => {
      const pkg = getScalePackage(instrumentKey, '1.0.0')!
      expect(pkg.releaseStatus).toBe('PUBLISHED')
      const readEntry = (locale: string, status = 'PUBLISHED') => {
        const model = buildScaleLibraryReadModel({
          locale,
          territory: 'CN',
          respondent,
          viewerRole: 'ADMIN',
          nowIso: NOW,
          authorizations: [approvedAuthorization(instrumentKey, '1.0.0')],
          deployments: [{
            scaleId,
            code: instrumentKey,
            instrumentVersion: '1.0.0',
            status,
          }],
        })
        return model.entries.find((candidate) => candidate.identity.instrumentKey === instrumentKey)!
      }
      const entry = readEntry('en')

      // Manual review remains pending; English content is not a Chinese form.
      expect(entry.localization.reviewStatus).toBe('PENDING')
      expect(entry.localization.targetLocale).toBe('en')
      expect(entry.availability.status).toBe('AVAILABLE')
      expect(entry.availability.launch).toEqual({ scaleId, route: `/student/scales/${scaleId}` })
      expect(entry.governance?.gate.publishable).toBe(true)
      expect(entry.governance?.gate.warnings.some(warning => warning.includes('reviewStatus=PENDING'))).toBe(true)

      const wrongLocale = readEntry('zh-CN')
      expect(wrongLocale.localization.reviewStatus).toBe('PENDING')
      expect(wrongLocale.availability.status).toBe('RESTRICTED')
      expect(wrongLocale.availability.launch).toBeUndefined()
      expect(wrongLocale.availability.reasons).toContain('当前内容语言为 en，不提供 zh-CN 版本。')

      const unpublished = readEntry('en', 'DRAFT')
      expect(unpublished.availability.status).toBe('RESTRICTED')
      expect(unpublished.availability.launch).toBeUndefined()
      expect(unpublished.availability.reasons).toContain('当前量表部署尚未发布。')
      expect(unpublished.governance?.gate.publishable).toBe(false)
    },
  )
})
