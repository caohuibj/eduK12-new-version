import { describe, expect, it } from 'vitest'
import { approveInstrumentAuthorization, createInstrumentAuthorizationDraft, resolveEffectiveAuthorization } from '../../modules/assessment-authorization'
import { getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { previewScaleInstrument } from '../../modules/scale/onboarding/preview'
import { evaluateDurableInstrumentRights } from '../../modules/scale/deployment/rights'

const nowIso = '2026-09-21T00:00:00.000Z'
const approved = () => approveInstrumentAuthorization({ record: createInstrumentAuthorizationDraft({
  instrumentKey: 'who5', instrumentVersion: '1.0.0', grantor: 'test', grantee: 'test',
  scope: { electronicAdministration: true, scoring: true, display: true, translation: true, territories: ['CN'], locales: ['zh-CN'], commercialNature: 'NON_COMMERCIAL' },
  validFrom: '2026-01-01T00:00:00.000Z', validTo: '2027-01-01T00:00:00.000Z', basis: 'test', createdByUserId: 'author', now: nowIso,
}), actorUserId: 'reviewer', now: nowIso }).record

describe('PR1–4 governance review regressions', () => {
  it('blocks revoked lineage fallback in shared diagnostics but preserves independent grants and newer drafts', () => {
    const grant = approved()
    const revoked = { ...grant, version: 2, status: 'REVOKED' as const }
    const input = { instrumentKey: 'who5', instrumentVersion: '1.0.0', nowIso }
    expect(resolveEffectiveAuthorization({ ...input, authorizations: [grant, revoked] })?.status).toBe('REVOKED')
    expect(evaluateDurableInstrumentRights({ ...input, locale: 'zh-CN', territory: 'CN', authorizations: [grant, revoked] }).ok).toBe(false)
    expect(resolveEffectiveAuthorization({ ...input, authorizations: [grant, { ...revoked, status: 'DRAFT' }] })).toEqual(grant)
    const independent = { ...grant, authorizationId: 'independent' }
    expect(resolveEffectiveAuthorization({ ...input, authorizations: [grant, revoked, independent] })).toEqual(independent)
  })

  it('never allows activation of a draft, retired executable or empty mode preview', () => {
    const source = structuredClone(getScaleInstrumentSource('who5', '1.0.0')!)
    const input = { source, authorizations: [approved()], locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL' as const, deploymentModes: ['STANDALONE' as const], nowIso }
    expect(previewScaleInstrument(input).allowActivation).toBe(true)
    for (const status of ['DRAFT', 'RETIRED'] as const) {
      source.executable!.releaseStatus = status
      expect(previewScaleInstrument(input)).toMatchObject({ allowActivation: false, blockers: expect.arrayContaining(['EXECUTABLE_NOT_PUBLISHED']) })
    }
    source.executable!.releaseStatus = 'PUBLISHED'
    expect(previewScaleInstrument({ ...input, deploymentModes: [] })).toMatchObject({ allowActivation: false, blockers: expect.arrayContaining(['DEPLOYMENT_MODES_MISSING']) })
  })
})
