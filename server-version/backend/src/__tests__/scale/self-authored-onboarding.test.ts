import { describe, expect, it, vi } from 'vitest'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { registeredSelfAuthoredSourceProof, registeredSelfAuthoredDeploymentTerritory } from '../../modules/scale/onboarding/self-authored'
import { planScaleInstrumentInstall } from '../../modules/scale/onboarding/install'
import { planStandardScalePublication } from '../../modules/scale/onboarding/publish'
import { resolveScaleStartDeployment } from '../../modules/scale/deployment/service'
import { readManagedScaleSourceRights } from '../../modules/scale/measurement-source'
import { recheckCatalogScaleSourceExpiry } from '../../modules/survey/catalog.sources'
import { hashScaleDeploymentPolicy, type ScaleDeploymentPolicyV1 } from '../../modules/scale/policy/deployment'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'

const key = 'academic_self_concept_chinese_zh_cn', version = '1.0.0'
const source = getScaleInstrumentSource(key, version)!, runtime = getScaleInstrumentRuntimePolicy(key, version)!
const policy: ScaleDeploymentPolicyV1 = { schemaVersion: 1, revision: 1, locale: 'zh-CN', territory: 'ZZ',
  deploymentModes: ['STANDALONE', 'QUESTIONNAIRE'], commercialNature: 'UNSPECIFIED',
  requiredRightsActions: ['electronicAdministration', 'scoring', 'display'], authorizationRefs: [],
  selfAuthoredSourceHash: registeredSelfAuthoredSourceProof(key, version)!, runtimePolicyHash: runtime.runtimePolicyHash,
  localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE' }
const scale = { id: 'authored-scale', code: key, instrumentVersion: version, instrumentClass: 'STANDARD' as const,
  status: 'PUBLISHED', visibility: 'HIDDEN', creatorId: 'system', definition: source.executable!.definition, definitionHash: hashScaleDefinition(source.executable!.definition) }
const deployment = { id: 'deployment', scaleId: scale.id, revision: 1, status: 'ACTIVE', policyJson: policy,
  policyHash: hashScaleDeploymentPolicy(policy), authorizationRefs: [], createdByUserId: 'system', createdAt: new Date(), activatedAt: new Date(), retiredAt: null }
function database(installed = false) {
  return {
    user: { findUnique: vi.fn(async () => ({ id: 'system', platformRole: 'SYSTEM_ADMIN', isActive: true, isFrozen: false, expiresAt: null })) },
    scale: { findUnique: vi.fn(async () => installed ? scale : null) },
    instrumentAuthorization: { findMany: vi.fn(async () => []) },
    assessmentReferenceSet: { findUnique: vi.fn(async (arg: any) => installed ? { definition: source.executable!.references.find(r => r.referenceVersion === arg.where.instrumentType_instrumentKey_referenceVersion.referenceVersion), status: 'ACTIVE' } : null) },
    $queryRaw: vi.fn(async () => installed ? [deployment] : []),
  }
}
const input = { instrumentKey: key, instrumentVersion: version, actorUserId: 'system', deploymentPolicy: policy }

describe('self-authored formal install, publication and consumption', () => {
  it('plans fresh installation without a fabricated authorization row, and checks the real system actor', async () => {
    const db = database()
    expect(await planScaleInstrumentInstall(db as any, input)).toMatchObject({ createScale: true, allowActivation: true, blockers: [] })
    db.user.findUnique.mockResolvedValue({ id: 'teacher', platformRole: 'TEACHER', isActive: true, isFrozen: false, expiresAt: null })
    expect((await planScaleInstrumentInstall(db as any, input)).blockers).toContain('SYSTEM_ADMIN_REQUIRED')
  })
  it('keeps installed definition and source identity immutable', async () => {
    const db = database(true), previous = structuredClone(scale)
    previous.definition.license.status = 'authorized'
    db.scale.findUnique.mockResolvedValue(previous)
    expect((await planScaleInstrumentInstall(db as any, input)).blockers).toContain('SCALE_DEFINITION_CONFLICT')
  })
  it('retains explicit publication proof, without replacing it with a source declaration', async () => {
    const db = database(true)
    const p = await planStandardScalePublication(db as any, { instrumentKey: key, instrumentVersion: version, actorUserId: 'system', visibility: 'HIDDEN' })
    expect(p).toMatchObject({ allowPublish: true, blockers: [] })
    expect(p.proof.sourceHash).toMatch(/^[a-f0-9]{64}$/)
    const stale = await planStandardScalePublication(db as any, { instrumentKey: key, instrumentVersion: version, actorUserId: 'system', visibility: 'HIDDEN', expectedProofHash: '0'.repeat(64) })
    expect(stale.blockers).toContain('PUBLICATION_PREVIEW_STALE')
  })
  it('retains scientific scope rejection and accepts a new reviewed CN deployment revision without external licenses', async () => {
    const reviewedKey = 'academic_self_concept_mathematics_zh_cn'
    const reviewed = getScaleInstrumentSource(reviewedKey, version)!, reviewedRuntime = getScaleInstrumentRuntimePolicy(reviewedKey, version)!
    const oldPolicy = { ...policy, selfAuthoredSourceHash: registeredSelfAuthoredSourceProof(reviewedKey, version)!, runtimePolicyHash: reviewedRuntime.runtimePolicyHash }
    const db = database(true)
    const reviewedScale = { ...scale, code: reviewedKey, definition: reviewed.executable!.definition, definitionHash: hashScaleDefinition(reviewed.executable!.definition) }
    db.scale.findUnique.mockResolvedValue(reviewedScale)
    db.assessmentReferenceSet.findUnique.mockImplementation(async (arg: any) => ({ definition: reviewed.executable!.references.find(r => r.referenceVersion === arg.where.instrumentType_instrumentKey_referenceVersion.referenceVersion), status: 'ACTIVE' }))
    db.$queryRaw.mockResolvedValue([{ ...deployment, policyJson: oldPolicy, policyHash: hashScaleDeploymentPolicy(oldPolicy) }])
    const publication = { instrumentKey: reviewedKey, instrumentVersion: version, actorUserId: 'system', visibility: 'HIDDEN' as const }
    expect((await planStandardScalePublication(db as any, publication)).blockers).toContain('SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH')
    const revised = { ...oldPolicy, revision: 2, territory: registeredSelfAuthoredDeploymentTerritory(reviewedKey, version)! }
    db.$queryRaw.mockResolvedValue([{ ...deployment, revision: 2, policyJson: revised, policyHash: hashScaleDeploymentPolicy(revised) }])
    expect(await planStandardScalePublication(db as any, publication)).toMatchObject({ allowPublish: true, blockers: [] })
    expect(revised.authorizationRefs).toEqual([])
    expect(reviewed.catalog.scientificMaturity).toBe('RESEARCH_READY')
  })
  it('reaches managed starts but still rejects unpublished scales and missing active deployments', async () => {
    const db = database(true)
    expect(await resolveScaleStartDeployment({ db: db as any, scale, requestedMode: 'STANDALONE' })).toMatchObject({ kind: 'MANAGED_V2', allowNewStarts: true })
    expect(await resolveScaleStartDeployment({ db: db as any, scale: { ...scale, status: 'DEPRECATED' } })).toMatchObject({ allowNewStarts: false })
    db.$queryRaw.mockResolvedValue([])
    expect(await resolveScaleStartDeployment({ db: db as any, scale })).toMatchObject({ allowNewStarts: false, reasons: ['DEPLOYMENT_BINDING_MISSING'] })
  })
  it('carries exact authored provenance through Training/legacy Survey source receipts, not fictitious license dates', async () => {
    const db = database(true)
    const receipt = await readManagedScaleSourceRights(db as any, scale as any, new Date())
    expect(receipt).toMatchObject({ basis: 'SELF_AUTHORED_SOURCE', sourceHash: policy.selfAuthoredSourceHash, authorization: null, validFrom: null, validTo: null })
    const expiryDb = { $queryRaw: vi.fn(async () => [{ now: new Date() }]) }
    const snapshot: any = { ref: { kind: 'SCALE', sourceVersion: version }, provenance: { instrumentClass: 'STANDARD', code: key, sourceRights: receipt } }
    await expect(recheckCatalogScaleSourceExpiry(expiryDb as any, [snapshot])).resolves.toBeUndefined()
    snapshot.provenance.sourceRights = { ...receipt, sourceHash: '0'.repeat(64) }
    await expect(recheckCatalogScaleSourceExpiry(expiryDb as any, [snapshot])).rejects.toThrow('SOURCE_SCALE_AUTHORSHIP_CHANGED')
    snapshot.provenance.sourceRights = { validFrom: '2020-01-01', validTo: '2021-01-01' }
    await expect(recheckCatalogScaleSourceExpiry(expiryDb as any, [snapshot])).rejects.toThrow('SOURCE_SCALE_LICENSE_EXPIRED')
  })
})
