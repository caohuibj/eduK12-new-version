import { describe, expect, it, vi } from 'vitest'
import { planScaleInstrumentInstall, installScaleInstrument } from '../../modules/scale/onboarding/install'
import { scaleOnboardingBackfillPlanSchema } from '../../modules/scale/onboarding/backfill'
import { activateScaleDeploymentRevision } from '../../modules/scale/deployment/repository'
import { hashScaleDeploymentPolicy, type ScaleDeploymentPolicyV2 } from '../../modules/scale/policy/deployment'
import { getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'

const actor = { id: 'admin', platformRole: 'SYSTEM_ADMIN', isActive: true, isFrozen: false, expiresAt: null }
function input(key = 'academic_self_concept_biology_zh_cn') {
  const deploymentPolicy: ScaleDeploymentPolicyV2 = {
    schemaVersion: 2, revision: 1, locale: 'zh-CN', territory: 'CN', deploymentModes: ['STANDALONE'],
    runtimePolicyHash: getScaleInstrumentRuntimePolicy(key, '1.0.0')!.runtimePolicyHash,
    localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE',
  }
  return { instrumentKey: key, instrumentVersion: '1.0.0', actorUserId: 'admin', deploymentPolicy }
}
function mockDb(user: unknown = actor) {
  return {
    user: { findUnique: vi.fn(async () => user) },
    scale: { findUnique: vi.fn(async () => null) },
    assessmentReferenceSet: { findUnique: vi.fn(async () => null) },
    instrumentAuthorization: { findMany: vi.fn(() => { throw new Error('Retired license ledger must not be read') }) },
  }
}

describe('V2 install remains an authorized operation without a license ledger', () => {
  it('plans an exact existing instrument without license storage or reads', async () => {
    const db = mockDb(), plan = await planScaleInstrumentInstall(db as never, input())
    expect(plan).toMatchObject({ createScale: true, allowActivation: true, blockers: [] })
    expect(db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
  })
  it.each([null, { ...actor, platformRole: 'USER' }, { ...actor, isActive: false }, { ...actor, isFrozen: true }, { ...actor, expiresAt: new Date('2000-01-01') }])('retains active system administrator authority: %j', async user => {
    const plan = await planScaleInstrumentInstall(mockDb(user) as never, input())
    expect(plan.allowActivation).toBe(false)
    expect(plan.blockers).toContain('SYSTEM_ADMIN_REQUIRED')
  })
  it('retains scientific territory independently of copyright terms', async () => {
    const request = input('academic_self_concept_chemistry_zh_cn')
    request.deploymentPolicy.territory = 'US'
    const plan = await planScaleInstrumentInstall(mockDb() as never, request)
    expect(plan.allowActivation).toBe(false)
    expect(plan.blockers).toContain('SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH')
  })
  it('rejects legacy V1 new writes before touching a database; backfill also requires V2', async () => {
    const request = input(), legacy = { ...request, deploymentPolicy: { ...request.deploymentPolicy, schemaVersion: 1, commercialNature: 'NON_COMMERCIAL', requiredRightsActions: ['display'], authorizationRefs: ['old-license'] } }
    const db = new Proxy({}, { get() { throw new Error('Database must not be touched') } })
    await expect(installScaleInstrument(db as never, legacy as never)).rejects.not.toThrow('Database must not be touched')
    const entry = { instrumentKey: legacy.instrumentKey, instrumentVersion: legacy.instrumentVersion, deploymentPolicy: legacy.deploymentPolicy }
    const parsed = scaleOnboardingBackfillPlanSchema.safeParse({ schemaVersion: 1, actorUserId: 'admin', entries: [entry] })
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: ['entries', 0, 'deploymentPolicy', 'schemaVersion'] }))
    expect(scaleOnboardingBackfillPlanSchema.safeParse({ schemaVersion: 1, actorUserId: 'admin', entries: [{ ...entry, deploymentPolicy: request.deploymentPolicy }] }).success).toBe(true)
  })
  it('persists a V2 deployment without writing the old authorization_refs column', async () => {
    const policy = input().deploymentPolicy
    const row = { id: 'deployment', scaleId: 'scale', revision: 1, status: 'ACTIVE', policyJson: policy, policyHash: hashScaleDeploymentPolicy(policy), authorizationRefs: [], createdByUserId: 'admin', createdAt: new Date(), activatedAt: new Date(), retiredAt: null }
    const db = { $queryRaw: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]), $executeRaw: vi.fn(async (_query: unknown) => 1) }
    expect(await activateScaleDeploymentRevision({ db: db as never, id: 'deployment', scaleId: 'scale', policy, createdByUserId: 'admin' })).toMatchObject({ created: true, deployment: { policy } })
    const insert = db.$executeRaw.mock.calls.map(([sql]) => String((sql as any).strings.join(' '))).find(sql => sql.includes('INSERT INTO'))!
    expect(insert).toBeTruthy()
    expect(insert).not.toContain('authorization_refs')
  })
})
