import { describe, expect, it, vi } from 'vitest'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { planStandardScalePublication } from '../../modules/scale/onboarding/publish'

const key = 'academic_self_concept_physics_zh_cn'
vi.mock('../../modules/scale/onboarding/instrument-registry', async importOriginal => {
  const actual = await importOriginal<typeof import('../../modules/scale/onboarding/instrument-registry')>()
  return { ...actual, getScaleInstrumentSource: (key: string, version: string) => {
    const source = actual.getScaleInstrumentSource(key, version)
    if (!source) return undefined
    const fixture = structuredClone(source)
    fixture.instruction = { schemaVersion: 1, text: '请选择对应选项。', language: 'zh-CN', version: 'synthetic-1', source: 'Synthetic publication fixture' }
    delete fixture.scientificReview
    fixture.localization!.reviewStatus = 'PENDING'
    fixture.localization!.expertReviewStatus = 'PENDING'
    fixture.localization!.sourceLocale = 'en'
    fixture.localization!.adaptationMethod = 'DIRECT_TRANSLATION'
    fixture.executable!.definition.license = { status: 'unknown', redistribution: 'restricted' }
    return fixture
  } }
})
vi.mock('../../modules/scale/deployment/repository', () => ({
  readActiveScaleDeployment: async () => ({ revision: 1, policyHash: 'a'.repeat(64), policy: {
    schemaVersion: 2, revision: 1, locale: 'zh-CN', territory: 'US', deploymentModes: ['STANDALONE'],
    runtimePolicyHash: getScaleInstrumentRuntimePolicy(key, '1.0.0')!.runtimePolicyHash,
    localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE',
  } }),
  readScaleDeploymentRevision: async () => null,
}))
const input = { instrumentKey: key, instrumentVersion: '1.0.0', actorUserId: 'synthetic-admin', visibility: 'PUBLIC' as const, allowedProducts: ['SURVEY' as const] }
const db = (isAdmin = true) => {
  const source = getScaleInstrumentSource(key, '1.0.0')!
  const definition = source.executable!.definition
  return {
    user: { findUnique: vi.fn(async () => ({ platformRole: isAdmin ? 'SYSTEM_ADMIN' : 'USER', isActive: true, isFrozen: false, expiresAt: null })) },
    scale: { findUnique: vi.fn(async () => ({ id: 'synthetic-scale', instrumentClass: 'STANDARD', instrumentVersion: '1.0.0', definition, definitionHash: hashScaleDefinition(definition), status: 'DRAFT', visibility: 'HIDDEN' })) },
    assessmentReferenceSet: { findUnique: vi.fn(async () => ({ definition: source.executable!.references[0], status: source.executable!.references[0].status })) },
  }
}
describe('explicit STANDARD publication with manual scientific and rights diagnostics', () => {
  it('retains unqualified research and unknown/restricted rights in the preview proof without granting scientific approval', async () => {
    const plan = await planStandardScalePublication(db() as never, input)
    expect(plan.allowPublish).toBe(true)
    expect(plan.proof.qualification.researchReady.eligible).toBe(false)
    expect(plan.proof.manualReview.rights).toEqual({ status: 'unknown', redistribution: 'restricted' })
    expect(plan.proof.manualReview.localization).toContain('LOCALIZATION_REVIEW_PENDING')
  })
  it('continues to require real administrator authority and a current publication proof', async () => {
    expect((await planStandardScalePublication(db(false) as never, input)).blockers).toContain('SYSTEM_ADMIN_REQUIRED')
    const stale = await planStandardScalePublication(db() as never, { ...input, expectedProofHash: '0'.repeat(64) })
    expect(stale.allowPublish).toBe(false)
    expect(stale.blockers).toContain('PUBLICATION_PREVIEW_STALE')
  })
})
