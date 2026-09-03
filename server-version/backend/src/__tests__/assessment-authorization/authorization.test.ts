import { describe, expect, it } from 'vitest'
import { WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1 } from '../../modules/assessment-bundle'
import {
  AuthorizationContractError,
  amendApprovedInstrumentAuthorization,
  approveInstrumentAuthorization,
  assertCanReadAuthorizationEvidenceAsAdmin,
  attachAuthorizationEvidence,
  canFinishInFlightAttempt,
  canStartNewAttempt,
  createInstrumentAuthorizationDraft,
  evaluateBundlePublication,
  resolveAttemptDeadline,
  revokeInstrumentAuthorization,
} from '../../modules/assessment-authorization'

const failCode = (run: () => unknown): string => {
  try {
    run()
    throw new Error('expected AuthorizationContractError')
  } catch (error) {
    if (error instanceof AuthorizationContractError) return error.code
    throw error
  }
}

const draft = (actor = 'admin-1') => createInstrumentAuthorizationDraft({
  instrumentKey: 'who5',
  instrumentVersion: '1.0.0',
  grantor: 'WHO',
  grantee: 'eduK12',
  scope: {
    electronicAdministration: true,
    scoring: true,
    translation: true,
    display: true,
    territories: ['CN'],
    locales: ['zh-CN'],
    commercialNature: 'NON_COMMERCIAL',
  },
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: '2027-01-01T00:00:00.000Z',
  basis: 'WHO-5 non-commercial research use',
  createdByUserId: actor,
  now: '2026-09-03T04:00:00.000Z',
})

describe('instrument authorization overlay', () => {
  it('allows self-approve only with confirmation declaration and appends audit', () => {
    const created = draft()
    expect(failCode(() => approveInstrumentAuthorization({
      record: created,
      actorUserId: 'admin-1',
      selfApprovalDeclaration: 'short',
    }))).toBe('AUTH_SELF_APPROVAL')

    const approved = approveInstrumentAuthorization({
      record: created,
      actorUserId: 'admin-1',
      selfApprovalDeclaration: 'I confirm self-approval of this authorization scope.',
      now: '2026-09-03T04:05:00.000Z',
    })
    expect(approved.record.status).toBe('EVIDENCE_PENDING')
    expect(approved.audit.action).toBe('APPROVE')
    expect(approved.audit.authorizationVersion).toBe(1)
  })

  it('mints a new version after approval changes and keeps audit append-only semantics', () => {
    const approved = approveInstrumentAuthorization({
      record: draft(),
      actorUserId: 'admin-2',
      now: '2026-09-03T04:05:00.000Z',
    })
    const amended = amendApprovedInstrumentAuthorization({
      previous: approved.record,
      patch: { basis: 'updated basis text' },
      actorUserId: 'admin-2',
      now: '2026-09-03T04:10:00.000Z',
    })
    expect(amended.record.version).toBe(2)
    expect(amended.record.status).toBe('DRAFT')
    expect(amended.audit.action).toBe('UPDATE')
  })

  it('publishes WHO-5 only for NON_COMMERCIAL and holds on EXPIRED/REVOKED/SCOPE_MISMATCH', () => {
    const base = approveInstrumentAuthorization({
      record: draft(),
      actorUserId: 'admin-2',
    }).record
    const withEvidence = attachAuthorizationEvidence({
      record: base,
      evidenceAssetId: 'asset-1',
      evidenceSha256: 'a'.repeat(64),
      actorUserId: 'admin-2',
    }).record

    const ok = evaluateBundlePublication({
      definition: WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
      authorizations: [withEvidence],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
    })
    expect(ok.publishable).toBe(true)
    expect(ok.catalogStatus).toBe('PUBLISHED')
    expect(canStartNewAttempt({ decision: ok })).toBe(true)

    const commercialBlocked = evaluateBundlePublication({
      definition: WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
      authorizations: [withEvidence],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'COMMERCIAL',
    })
    expect(commercialBlocked.publishable).toBe(false)
    expect(commercialBlocked.errors.some((row) => /NON_COMMERCIAL/.test(row))).toBe(true)

    const revoked = revokeInstrumentAuthorization({
      record: withEvidence,
      actorUserId: 'admin-2',
      note: 'revoked',
    }).record
    const revokedDecision = evaluateBundlePublication({
      definition: WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
      authorizations: [revoked],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
    })
    expect(revokedDecision.publishable).toBe(false)
    expect(revokedDecision.catalogStatus).toBe('HOLD')
    expect(canStartNewAttempt({ decision: revokedDecision })).toBe(false)

    const mismatch = evaluateBundlePublication({
      definition: WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
      authorizations: [withEvidence],
      locale: 'en-US',
      territory: 'US',
      deploymentCommercialNature: 'NON_COMMERCIAL',
    })
    expect(mismatch.publishable).toBe(false)
    expect(mismatch.errors.some((row) => /mismatch|SCOPE/i.test(row))).toBe(true)
  })

  it('warns on EVIDENCE_PENDING without blocking already-approved publish', () => {
    const pending = approveInstrumentAuthorization({
      record: draft(),
      actorUserId: 'admin-2',
    }).record
    expect(pending.status).toBe('EVIDENCE_PENDING')
    const decision = evaluateBundlePublication({
      definition: WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
      authorizations: [pending],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
    })
    expect(decision.publishable).toBe(true)
    expect(decision.warnings.some((row) => /EVIDENCE_PENDING/.test(row))).toBe(true)
  })

  it('keeps in-flight attempts finishable only until frozen deadline', () => {
    const deadline = resolveAttemptDeadline({
      unitFamily: 'SCALE',
      startedAt: '2026-09-01T00:00:00.000Z',
      campaignDeadlineAt: '2026-09-03T00:00:00.000Z',
    })
    expect(deadline.effectiveDeadlineAt).toBe('2026-09-03T00:00:00.000Z')
    expect(canFinishInFlightAttempt({
      frozenDeadlineAt: deadline.effectiveDeadlineAt,
      nowIso: '2026-09-02T12:00:00.000Z',
    })).toBe(true)
    expect(canFinishInFlightAttempt({
      frozenDeadlineAt: deadline.effectiveDeadlineAt,
      nowIso: '2026-09-04T00:00:00.000Z',
    })).toBe(false)
  })

  it('blocks private evidence asset IDOR for non-owner/non-admin', () => {
    const asset = {
      assetId: 'asset-1',
      sha256: 'b'.repeat(64),
      accessScope: 'PRIVATE' as const,
      ownerAdminUserId: 'admin-1',
    }
    expect(failCode(() => assertCanReadAuthorizationEvidenceAsAdmin({
      asset,
      actorUserId: 'teacher-1',
      actorRole: 'TEACHER',
    }))).toBe('AUTH_EVIDENCE_IDOR')
    expect(failCode(() => assertCanReadAuthorizationEvidenceAsAdmin({
      asset,
      actorUserId: 'admin-2',
      actorRole: 'ADMIN',
    }))).toBe('AUTH_EVIDENCE_IDOR')
    expect(() => assertCanReadAuthorizationEvidenceAsAdmin({
      asset,
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
    })).not.toThrow()
  })
})
