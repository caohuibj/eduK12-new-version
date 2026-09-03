import { describe, expect, it } from 'vitest'
import {
  assertNoPhysicalAuthorizationDelete,
  createInstrumentAuthorizationDraft,
  hashInstrumentAuthorizationRecord,
  mapAuthorizationRowToDomain,
  parseInstrumentAuthorizationRecord,
  PrismaAuthorizationRepository,
} from '../../modules/assessment-authorization'

describe('authorization repository mapping', () => {
  it('maps DB authorizationKey to domain authorizationId and keeps version-row id separate', () => {
    const draft = createInstrumentAuthorizationDraft({
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      grantor: 'G',
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
      validTo: '2027-01-01T00:00:00.000Z',
      basis: 'basis',
      createdByUserId: 'admin-1',
      now: '2026-09-03T04:00:00.000Z',
    })
    const versionRowId = '11111111-1111-4111-8111-111111111111'
    const mapped = mapAuthorizationRowToDomain({
      id: versionRowId,
      authorizationKey: draft.authorizationId,
      version: draft.version,
      instrumentKey: draft.instrumentKey,
      instrumentVersion: draft.instrumentVersion,
      grantor: draft.grantor,
      grantee: draft.grantee,
      electronicAdministration: draft.scope.electronicAdministration,
      scoring: draft.scope.scoring,
      translation: draft.scope.translation,
      display: draft.scope.display,
      territories: draft.scope.territories,
      locales: draft.scope.locales,
      commercialNature: draft.scope.commercialNature,
      validFrom: new Date(draft.validFrom),
      validTo: new Date(draft.validTo),
      basis: draft.basis,
      status: draft.status,
      evidenceAssetId: null,
      evidenceSha256: null,
      selfApprovalDeclaration: null,
      approvedByUserId: null,
      approvedAt: null,
      createdByUserId: draft.createdByUserId,
      createdAt: new Date(draft.createdAt),
      updatedAt: new Date(draft.updatedAt),
    })
    expect(mapped.authorizationId).toBe(draft.authorizationId)
    expect(mapped.authorizationId).not.toBe(versionRowId)
    expect(parseInstrumentAuthorizationRecord(mapped).instrumentKey).toBe('who5')
    expect(hashInstrumentAuthorizationRecord(mapped)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('exposes no physical delete API on the repository surface', () => {
    expect(() => assertNoPhysicalAuthorizationDelete()).not.toThrow()
    const proto = Object.getOwnPropertyNames(PrismaAuthorizationRepository.prototype)
    expect(proto.some((name) => /delete|destroy|remove/i.test(name))).toBe(false)
  })
})
