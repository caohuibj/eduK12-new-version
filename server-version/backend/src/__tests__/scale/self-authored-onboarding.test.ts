import { describe, expect, it, vi } from 'vitest'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { registeredSelfAuthoredSourceProof, registeredSelfAuthoredDeploymentTerritory } from '../../modules/scale/onboarding/self-authored'
import { planScaleInstrumentInstall } from '../../modules/scale/onboarding/install'
import { planStandardScalePublication } from '../../modules/scale/onboarding/publish'
import { resolveScaleStartDeployment } from '../../modules/scale/deployment/service'
import { readManagedScaleSourceRights } from '../../modules/scale/measurement-source'
import { recheckCatalogScaleSourceExpiry } from '../../modules/survey/catalog.sources'
import { hashScaleDeploymentPolicy, type ScaleDeploymentPolicyV2 } from '../../modules/scale/policy/deployment'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'

const key = 'academic_self_concept_chinese_zh_cn', version = '1.0.0'
const source = getScaleInstrumentSource(key, version)!, runtime = getScaleInstrumentRuntimePolicy(key, version)!
const policy: ScaleDeploymentPolicyV2 = { schemaVersion: 2, revision: 1, locale: 'zh-CN', territory: 'ZZ',
  deploymentModes: ['STANDALONE', 'QUESTIONNAIRE'],
  runtimePolicyHash: runtime.runtimePolicyHash,
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
  it('rejects the known scientific territory mismatch in the install plan before creating a deployment', async () => {
    const reviewedKey = 'academic_self_concept_mathematics_zh_cn'
    const reviewedRuntime = getScaleInstrumentRuntimePolicy(reviewedKey, version)!
    const db = database()
    const reviewedInput = { ...input, instrumentKey: reviewedKey, deploymentPolicy: { ...policy,
      runtimePolicyHash: reviewedRuntime.runtimePolicyHash } }
    const wrong = await planScaleInstrumentInstall(db as any, reviewedInput)
    expect(wrong.allowActivation).toBe(false)
    expect(wrong.blockers).toContain('SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH')
    const correct = await planScaleInstrumentInstall(db as any, { ...reviewedInput, deploymentPolicy: { ...reviewedInput.deploymentPolicy, territory: 'CN' } })
    expect(correct).toMatchObject({ createScale: true, allowActivation: true, blockers: [] })
  })
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
    const oldPolicy = { ...policy, runtimePolicyHash: reviewedRuntime.runtimePolicyHash }
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
    expect(revised).not.toHaveProperty('authorizationRefs')
    expect(reviewed.catalog.scientificMaturity).toBe('RESEARCH_READY')
  })
  it('reaches managed starts but still rejects unpublished scales and missing active deployments', async () => {
    const db = database(true)
    expect(await resolveScaleStartDeployment({ db: db as any, scale, requestedMode: 'STANDALONE' })).toMatchObject({ kind: 'MANAGED_V2', allowNewStarts: true })
    expect(await resolveScaleStartDeployment({ db: db as any, scale: { ...scale, status: 'DEPRECATED' } })).toMatchObject({ allowNewStarts: false })
    db.$queryRaw.mockResolvedValue([])
    expect(await resolveScaleStartDeployment({ db: db as any, scale })).toMatchObject({ allowNewStarts: false, reasons: ['DEPLOYMENT_BINDING_MISSING'] })
  })
  it('carries deployment identity through Training/Survey without fictitious authorship or license proof', async () => {
    const db = database(true)
    const receipt = await readManagedScaleSourceRights(db as any, scale as any, new Date())
    expect(receipt).toMatchObject({ basis: 'DEPLOYMENT_IDENTITY', deploymentPolicyHash: deployment.policyHash })
    expect(receipt).not.toHaveProperty('authorization');expect(receipt).not.toHaveProperty('sourceHash');expect(receipt).not.toHaveProperty('validTo')
    const query=db.$queryRaw.getMockImplementation()!
    db.$queryRaw.mockImplementation(async(q:any)=>q.strings?.join(' ').includes('clock_timestamp')?[{now:new Date()}] as any:query(q))
    const expiryDb = {...db,scale:{findFirst:vi.fn(async()=>scale)}}
    const snapshot: any = { ref: { kind: 'SCALE', sourceId:scale.id,sourceVersion: version }, provenance: { instrumentClass: 'STANDARD', code: key, sourceDeploymentIdentity: receipt } }
    await expect(recheckCatalogScaleSourceExpiry(expiryDb as any, [snapshot])).resolves.toBeUndefined()
    snapshot.provenance.sourceDeploymentIdentity = { ...receipt, runtimePolicyHash: '0'.repeat(64) }
    await expect(recheckCatalogScaleSourceExpiry(expiryDb as any, [snapshot])).resolves.toBeUndefined()
    expect(expiryDb.scale.findFirst).not.toHaveBeenCalled()
    expect(db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
  })
})
