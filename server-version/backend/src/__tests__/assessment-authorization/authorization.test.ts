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
  parseInstrumentAuthorizationRecord,
  resolveAttemptDeadline,
  resolveEffectiveAuthorization,
  revokeAuthorizationLineage,
  revokeInstrumentAuthorization,
} from '../../modules/assessment-authorization'
import type { AssessmentBundleDefinitionV1 } from '../../modules/assessment-bundle/types'

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

const publishedWho5 = (): AssessmentBundleDefinitionV1 => ({
  ...WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
  status: 'PUBLISHED',
})

const passingProofs = {
  scientificOk: true,
  languageOk: true,
  reportOk: true,
  goldenOk: true,
} as const

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
      definition: publishedWho5(),
      authorizations: [withEvidence],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      ...passingProofs,
    })
    expect(ok.publishable).toBe(true)
    expect(ok.catalogStatus).toBe('PUBLISHED')
    expect(canStartNewAttempt({ decision: ok })).toBe(true)

    const commercialBlocked = evaluateBundlePublication({
      definition: publishedWho5(),
      authorizations: [withEvidence],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'COMMERCIAL',
      ...passingProofs,
    })
    expect(commercialBlocked.publishable).toBe(false)
    expect(commercialBlocked.errors.some((row) => /NON_COMMERCIAL/.test(row))).toBe(true)

    const revoked = revokeInstrumentAuthorization({
      record: withEvidence,
      actorUserId: 'admin-2',
      note: 'revoked',
    }).record
    const revokedDecision = evaluateBundlePublication({
      definition: publishedWho5(),
      authorizations: [revoked],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      ...passingProofs,
    })
    expect(revokedDecision.publishable).toBe(false)
    expect(revokedDecision.catalogStatus).toBe('HOLD')
    expect(canStartNewAttempt({ decision: revokedDecision })).toBe(false)

    const mismatch = evaluateBundlePublication({
      definition: publishedWho5(),
      authorizations: [withEvidence],
      locale: 'en-US',
      territory: 'US',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      ...passingProofs,
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
      definition: publishedWho5(),
      authorizations: [pending],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      ...passingProofs,
    })
    expect(decision.publishable).toBe(true)
    expect(decision.warnings.some((row) => /EVIDENCE_PENDING/.test(row))).toBe(true)
  })

  it('fail-closes required gates when proofs are undefined and never fakes pass', () => {
    const pending = approveInstrumentAuthorization({
      record: draft(),
      actorUserId: 'admin-2',
    }).record
    const decision = evaluateBundlePublication({
      definition: publishedWho5(),
      authorizations: [pending],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
    })
    expect(decision.publishable).toBe(false)
    expect(decision.gates.filter((gate) => gate.evaluation === 'pending').length).toBeGreaterThan(0)
    expect(decision.errors.some((row) => /pending|not evaluated/i.test(row))).toBe(true)
  })

  it('cannot publish when code definition is DRAFT even if rights pass', () => {
    const pending = approveInstrumentAuthorization({
      record: draft(),
      actorUserId: 'admin-2',
    }).record
    const decision = evaluateBundlePublication({
      definition: WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1,
      authorizations: [pending],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      ...passingProofs,
    })
    expect(WELLBEING_WHO5_YOUTH_SELF_ZH_CN_V1.status).toBe('DRAFT')
    expect(decision.publishable).toBe(false)
    expect(decision.catalogStatus).toBe('DRAFT')
    expect(decision.errors.some((row) => /code definition status/i.test(row))).toBe(true)
  })

  it('keeps effective APPROVED alive when a newer DRAFT exists on the same lineage', () => {
    const approved = approveInstrumentAuthorization({
      record: draft(),
      actorUserId: 'admin-2',
    }).record
    const withEvidence = attachAuthorizationEvidence({
      record: approved,
      evidenceAssetId: 'asset-1',
      evidenceSha256: 'a'.repeat(64),
      actorUserId: 'admin-2',
    }).record
    const newerDraft = amendApprovedInstrumentAuthorization({
      previous: withEvidence,
      patch: { basis: 'pending amendment' },
      actorUserId: 'admin-2',
    }).record
    expect(newerDraft.status).toBe('DRAFT')
    expect(newerDraft.version).toBe(2)

    const effective = resolveEffectiveAuthorization({
      authorizations: [withEvidence, newerDraft],
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      nowIso: '2026-09-03T05:00:00.000Z',
    })
    expect(effective?.version).toBe(1)
    expect(effective?.status).toBe('APPROVED')

    const decision = evaluateBundlePublication({
      definition: publishedWho5(),
      authorizations: [withEvidence, newerDraft],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      ...passingProofs,
    })
    expect(decision.publishable).toBe(true)
  })

  it('does not HOLD everything merely because some historical row is EXPIRED', () => {
    const approved = approveInstrumentAuthorization({
      record: draft(),
      actorUserId: 'admin-2',
    }).record
    const withEvidence = attachAuthorizationEvidence({
      record: approved,
      evidenceAssetId: 'asset-1',
      evidenceSha256: 'a'.repeat(64),
      actorUserId: 'admin-2',
    }).record
    const expiredHistorical = {
      ...withEvidence,
      authorizationId: '00000000-0000-4000-8000-000000000099',
      version: 1,
      status: 'APPROVED' as const,
      validFrom: '2020-01-01T00:00:00.000Z',
      validTo: '2021-01-01T00:00:00.000Z',
    }
    const decision = evaluateBundlePublication({
      definition: publishedWho5(),
      authorizations: [expiredHistorical, withEvidence],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      nowIso: '2026-09-03T05:00:00.000Z',
      ...passingProofs,
    })
    expect(decision.publishable).toBe(true)
  })

  it('rejects DRAFT authorizations for rights eligibility', () => {
    const created = draft()
    const decision = evaluateBundlePublication({
      definition: publishedWho5(),
      authorizations: [created],
      locale: 'zh-CN',
      territory: 'CN',
      deploymentCommercialNature: 'NON_COMMERCIAL',
      ...passingProofs,
    })
    expect(decision.publishable).toBe(false)
    expect(decision.errors.some((row) => /DRAFT/i.test(row))).toBe(true)
  })

  it('parses records through strict Zod schema', () => {
    const created = draft()
    expect(parseInstrumentAuthorizationRecord(created).authorizationId).toBe(created.authorizationId)
    expect(failCode(() => parseInstrumentAuthorizationRecord({ ...created, schemaVersion: 99 }))).toBe('AUTH_RECORD_INVALID')
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


  it('product revoke after amend stops prior APPROVED from remaining effective', () => {
    const draft = createInstrumentAuthorizationDraft({
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
      basis: 'test',
      createdByUserId: 'admin-1',
    })
    const withEvidence = attachAuthorizationEvidence({
      record: draft,
      evidenceAssetId: 'asset-1',
      evidenceSha256: 'a'.repeat(64),
      actorUserId: 'admin-1',
    })
    const approved = approveInstrumentAuthorization({
      record: withEvidence.record,
      actorUserId: 'admin-2',
    }).record
    expect(approved.status).toBe('APPROVED')
    expect(approved.version).toBe(1)

    const amended = amendApprovedInstrumentAuthorization({
      previous: approved,
      patch: { basis: 'amended scope note' },
      actorUserId: 'admin-1',
    }).record
    expect(amended.status).toBe('DRAFT')
    expect(amended.version).toBe(2)

    // Without lineage revoke, v1 APPROVED would still resolve as effective.
    const before = resolveEffectiveAuthorization({
      authorizations: [approved, amended],
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      nowIso: '2026-06-01T00:00:00.000Z',
    })
    expect(before?.version).toBe(1)
    expect(before?.status).toBe('APPROVED')

    const revoked = revokeAuthorizationLineage({
      lineage: [approved, amended],
      actorUserId: 'admin-1',
      note: 'revoke latest after amend',
    })
    expect(revoked.records.every((row) => row.status === 'REVOKED')).toBe(true)

    const after = resolveEffectiveAuthorization({
      authorizations: revoked.records,
      instrumentKey: 'who5',
      instrumentVersion: '1.0.0',
      nowIso: '2026-06-01T00:00:00.000Z',
    })
    // Newest row is REVOKED; no eligible APPROVED remains.
    expect(after === null || after.status === 'REVOKED' || !['APPROVED', 'EVIDENCE_PENDING'].includes(after.status)).toBe(true)
    if (after && (after.status === 'APPROVED' || after.status === 'EVIDENCE_PENDING')) {
      throw new Error('expected no effective APPROVED after lineage revoke')
    }
  })


  it('EVIDENCE_PENDING first attach OK; post-APPROVED evidence change mints new version', () => {
    const created = draft()
    const pending = approveInstrumentAuthorization({
      record: created,
      actorUserId: 'admin-1',
      selfApprovalDeclaration: 'I confirm self-approval of this authorization scope.',
    }).record
    expect(pending.status).toBe('EVIDENCE_PENDING')

    const first = attachAuthorizationEvidence({
      record: pending,
      evidenceAssetId: 'asset-1',
      evidenceSha256: 'a'.repeat(64),
      actorUserId: 'admin-1',
    })
    expect(first.mintedNewVersion).toBe(false)
    expect(first.record.status).toBe('APPROVED')
    expect(first.record.version).toBe(1)

    const replaced = attachAuthorizationEvidence({
      record: first.record,
      evidenceAssetId: 'asset-2',
      evidenceSha256: 'b'.repeat(64),
      actorUserId: 'admin-1',
    })
    expect(replaced.mintedNewVersion).toBe(true)
    expect(replaced.record.version).toBe(2)
    expect(replaced.record.evidenceAssetId).toBe('asset-2')
    expect(replaced.record.status).toBe('APPROVED')
  })

})
